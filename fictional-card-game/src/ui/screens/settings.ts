/** Profiles & settings: player names, statistics and histories, gameplay options, storage, backup and restore. */
import { h, replace } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../router';
import { topbar, toggleRow, sectionTitle, fcChip, notice } from '../components/common';
import { btn, toast, guard, confirmDialog, modal, busy } from '../overlay';
import { repo } from '../../store/repo';
import { buildBackup, parseBackup, backupFileName, BackupError } from '../../store/backup';
import { chooseFiles } from '../components/picker';
import { fmtBytes, fmtFC } from '../../core/util';
import { formatDateTime } from '../../core/time';
import { PLACEMENT_LABEL } from '../../engines/tournament';
import { MODES, MODE_LABEL, RARITY_LABEL, EDITION_LABEL, type PlayerId } from '../../model/types';
import { describeError } from '../../store/idb';
import { inClaudeViewer, saveFile } from '../../core/save';

async function exportBackup(): Promise<void> {
  const b = busy('Preparing the backup (databases, profiles and all media)…');
  try {
    const keys = await repo.blobKeys();
    const blob = await buildBackup(repo.snapshot(), keys, (k) => repo.getBlob(k));
    const name = backupFileName();
    b.close();
    const file = new File([blob], name, { type: 'application/octet-stream' });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    const content = h('div', { class: 'stack' },
      h('p', null, `Your complete backup is ready: `, h('strong', null, name), ` (${fmtBytes(blob.size)}).`),
      h('p', { class: 'muted' }, 'It contains all four databases, every image and video, both players (collections, FC, pity counters, missions, achievements, histories) and settings. Keep it somewhere safe — it is the only way to recover the game if this device or its browser data is lost.'));
    const share = !inClaudeViewer() && nav.canShare?.({ files: [file] });
    const m = modal({
      title: 'Backup ready', content,
      actions: [
        share ? btn('Share / Save to Files', () => void navigator.share({ files: [file], title: name }).catch(() => undefined), 'ghost', 'upload') : null,
        btn('Save backup', async () => {
          const r = await saveFile(blob, name);
          if (r === 'saved') { toast('Backup saved', 'ok'); m.close(); }
          else if (r === 'unavailable') toast('Saving files is not available here. Open the game in a browser to export a backup.', 'err', 6000);
        }, 'primary', 'download'),
      ].filter(Boolean) as Node[],
    });
  } catch (e) {
    b.close();
    toast(`Backup failed: ${describeError(e)}`, 'err', 6000);
  }
}

async function importBackup(): Promise<void> {
  const [file] = await chooseFiles('.zip,.fcgbackup,application/zip,application/octet-stream');
  if (!file) return;
  const b = busy('Checking the backup…');
  let parsed;
  try {
    parsed = await parseBackup(file);
  } catch (e) {
    b.close();
    toast(e instanceof BackupError ? e.message : `This file could not be read: ${(e as Error).message}`, 'err', 7000);
    return;
  }
  b.close();
  const s = parsed.summary;
  const ok = await confirmDialog({
    title: 'Restore this backup?',
    message: h('div', { class: 'stack' },
      h('p', null, `Backup from ${formatDateTime(s.createdAt)}:`),
      h('ul', { class: 'issues' },
        ...MODES.map((m) => h('li', null, `${MODE_LABEL[m]}: ${s.entries[m]} entries`)),
        h('li', null, `${s.media} media files (${fmtBytes(s.mediaBytes)})`),
        ...s.players.map((p) => h('li', null, `${p.name}: ${fmtFC(p.fc)}, ${p.cards} cards`))),
      s.warnings.length ? notice('warn', s.warnings.slice(0, 3).join(' ')) : null,
      notice('warn', 'Everything currently in the game on this device will be REPLACED by this backup. Export a backup of the current data first if you might need it.')),
    confirm: 'Replace and restore', danger: true,
  });
  if (!ok) return;
  const b2 = busy('Restoring…');
  try {
    await repo.replaceAll(parsed.data, parsed.blobs);
    toast('Backup restored', 'ok');
  } catch (e) {
    toast(`Restore failed — your existing data was kept unchanged. ${describeError((e as any)?.cause ?? e)}`, 'err', 8000);
  } finally {
    b2.close();
  }
}

