/** Small always-visible save indicator, so every change is visibly confirmed. */
import { h } from '../dom';
import { icon } from '../icons';
import { repo } from '../../store/repo';

export function initSavePill(): void {
  const el = h('div', { class: 'savepill', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(el);
  let timer = 0;
  repo.onSaveState((s) => {
    clearTimeout(timer);
    const where = repo.storageKind === 'cloud' ? 'Saved to your account' : repo.storageKind === 'device' ? 'Saved on this device' : 'Not saved — storage unavailable';
    const text = s === 'saving' ? 'Saving…' : s === 'saved' ? where : 'Last change was not saved';
    el.className = `savepill on ${s} ${repo.storageKind}`;
    el.replaceChildren(s === 'saving' ? h('i', { class: 'sp-dot' }) : icon(s === 'saved' && repo.storageKind !== 'memory' ? 'check' : 'warn'), h('span', null, text));
    if (s !== 'saving') timer = window.setTimeout(() => el.classList.remove('on'), s === 'error' || repo.storageKind === 'memory' ? 6000 : 2200);
  });
}
