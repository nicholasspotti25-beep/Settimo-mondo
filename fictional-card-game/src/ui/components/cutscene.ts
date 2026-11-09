/**
 * Full-screen cutscene player that works on phones, tablets and desktops.
 * - Any video aspect ratio (landscape, portrait, square) is letterboxed, never cropped.
 * - Plays inline on iOS (playsinline), tries sound first, and if the browser's autoplay policy blocks it,
 *   shows a big "Tap to play" button instead of failing.
 * - If the browser cannot stream from the stored file directly, it retries from an in-memory copy.
 * - Always skippable (button, Esc). Errors are explained and never block the game.
 */
import { h } from '../dom';
import { icon } from '../icons';
import { repo } from '../../store/repo';
import { mediaUrl, mediaUrlInMemory, videoSupportHint } from '../../store/media';
import type { MediaRef } from '../../model/types';
import { fmtDuration } from '../../core/util';

export type CutsceneResult = 'ended' | 'skipped' | 'error';

let shared: HTMLVideoElement | null = null;
/** One reusable video element: once "unlocked" by a user gesture, iOS lets it play later without another tap. */
function sharedVideo(): HTMLVideoElement {
  if (!shared) {
    shared = document.createElement('video');
    shared.playsInline = true;
    shared.setAttribute('playsinline', '');
    shared.setAttribute('webkit-playsinline', '');
    shared.preload = 'auto';
    shared.disablePictureInPicture = true;
    shared.className = 'cs-video';
  }
  return shared;
}

/** 0.2 s of silent black video, used only to unlock media playback on the first user gesture (iOS). */
const SILENT_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAWgbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAll0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAADIAAAAAAABAAAAAAHRbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAACABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATxzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMAUDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAGXgAABl4AAAABhzdHRzAAAAAAAAAAEAAAACAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAACgwAAAAkAAAAYc3RjbwAAAAAAAAACAAAF5QAACHQAAAJxdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAgAAAAAAAADIAAAAAAAAAAAAAAABAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAAyAAABAAAAQAAAAAB6W1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAViIAABU6VcQAAAAAAC1oZGxyAAAAAAAAAABzb3VuAAAAAAAAAAAAAAAAU291bmRIYW5kbGVyAAAAAZRtaW5mAAAAEHNtaGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAVhzdGJsAAAAfnN0c2QAAAAAAAAAAQAAAG5tcDRhAAAAAAAAAAEAAAAAAAAAAAABABAAAAAAViIAAAAAADZlc2RzAAAAAAOAgIAlAAIABICAgBdAFQAAAAAAPoAAAAUyBYCAgAUTiFblAAaAgIABAgAAABRidHJ0AAAAAAAAPoAAAAUyAAAAIHN0dHMAAAAAAAAAAgAAAAUAAAQAAAAAAQAAAToAAAA0c3RzYwAAAAAAAAADAAAAAQAAAAEAAAABAAAAAgAAAAMAAAABAAAAAwAAAAIAAAABAAAALHN0c3oAAAAAAAAAAAAAAAYAAAAVAAAABAAAAAQAAAAEAAAABAAAAAQAAAAcc3RjbwAAAAAAAAADAAAF0AAACGgAAAh9AAAAGnNncGQBAAAAcm9sbAAAAAIAAAAB//8AAAAcc2JncAAAAAByb2xsAAAAAQAAAAYAAAABAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAr1tZGF03gIATGF2YzYwLjMxLjEwMgACMEAOAAACcQYF//9t3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MTAgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAKZYiEDvJigAC+/gEYIAcBGCAHARggBwAAAAVBmjgb6gEYIAcBGCAH';

let unlocked = false;
/** Call from any user gesture: primes the shared video element so later cutscenes can start with sound. */
export function unlockMedia(): void {
  if (unlocked) return;
  unlocked = true;
  const v = sharedVideo();
  try {
    if (!v.src) v.src = SILENT_MP4;
    v.muted = false;
    v.volume = 1;
    const p = v.play();
    if (p) p.catch(() => undefined).finally(() => { v.pause(); });
  } catch { /* ignore */ }
}

