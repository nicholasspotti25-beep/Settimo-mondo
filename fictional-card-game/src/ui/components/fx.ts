/** Lightweight canvas particle bursts for reveals. */
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'spark' | 'star' | 'ember'; rot: number }
let parts: P[] = [];
let running = false;

function ensure(): void {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  const resize = (): void => {
    const d = Math.min(2, window.devicePixelRatio || 1);
    canvas!.width = innerWidth * d;
    canvas!.height = innerHeight * d;
    ctx?.setTransform(d, 0, 0, d, 0, 0);
  };
  resize();
  addEventListener('resize', resize);
}

function loop(): void {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.globalCompositeOperation = 'lighter';
  parts = parts.filter((p) => p.life < p.max);
  for (const p of parts) {
    p.life += 1;
    p.x += p.vx;
    p.y += p.vy;
    if (p.kind === 'ember') { p.vy -= 0.03; p.vx *= 0.99; } else { p.vx *= 0.965; p.vy = p.vy * 0.965 + 0.04; }
    p.rot += 0.05;
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.color;
    if (p.kind === 'star') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size * (0.6 + a * 0.6);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? s * 0.28 : s;
        const ang = (i * Math.PI) / 4;
        ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else running = false;
}

export function burst(x: number, y: number, o: { count?: number; colors: string[]; speed?: number; kind?: P['kind']; size?: number; life?: number }): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion')) return;
  ensure();
  const n = o.count ?? 40;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (o.speed ?? 6) * (0.35 + Math.random() * 0.9);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.kind === 'ember' ? 1 : 0),
      life: 0, max: (o.life ?? 60) * (0.6 + Math.random() * 0.7), size: (o.size ?? 3) * (0.5 + Math.random()),
      color: o.colors[i % o.colors.length]!, kind: o.kind ?? 'spark', rot: Math.random() * 6,
    });
  }
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

export function burstAt(el: Element, o: Parameters<typeof burst>[2]): void {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, o);
}
