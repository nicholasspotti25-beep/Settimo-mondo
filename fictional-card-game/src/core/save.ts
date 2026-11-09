/**
 * Offer a generated file to the user. Inside the Claude viewer, plain downloads are blocked, so the platform's
 * `downloads` capability is used (the viewer confirms the save); everywhere else a normal browser download starts.
 */
type Downloads = { save(r: { filename: string; data: Blob }): Promise<{ status: string }> };

export function inClaudeViewer(): boolean {
  return typeof (window as any).claude?.use === 'function';
}

export async function saveFile(blob: Blob, filename: string): Promise<'saved' | 'declined' | 'unavailable'> {
  if (inClaudeViewer()) {
    let dl: Downloads | null = null;
    try { dl = (await (window as any).claude.use('downloads')) as Downloads | null; } catch { dl = null; }
    if (!dl) return 'unavailable';
    try {
      await dl.save({ filename, data: blob });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60_000);
  return 'saved';
}