export function playCutscene(ref: MediaRef, opts: { title?: string; subtitle?: string } = {}): Promise<CutsceneResult> {
  return new Promise((resolve) => {
    const meta = repo.mediaMeta(ref.id);
    const v = sharedVideo();
    let finished = false;
    let triedMemory = false;
    let memUrl: string | null = null;
    let hideTimer = 0;

    const bar = h('div', { class: 'cs-progress' }, h('i'));
    const time = h('span', { class: 'cs-time' }, '0:00');
    const playBtn = h('button', { class: 'icon-btn', 'aria-label': 'Play / pause' }, icon('pause'));
    const muteBtn = h('button', { class: 'icon-btn', 'aria-label': 'Mute' }, icon('volume'));
    const fsBtn = h('button', { class: 'icon-btn', 'aria-label': 'Full screen' }, icon('expand'));
    const skipBtn = h('button', { class: 'btn cs-skip' }, h('span', null, 'Skip'), icon('skip'));
    const tapPlay = h('button', { class: 'cs-tap hidden' }, h('span', { class: 'cs-tap-ic' }, icon('play')), h('span', null, 'Tap to play the cutscene'));
    const spinner = h('div', { class: 'spinner cs-spin hidden' });
    const errBox = h('div', { class: 'cs-error hidden' });
    const wrap = h('div', { class: 'cutscene show-ui', role: 'dialog', 'aria-label': opts.title ?? 'Cutscene' },
      v,
      h('div', { class: 'cs-top' },
        h('div', { class: 'cs-title' }, opts.title ? h('strong', null, opts.title) : null, opts.subtitle ? h('small', null, opts.subtitle) : null),
        skipBtn),
      tapPlay, spinner, errBox,
      h('div', { class: 'cs-bottom' }, playBtn, bar, time, muteBtn, fsBtn));

    const finish = (r: CutsceneResult): void => {
      if (finished) return;
      finished = true;
      clearTimeout(hideTimer);
      document.removeEventListener('keydown', onKey);
      v.pause();
      for (const [ev, fn] of listeners) v.removeEventListener(ev, fn);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      wrap.classList.add('out');
      setTimeout(() => {
        wrap.remove();
        v.removeAttribute('src');
        try { v.load(); } catch { /* ignore */ }
        if (memUrl) URL.revokeObjectURL(memUrl);
      }, 250);
      resolve(r);
    };

    const showError = (msg: string): void => {
      spinner.classList.add('hidden');
      tapPlay.classList.add('hidden');
      errBox.replaceChildren(
        icon('warn', 'ic big'),
        h('strong', null, 'This cutscene cannot be played on this device'),
        h('p', null, msg),
        h('button', { class: 'btn primary', on: { click: () => finish('error') } }, h('span', null, 'Continue')));
      errBox.classList.remove('hidden');
    };

    const showUi = (): void => {
      wrap.classList.add('show-ui');
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => { if (!v.paused) wrap.classList.remove('show-ui'); }, 2800);
    };

    const start = async (): Promise<void> => {
      spinner.classList.remove('hidden');
      try {
        v.muted = false;
        await v.play();
        tapPlay.classList.add('hidden');
      } catch (e) {
        const name = (e as DOMException)?.name;
        spinner.classList.add('hidden');
        if (name === 'NotAllowedError') {
          tapPlay.classList.remove('hidden');
        } else if (name !== 'AbortError') {
          void onVideoError();
        }
      }
    };

    const onVideoError = async (): Promise<void> => {
      if (finished) return;
      if (!triedMemory) {
        triedMemory = true;
        memUrl = await mediaUrlInMemory(ref.id).catch(() => null);
        if (memUrl) {
          v.src = memUrl;
          v.load();
          void start();
          return;
        }
      }
      showError(videoSupportHint(meta?.mime ?? 'video/mp4'));
    };

    const listeners: [string, EventListener][] = [
      ['ended', () => finish('ended')],
      ['error', () => void onVideoError()],
      ['waiting', () => spinner.classList.remove('hidden')],
      ['playing', () => { spinner.classList.add('hidden'); playBtn.replaceChildren(icon('pause')); showUi(); }],
      ['pause', () => { playBtn.replaceChildren(icon('play')); wrap.classList.add('show-ui'); }],
      ['timeupdate', () => {
        const d = v.duration || meta?.duration || 0;
        (bar.firstChild as HTMLElement).style.width = d ? `${(v.currentTime / d) * 100}%` : '0';
        time.textContent = `${fmtDuration(v.currentTime) === '—' ? '0:00' : fmtDuration(v.currentTime)} / ${fmtDuration(d)}`;
      }],
    ];
    for (const [ev, fn] of listeners) v.addEventListener(ev, fn);

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish('skipped');
      if (e.key === ' ') { e.preventDefault(); v.paused ? void start() : v.pause(); }
    };
    document.addEventListener('keydown', onKey);
    skipBtn.addEventListener('click', (e) => { e.stopPropagation(); finish('skipped'); });
    tapPlay.addEventListener('click', (e) => { e.stopPropagation(); void start(); });
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); v.paused ? void start() : v.pause(); });
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      v.muted = !v.muted;
      muteBtn.replaceChildren(icon(v.muted ? 'mute' : 'volume'));
    });
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const el = wrap as any;
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
      else if ((v as any).webkitEnterFullscreen) (v as any).webkitEnterFullscreen();
    });
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = bar.getBoundingClientRect();
      const d = v.duration;
      if (d) v.currentTime = ((e.clientX - r.left) / r.width) * d;
    });
    wrap.addEventListener('click', () => {
      if (!errBox.classList.contains('hidden') || !tapPlay.classList.contains('hidden')) return;
      if (wrap.classList.contains('show-ui')) { v.paused ? void start() : v.pause(); }
      showUi();
    });
    wrap.addEventListener('pointermove', showUi);

    document.body.appendChild(wrap);
    if (!meta) {
      showError('The video file is missing from storage. Replace it in the Database.');
      return;
    }
    v.muted = false;
    v.controls = false;
    spinner.classList.remove('hidden');
    void mediaUrl(meta, 'full').then((u) => {
      if (finished) return;
      if (!u) {
        showError('The video file could not be read from storage. Replace it in the Database.');
        return;
      }
      v.src = u;
      v.load();
      void start();
    });
  });
}