function playerPanel(id: PlayerId): HTMLElement {
  const p = repo.player(id);
  const name = h('input', { type: 'text', value: p.name, maxlength: '24', 'aria-label': `${id} name` }) as HTMLInputElement;
  const saveName = (): void => {
    const v = name.value.trim();
    if (!v || v === p.name) { name.value = p.name; return; }
    void guard(() => repo.mutate([id], (ps) => { ps[id].name = v; }), 'Could not rename').then(() => toast('Name saved', 'ok'));
  };
  name.addEventListener('change', saveName);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  const c = p.counters;
  const owned = Object.values(p.collection).reduce((s, x) => s + x.qty, 0);
  const distinct = Object.values(p.collection).filter((x) => x.qty > 0).length;
  const stat = (label: string, v: string | number): HTMLElement => h('div', { class: 'pstat' }, h('b', null, String(v)), h('small', null, label));
  return h('div', { class: `panel player-panel ${id}` },
    h('div', { class: 'row' }, h('span', { class: `ptag ${id}` }, id.toUpperCase()), h('div', { class: 'grow' }, name), fcChip(p.fc)),
    h('div', { class: 'pstats' },
      stat('Matches', c.matchesCompleted), stat('Wins', c.wins), stat('Losses', c.losses), stat('Draws', c.draws),
      stat('Tournaments', c.tournaments), stat('Titles', c.tournamentWins), stat('Packs opened', c.packsOpened), stat('Cards owned', owned),
      stat('Different cards', distinct), stat('FC earned', c.fcEarned.toLocaleString()), stat('FC spent', c.fcSpent.toLocaleString()), stat('Login days', p.login.claims)),
    h('div', { class: 'row' },
      btn('Match history', () => historyModal(id, 'matches'), 'small ghost', 'swords'),
      btn('Tournaments', () => historyModal(id, 'tournaments'), 'small ghost', 'trophy'),
      btn('Packs', () => historyModal(id, 'packs'), 'small ghost', 'pack'),
      btn('FC history', () => historyModal(id, 'ledger'), 'small ghost', 'coin')));
}

function historyModal(id: PlayerId, kind: 'matches' | 'tournaments' | 'packs' | 'ledger'): void {
  const p = repo.player(id);
  let rows: HTMLElement[] = [];
  if (kind === 'matches') rows = p.matches.map((m) => h('div', { class: 'hrow' }, h('span', { class: `badge ${m.outcome === 'win' ? 'ok' : m.outcome === 'loss' ? 'err' : 'blue'}` }, m.outcome.toUpperCase()), h('span', { class: 'grow' }, `${m.mode === 'classic' ? 'Classic Draft' : 'Team Draft'} vs ${m.opponent} · ${m.score}`), h('small', { class: 'muted' }, `${m.fc ? `+${m.fc} FC · ` : ''}${formatDateTime(m.at)}`)));
  if (kind === 'tournaments') rows = p.tournaments.map((t) => h('div', { class: 'hrow' }, h('span', { class: `badge ${t.placement === 'champion' ? 'gold' : 'blue'}` }, PLACEMENT_LABEL[t.placement]), h('span', { class: 'grow' }, `${t.size} participants · ${t.character} · champion: ${t.champion}`), h('small', { class: 'muted' }, `+${t.reward} FC · ${formatDateTime(t.at)}`)));
  if (kind === 'packs') rows = p.packs.map((pk) => h('div', { class: 'hrow col' }, h('small', { class: 'muted' }, `${formatDateTime(pk.at)}${pk.pityApplied ? ` · Pity: ${RARITY_LABEL[pk.pityApplied]}` : ''}`), h('div', { class: 'chips' }, ...pk.cards.map((c) => h('span', { class: `rpill r-${c.rarity}` }, `${c.name}${c.edition === 'alt' ? ' (Alt)' : ''}${c.isNew ? ' • NEW' : ''}`)))));
  if (kind === 'ledger') rows = p.ledger.map((l) => h('div', { class: 'hrow' }, h('b', { class: l.amount >= 0 ? 'ok-text' : 'danger-text' }, `${l.amount >= 0 ? '+' : ''}${l.amount.toLocaleString()} FC`), h('span', { class: 'grow' }, l.reason), h('small', { class: 'muted' }, `${formatDateTime(l.at)} · ${l.balance.toLocaleString()} FC`)));
  const titles = { matches: 'Match history', tournaments: 'Tournament history', packs: 'Pack-opening history', ledger: 'FC history' };
  modal({ title: `${p.name} — ${titles[kind]}`, cls: 'modal-lg', content: rows.length ? h('div', { class: 'hlist' }, ...rows) : h('p', { class: 'muted' }, 'Nothing recorded yet.') });
}

