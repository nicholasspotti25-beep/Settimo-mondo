// Synthesised match audio (Web Audio): crowd bed, whistle, kicks, goal roar, woodwork.
export class Sfx {
  ctx: AudioContext | null = null; on = true; private crowd: GainNode | null = null; private noise: AudioBuffer | null = null;
  init() {
    if (this.ctx || !this.on) return;
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const c = this.ctx = new C();
      const n = this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0); let l = 0;
      for (let i = 0; i < d.length; i++) { l = l * 0.985 + (Math.random() * 2 - 1) * 0.015 * 8; d[i] = l; }
      const s = c.createBufferSource(); s.buffer = n; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
      this.crowd = c.createGain(); this.crowd.gain.value = 0; s.connect(f).connect(this.crowd).connect(c.destination); s.start();
    } catch { this.ctx = null; }
  }
  setOn(v: boolean) { this.on = v; if (this.ctx) { if (v) this.ctx.resume(); else this.ctx.suspend(); } }
  ambience(level: number) { if (this.crowd && this.ctx) this.crowd.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4); }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const c = this.ctx; if (!c || !this.on) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  private burst(dur: number, vol: number, freq: number) {
    const c = this.ctx; if (!c || !this.on || !this.noise) return; const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); s.connect(f).connect(g).connect(c.destination); s.start(0, Math.random()); s.stop(c.currentTime + dur);
  }
  kick(v: number) { this.tone('sine', 150, 55, 0.09, Math.min(0.5, 0.12 + v / 80)); this.burst(0.05, Math.min(0.5, 0.1 + v / 90), 1800); }
  whistle() { this.tone('square', 2300, 2500, 0.32, 0.07); this.tone('square', 2390, 2600, 0.32, 0.05); }
  post() { this.tone('triangle', 620, 300, 0.25, 0.3); }
  goal() { this.burst(3.2, 0.9, 1400); if (this.crowd && this.ctx) { this.crowd.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.1); this.crowd.gain.setTargetAtTime(0.22, this.ctx.currentTime + 3, 0.8); } }
  ooh() { this.burst(0.9, 0.35, 900); }
}
