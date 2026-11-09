/**
 * Media picker: choose an image or video from the device (native picker / gallery) or from the internal media library,
 * preview it, set how an image is framed, then confirm. Files are copied into persistent storage (IndexedDB).
 */
import { h, clear } from '../dom';
import { icon } from '../icons';
import { modal, btn, toast, busy } from '../overlay';
import { repo } from '../../store/repo';
import { importMedia, mediaUrl, MediaError, type Imported } from '../../store/media';
import { describeError } from '../../store/idb';
import type { Fit, MediaKind, MediaMeta, MediaRef } from '../../model/types';
import { fmtBytes, fmtDuration } from '../../core/util';
import { playCutscene } from './cutscene';

export interface PickOpts {
  title: string;
  current?: MediaRef | null;
  /** Width / height of the frame the image will be shown in (cards are 5/7). */
  aspect?: number;
}

/** Opens the native file chooser. Resolves with the chosen files (empty if cancelled). */
export function chooseFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((res) => {
    const input = h('input', { type: 'file', accept, style: 'position:fixed;left:-9999px;opacity:0' }) as HTMLInputElement;
    input.multiple = multiple;
    let done = false;
    input.addEventListener('change', () => {
      done = true;
      res(input.files ? [...input.files] : []);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      if (!done) res([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

function infoLine(m: { width: number; height: number; size: number; duration: number; mime: string; kind: MediaKind }): string {
  const parts = [m.width && m.height ? `${m.width} × ${m.height}px` : null, fmtBytes(m.size), m.kind === 'video' ? fmtDuration(m.duration) : null, m.mime.split('/')[1]?.toUpperCase()];
  return parts.filter(Boolean).join(' · ');
}

export function pickMedia(kind: MediaKind, o: PickOpts): Promise<MediaRef | null | undefined> {
  return new Promise((resolve) => {
    let result: MediaRef | null | undefined = undefined;
    let pendingImport: Imported | null = null;
    let pendingUrl: string | null = null;
    let chosenLibrary: MediaMeta | null = null;
    let fit: Fit = o.current?.fit ?? 'contain';
    let fx = o.current?.x ?? 50, fy = o.current?.y ?? 50;
    const aspect = o.aspect ?? 5 / 7;

    const body = h('div', { class: 'picker' });
    const tabs = h('div', { class: 'seg' });
    const pane = h('div', { class: 'picker-pane' });
    body.append(tabs, pane);

    const cleanupPending = (): void => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      pendingUrl = null;
      pendingImport = null;
    };

    const confirmBtn = btn(kind === 'image' ? 'Use this image' : 'Use this video', () => void confirm(), 'primary', 'check');
    confirmBtn.disabled = true;
    const removeBtn = o.current ? btn('Remove', () => { result = null; m.close(); }, 'ghost danger-text', 'trash') : null;

    const preview = h('div', { class: 'picker-preview' });
    const framing = h('div', { class: 'picker-framing' });

    const renderPreview = (src: string | null, meta: Pick<MediaMeta, 'width' | 'height' | 'size' | 'duration' | 'mime' | 'kind' | 'name'> | null, warning?: string): void => {
      clear(preview);
      clear(framing);
      if (!src || !meta) {
        preview.appendChild(h('div', { class: 'picker-empty' }, icon(kind), h('span', null, 'Nothing selected yet')));
        confirmBtn.disabled = true;
        return;
      }
      confirmBtn.disabled = false;
      if (kind === 'image') {
        const frame = h('div', { class: `fimg fit-${fit} picker-frame`, style: { 'aspect-ratio': String(aspect), '--fx': `${fx}%`, '--fy': `${fy}%` } });
        if (fit === 'contain') frame.appendChild(h('img', { class: 'fimg-bg', src, alt: '' }));
        frame.appendChild(h('img', { class: 'fimg-fg', src, alt: '' }));
        if (fit === 'cover') {
          const dot = h('i', { class: 'focal', style: { left: `${fx}%`, top: `${fy}%` } });
          frame.appendChild(dot);
          frame.addEventListener('pointerdown', (e) => {
            const set = (ev: PointerEvent): void => {
              const r = frame.getBoundingClientRect();
              fx = Math.round(Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)));
              fy = Math.round(Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100)));
              frame.style.setProperty('--fx', `${fx}%`);
              frame.style.setProperty('--fy', `${fy}%`);
              dot.style.left = `${fx}%`;
              dot.style.top = `${fy}%`;
            };
            set(e);
            frame.setPointerCapture(e.pointerId);
            frame.onpointermove = (ev) => set(ev);
            frame.onpointerup = () => { frame.onpointermove = null; };
          });
        }
        const full = h('div', { class: 'picker-full' }, h('img', { src, alt: '' }));
        preview.append(h('div', { class: 'picker-previews' },
          h('figure', null, frame, h('figcaption', null, 'In the frame')),
          h('figure', null, full, h('figcaption', null, 'Whole image'))));
        const seg = h('div', { class: 'seg small' },
          h('button', { class: fit === 'contain' ? 'on' : '', on: { click: () => { fit = 'contain'; renderPreview(src, meta, warning); } } }, 'Show whole image'),
          h('button', { class: fit === 'cover' ? 'on' : '', on: { click: () => { fit = 'cover'; renderPreview(src, meta, warning); } } }, 'Fill the frame'));
        framing.append(h('label', { class: 'lbl' }, 'Framing'), seg,
          h('p', { class: 'hint' }, fit === 'contain'
            ? 'The entire image is always visible, whatever its size or shape. Empty space is filled with a soft blurred copy.'
            : 'The image fills the frame. Tap or drag on the framed preview to choose the focal point.'));
      } else {
        const vid = h('video', { class: 'picker-video', src, controls: true, playsinline: true, preload: 'metadata' }) as HTMLVideoElement;
        vid.setAttribute('playsinline', '');
        vid.setAttribute('webkit-playsinline', '');
        preview.appendChild(vid);
      }
      preview.appendChild(h('p', { class: 'picker-info' }, h('strong', null, meta.name), ' · ', infoLine(meta)));
      if (warning) preview.appendChild(h('div', { class: 'notice warn' }, icon('warn'), h('span', null, warning)));
    };

    const deviceTab = (): void => {
      clear(pane);
      const choose = h('button', { class: 'dropzone', type: 'button' },
        icon(kind === 'image' ? 'image' : 'video', 'ic big'),
        h('strong', null, kind === 'image' ? 'Choose an image from your device' : 'Choose a video from your device'),
        h('small', null, kind === 'image'
          ? 'Any size and shape: JPG, PNG, WebP, GIF… Large images are kept at full resolution.'
          : 'MP4 (H.264 + AAC) plays everywhere. WebM and MOV work where the browser supports them.'));
      const handle = async (files: File[]): Promise<void> => {
        const f = files[0];
        if (!f) return;
        const b = busy(kind === 'image' ? 'Reading image…' : 'Reading video…');
        try {
          cleanupPending();
          chosenLibrary = null;
          const imp = await importMedia(f, kind);
          pendingImport = imp;
          pendingUrl = URL.createObjectURL(imp.blob);
          renderPreview(pendingUrl, imp.meta, imp.warning);
        } catch (e) {
          toast(e instanceof MediaError ? e.message : `Could not read the file: ${(e as Error).message}`, 'err', 6000);
        } finally {
          b.close();
        }
      };
      choose.addEventListener('click', () => void chooseFiles(kind === 'image' ? 'image/*' : 'video/*').then(handle));
      choose.addEventListener('dragover', (e) => { e.preventDefault(); choose.classList.add('over'); });
      choose.addEventListener('dragleave', () => choose.classList.remove('over'));
      choose.addEventListener('drop', (e) => {
        e.preventDefault();
        choose.classList.remove('over');
        void handle([...(e.dataTransfer?.files ?? [])]);
      });
      pane.append(choose, preview, framing);
      if (!pendingImport && !chosenLibrary && o.current) void showCurrent();
      else if (!pendingImport && !chosenLibrary) renderPreview(null, null);
    };

    const showCurrent = async (): Promise<void> => {
      const meta = repo.mediaMeta(o.current?.id);
      if (!meta) { renderPreview(null, null); return; }
      chosenLibrary = meta;
      const u = await mediaUrl(meta, 'full');
      renderPreview(u, meta);
    };

    const libraryTab = (): void => {
      clear(pane);
      const items = [...repo.media.values()].filter((m) => m.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
      if (!items.length) {
        pane.appendChild(h('div', { class: 'picker-empty tall' }, icon('library'), h('span', null, `No ${kind}s in the library yet. Choose one from your device.`)));
        return;
      }
      const grid = h('div', { class: 'lib-grid' });
      for (const it of items) {
        const cell = h('button', { class: `lib-cell ${chosenLibrary?.id === it.id ? 'on' : ''}`, type: 'button', title: it.name });
        const thumb = h('div', { class: 'fimg fit-cover' });
        const img = h('img', { class: 'fimg-fg', alt: '' }) as HTMLImageElement;
        if (it.kind === 'image' || it.hasThumb) {
          thumb.appendChild(img);
          void mediaUrl(it, 'thumb').then((u) => { if (u) img.src = u; });
        } else thumb.appendChild(h('div', { class: 'fimg-empty' }, icon('video')));
        cell.append(thumb, h('small', null, it.name));
        cell.addEventListener('click', async () => {
          cleanupPending();
          chosenLibrary = it;
          for (const c of grid.children) c.classList.remove('on');
          cell.classList.add('on');
          const u = await mediaUrl(it, 'full');
          renderPreview(u, it);
          if (kind === 'video' && it.playable === false) {
            preview.appendChild(h('div', { class: 'notice warn' }, icon('warn'), h('span', null, 'This browser could not play this video when it was imported.')));
          }
        });
        grid.appendChild(cell);
      }
      pane.append(grid, preview, framing);
      if (chosenLibrary) void mediaUrl(chosenLibrary, 'full').then((u) => renderPreview(u, chosenLibrary));
      else renderPreview(null, null);
    };

    const setTab = (t: 'device' | 'library'): void => {
      for (const b of tabs.children) b.classList.toggle('on', (b as HTMLElement).dataset.t === t);
      t === 'device' ? deviceTab() : libraryTab();
    };
    tabs.append(
      h('button', { dataset: { t: 'device' }, on: { click: () => setTab('device') } }, icon('upload'), 'From device'),
      h('button', { dataset: { t: 'library' }, on: { click: () => setTab('library') } }, icon('library'), 'Media library'));

    const confirm = async (): Promise<void> => {
      let id: string | null = null;
      if (pendingImport) {
        const b = busy('Saving to the game storage…');
        try {
          const meta = await repo.addMedia(pendingImport);
          id = meta.id;
        } catch (e) {
          toast(`Could not save the file: ${describeError((e as any)?.cause ?? e)}`, 'err', 7000);
          return;
        } finally {
          b.close();
        }
      } else if (chosenLibrary) id = chosenLibrary.id;
      if (!id) return;
      result = kind === 'image' ? { id, fit, x: fx, y: fy } : { id };
      m.close();
    };

    const m = modal({
      title: o.title,
      cls: 'modal-lg',
      content: body,
      actions: [removeBtn, h('span', { class: 'grow' }), btn('Cancel', () => m.close(), 'ghost'), confirmBtn].filter(Boolean) as Node[],
      onClose: () => {
        cleanupPending();
        resolve(result);
      },
    });
    setTab('device');
  });
}

/** Inline media field used by the database editors: preview + choose/replace/remove + play. */
export function mediaField(o: {
  label: string; kind: MediaKind; value: MediaRef | null; required?: boolean; aspect?: number; hint?: string; error?: string;
  onChange: (v: MediaRef | null) => void; disabled?: boolean; disabledReason?: string;
}): HTMLElement {
  const meta = repo.mediaMeta(o.value?.id);
  const el = h('div', { class: `mfield ${o.error ? 'has-err' : ''} ${o.disabled ? 'disabled' : ''}` });
  const thumb = h('div', { class: 'mfield-thumb', style: { 'aspect-ratio': String(o.kind === 'image' ? o.aspect ?? 5 / 7 : 16 / 9) } });
  if (o.value && meta) {
    if (o.kind === 'image') {
      const fimg = h('div', { class: `fimg fit-${o.value.fit ?? 'contain'}`, style: { '--fx': `${o.value.x ?? 50}%`, '--fy': `${o.value.y ?? 50}%` } });
      const bg = h('img', { class: 'fimg-bg', alt: '' }) as HTMLImageElement;
      const fg = h('img', { class: 'fimg-fg', alt: '' }) as HTMLImageElement;
      if ((o.value.fit ?? 'contain') === 'contain') fimg.appendChild(bg);
      fimg.appendChild(fg);
      void mediaUrl(meta, 'thumb').then((u) => { if (u) { fg.src = u; bg.src = u; } });
      thumb.appendChild(fimg);
    } else {
      const poster = h('div', { class: 'fimg fit-contain' });
      if (meta.hasThumb) {
        const img = h('img', { class: 'fimg-fg', alt: '' }) as HTMLImageElement;
        poster.appendChild(img);
        void mediaUrl(meta, 'thumb').then((u) => { if (u) img.src = u; });
      } else poster.appendChild(h('div', { class: 'fimg-empty' }, icon('video')));
      const play = h('button', { class: 'mfield-play', type: 'button', 'aria-label': 'Play' }, icon('play'));
      play.addEventListener('click', () => void playCutscene(o.value!, { title: o.label }));
      thumb.append(poster, play);
    }
  } else if (o.value && !meta) {
    thumb.appendChild(h('div', { class: 'fimg-empty' }, icon('warn'), h('small', null, 'File missing')));
  } else {
    thumb.appendChild(h('div', { class: 'fimg-empty' }, icon(o.kind)));
  }
  const choose = btn(o.value ? 'Replace' : 'Choose', () => {
    if (o.disabled) return;
    void pickMedia(o.kind, { title: o.label, current: o.value, aspect: o.aspect }).then((r) => {
      if (r !== undefined) o.onChange(r);
    });
  }, 'small', o.value ? 'swap' : 'plus');
  if (o.disabled) choose.disabled = true;
  const actions = h('div', { class: 'mfield-actions' }, choose,
    o.value ? btn('Remove', () => o.onChange(null), 'small ghost', 'trash') : null);
  el.append(...[
    h('div', { class: 'mfield-head' }, h('label', { class: 'lbl' }, o.label, o.required ? h('em', { class: 'req' }, ' *') : h('span', { class: 'opt' }, ' optional'))),
    h('div', { class: 'mfield-row' }, thumb, h('div', { class: 'mfield-side' },
      meta ? h('small', { class: 'muted' }, infoLine(meta)) : null,
      meta && o.kind === 'video' && meta.playable === false ? h('small', { class: 'warn-text' }, 'Not playable in this browser') : null,
      o.hint ? h('small', { class: 'hint' }, o.hint) : null,
      o.disabled && o.disabledReason ? h('small', { class: 'hint' }, o.disabledReason) : null,
      actions)),
    o.error ? h('div', { class: 'field-err' }, icon('warn'), o.error) : null].filter((x): x is HTMLDivElement => !!x));
  return el;
}