export function settingsScreen(): Screen {
  const el = h('div', { class: 'settings' });
  const body = h('div', { class: 'wrap' });
  const storageInfo = h('p', { class: 'muted' }, 'Checking storage…');
  const refreshStorage = async (): Promise<void> => {
    try {
      const e = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      storageInfo.textContent = `${e ? `Using ${fmtBytes(e.usage ?? 0)} of about ${fmtBytes(e.quota ?? 0)}. ` : ''}${persisted ? 'Persistent storage is ON: the browser will not clear game data automatically.' : 'Persistent storage is not granted yet: under storage pressure the browser could clear site data. Keep backups.'}`;
    } catch {
      storageInfo.textContent = 'This browser does not report storage information.';
    }
  };
  const render = (): void => {
    const s = repo.settings;
    const set = (patch: Partial<typeof s>): void => void guard(() => repo.updateSettings(patch), 'Could not save the setting');
    const rounds = h('div', { class: 'seg small' }, ...[1, 3, 5, 7, 10].map((n) => h('button', { class: s.classicRounds === n ? 'on' : '', on: { click: () => set({ classicRounds: n }) } }, String(n))));
    const speed = h('div', { class: 'seg small' }, ...[1, 2, 4].map((n) => h('button', { class: s.revealSpeed === n ? 'on' : '', on: { click: () => set({ revealSpeed: n }) } }, `${n}×`)));
    replace(body,
      sectionTitle('Players'),
      h('div', { class: 'two-col' }, playerPanel('p1'), playerPanel('p2')),
      sectionTitle('Gameplay'),
      h('div', { class: 'panel' },
        h('div', { class: 'trow' }, h('div', { class: 'grow' }, h('strong', null, 'Classic Draft rounds'), h('small', null, 'Number of rounds in each Classic Draft match.')), rounds),
        toggleRow('Show your own character’s statistics', 'In Classic Draft each player sees their own character’s stats while choosing (never the opponent’s). Turn off for a blind, knowledge-based duel.', s.classicShowOwnStats, (v) => set({ classicShowOwnStats: v })),
        toggleRow('Autoplay winner cutscenes', 'Automatically play the round winner’s cutscene in Classic Draft and the MVP’s in Team Draft, when one exists.', s.autoplayCutscenes, (v) => set({ autoplayCutscenes: v })),
        toggleRow('Hide names of missing cards', 'My Collection shows missing cards as silhouettes; turn on to also hide their names.', s.hideMissingNames, (v) => set({ hideMissingNames: v })),
        h('div', { class: 'trow' }, h('div', { class: 'grow' }, h('strong', null, 'Pack reveal speed'), h('small', null, 'Default animation speed when opening packs (can also be changed during the reveal).')), speed),
        toggleRow('Sound effects', 'Synthesized UI and reveal sounds.', s.sound, (v) => set({ sound: v })),
        toggleRow('Reduce motion', 'Minimize animations and particle effects.', s.reduceMotion, (v) => set({ reduceMotion: v }))),
      sectionTitle('Storage & backup'),
      h('div', { class: 'panel stack' },
        storageInfo,
        h('div', { class: 'row' },
          btn('Protect storage', async () => {
            const ok = await navigator.storage?.persist?.().catch(() => false);
            toast(ok ? 'Persistent storage granted' : 'The browser did not grant persistent storage — keep regular backups', ok ? 'ok' : 'info', 5000);
            void refreshStorage();
          }, 'ghost', 'shield')),
        notice('info', 'A backup contains every database, all images and videos, both player profiles and the settings. Restoring replaces the data on this device only after you confirm, and an invalid file never touches your current data.'),
        h('div', { class: 'row' },
          btn('Export complete backup', () => void exportBackup(), 'primary', 'download'),
          btn('Import backup', () => void importBackup(), 'ghost', 'upload'))),
      sectionTitle('About'),
      h('div', { class: 'panel' },
        h('p', { class: 'muted' }, 'Fictional Card Game runs entirely on this device. No accounts, no real-money purchases: Fictional Coins are earned only by playing. Rarity probabilities, pity thresholds and rewards are fixed by the game rules.'),
        h('p', { class: 'dim', style: 'margin-top:8px' }, `Editions: ${EDITION_LABEL.normal} and ${EDITION_LABEL.alt} are separate collectibles.`)));
    void refreshStorage();
  };
  el.append(topbar({ title: 'Profiles & Settings' }), body);
  render();
  return { el, refresh: render };
}

export { icon };
