// Rendering: stadium, pitch, goals with reactive nets, ball, procedural player models/animation and the broadcast camera.
import * as THREE from 'three';
import { GH, GW, HL, HW, P, PA_D, PA_W, SIX_D, angd, clamp, hyp, lerp } from '../sim/base';
import type { Match } from '../sim/match';

export const KITS: { name: string; shirt: number; shorts: number; socks: number }[] = [
  { name: 'Azzurro', shirt: 0x1f5fd1, shorts: 0xf2f2f2, socks: 0x1f5fd1 }, { name: 'Rosso', shirt: 0xc8202a, shorts: 0xffffff, socks: 0xc8202a },
  { name: 'Bianco', shirt: 0xf4f4f4, shorts: 0x15171c, socks: 0xf4f4f4 }, { name: 'Giallo', shirt: 0xf2c81e, shorts: 0x1c3f9e, socks: 0xf2c81e },
  { name: 'Nero', shirt: 0x191b21, shorts: 0x191b21, socks: 0xd9d9d9 }, { name: 'Celeste', shirt: 0x74b9e8, shorts: 0x1b2440, socks: 0xffffff },
  { name: 'Verde', shirt: 0x178a4c, shorts: 0xffffff, socks: 0x178a4c }, { name: 'Arancione', shirt: 0xf07a1a, shorts: 0x1a1a1a, socks: 0xf07a1a },
];
const GK_KITS = [{ shirt: 0x9be02b, shorts: 0x232323, socks: 0x9be02b }, { shirt: 0xe84fa0, shorts: 0x2a1030, socks: 0xe84fa0 }];
const SKIN = [0xf3d2b8, 0xe6b991, 0xc99468, 0x9a6a44, 0x5f3d28];
const HAIR: Record<string, number> = { k: 0x16110e, d: 0x33241a, b: 0x5d4028, l: 0xd8b56a, r: 0xb5622a, g: 0x8a8a8a };

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number) => { let m = mats.get(c); if (!m) { m = lam(c); mats.set(c, m); } return m; };
const G = {
  torso: new THREE.BoxGeometry(0.4, 0.56, 0.23), shorts: new THREE.BoxGeometry(0.39, 0.24, 0.25), head: new THREE.SphereGeometry(0.115, 14, 10),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), uarm: new THREE.CapsuleGeometry(0.052, 0.2, 2, 6), farm: new THREE.CapsuleGeometry(0.042, 0.24, 2, 6),
  thigh: new THREE.CapsuleGeometry(0.075, 0.3, 2, 6), shin: new THREE.CapsuleGeometry(0.055, 0.32, 2, 6), foot: new THREE.BoxGeometry(0.1, 0.07, 0.25),
  cap: new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), back: new THREE.BoxGeometry(0.2, 0.2, 0.07), afro: new THREE.SphereGeometry(0.155, 10, 8),
  bun: new THREE.SphereGeometry(0.05, 8, 6), crest: new THREE.BoxGeometry(0.07, 0.07, 0.2), band: new THREE.CylinderGeometry(0.121, 0.121, 0.025, 14, 1, true),
  beard: new THREE.SphereGeometry(0.119, 10, 6, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.3), shadow: new THREE.CircleGeometry(0.42, 14),
};
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

/** Low-poly footballer with procedural, state-driven animation. Model faces +z; forward limb swing = negative rotation.x. */
class Figure {
  root = new THREE.Group(); body = new THREE.Group(); legs: THREE.Group[] = []; knees: THREE.Group[] = []; arms: THREE.Group[] = []; elbows: THREE.Group[] = [];
  shadow = new THREE.Mesh(G.shadow, shadowMat); hip: number; ph = 0; sc: number; pose = new Float32Array(16); spin = 0;
  torso: THREE.Mesh; shortsM: THREE.Mesh; socks: THREE.Mesh[] = []; sleeves: THREE.Mesh[] = []; key = '';
  constructor() {
    this.sc = 1; this.hip = 0.92;
    this.torso = new THREE.Mesh(G.torso); this.torso.position.y = 0.36; this.shortsM = new THREE.Mesh(G.shorts); this.shortsM.position.y = 0.02;
    this.body.add(this.torso, this.shortsM); this.root.add(this.body);
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.105, -0.06, 0); const th = new THREE.Mesh(G.thigh); th.position.y = -0.2; th.name = 'skin';
      const knee = new THREE.Group(); knee.position.y = -0.42; const sh = new THREE.Mesh(G.shin); sh.position.y = -0.2; const ft = new THREE.Mesh(G.foot, mat(0x111111)); ft.position.set(0, -0.42, 0.06);
      knee.add(sh, ft); leg.add(th, knee); this.body.add(leg); this.legs.push(leg); this.knees.push(knee); this.socks.push(sh);
      const arm = new THREE.Group(); arm.position.set(s * 0.25, 0.58, 0); const ua = new THREE.Mesh(G.uarm); ua.position.y = -0.14;
      const el = new THREE.Group(); el.position.y = -0.29; const fa = new THREE.Mesh(G.farm); fa.position.y = -0.14; fa.name = 'skin'; el.add(fa); arm.add(ua, el);
      this.body.add(arm); this.arms.push(arm); this.elbows.push(el); this.sleeves.push(ua);
    }
    this.shadow.rotation.x = -Math.PI / 2;
  }
  /** (Re)build the individual look: height, build, skin, hair, beard, kit. */
  dress(p: P, kit: { shirt: number; shorts: number; socks: number }) {
    const lk = p.data.look, key = p.data.id + kit.shirt; if (key === this.key) return; this.key = key;
    this.sc = lk.h / 182; this.root.scale.setScalar(this.sc); this.hip = 0.92;
    const w = [0.9, 1, 1.12][lk.build]; this.torso.scale.set(w, 1, w); this.shortsM.scale.set(w, 1, w);
    const skin = mat(SKIN[lk.skin]); this.torso.material = mat(kit.shirt); this.shortsM.material = mat(kit.shorts);
    for (const s of this.socks) s.material = mat(kit.socks); for (const s of this.sleeves) s.material = mat(kit.shirt);
    this.body.traverse(o => { if (o.name === 'skin') (o as THREE.Mesh).material = skin; });
    const old = this.body.getObjectByName('headG'); if (old) this.body.remove(old);
    const hg = new THREE.Group(); hg.name = 'headG'; hg.position.y = 0.79; const hm = mat(HAIR[lk.hc] ?? 0x222222);
    const nk = new THREE.Mesh(G.neck, skin); nk.position.y = -0.1; hg.add(new THREE.Mesh(G.head, skin), nk);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); hg.add(o); return o; };
    if (lk.hair === 0) add(G.cap, mat(new THREE.Color(SKIN[lk.skin]).lerp(new THREE.Color(HAIR[lk.hc] ?? 0), 0.45).getHex()), 0, 0, -0.004, 0.97, 0.97, 0.97);
    else if (lk.hair === 4) add(G.afro, hm, 0, 0.035, -0.015);
    else { add(G.cap, hm, 0, 0.004, -0.008, 1, lk.hair === 1 ? 1 : 1.08, 1.02).rotation.x = -0.25; }
    if (lk.hair === 2) add(G.back, hm, 0, -0.03, -0.085, 1, 0.7, 1);
    if (lk.hair === 3 || lk.hair === 7) add(G.back, hm, 0, -0.07, -0.09, 1.1, 1.25, 1.1);
    if (lk.hair === 5) { add(G.bun, hm, 0, 0.06, -0.13); add(G.back, hm, 0, -0.02, -0.085, 0.9, 0.6, 0.9); }
    if (lk.hair === 6) add(G.crest, hm, 0, 0.115, 0.01);
    if (lk.hair === 7) add(G.band, mat(0xffffff), 0, 0.05, 0).rotation.x = -0.15;
    if (lk.beard) add(G.beard, mat(new THREE.Color(HAIR[lk.hc] ?? 0).lerp(new THREE.Color(SKIN[lk.skin]), 0.25).getHex()), 0, 0, 0.006);
    this.body.add(hg);
  }
  update(p: P, m: Match, dt: number) {
    const r = this.root; r.visible = this.shadow.visible = p.on; if (!p.on) return;
    const sp = hyp(p.vx, p.vz), run = clamp(sp / 7.2, 0, 1.25), hasBall = m.ball.owner === p, k = 1 - Math.exp(-dt * 16);
    this.ph += dt * sp / ((1.25 + sp * 0.15) * this.sc) * Math.PI * 2;
    const s = Math.sin(this.ph), c = Math.cos(this.ph), A = sp < 0.3 ? 0 : 0.22 + run * 0.72, u = p.act === 'none' ? 0 : clamp(1 - p.actT / (p.actDur || 1), 0, 1);
    // pose targets: [legL, legR, kneeL, kneeR, armL, armR, elbL, elbR, lean, roll, y, legLz, legRz, armLz, armRz, yaw]
    const t = [-s * A, s * A, Math.max(0, c) * A * 1.5 + 0.08, Math.max(0, -c) * A * 1.5 + 0.08, s * A * 0.85, -s * A * 0.85, -0.25 - run * 0.9, -0.25 - run * 0.9,
      run * 0.2 + (p.spr ? 0.07 : 0), clamp(angd(Math.atan2(p.vz, p.vx), p.face), -0.6, 0.6) * (sp > 2 ? -0.55 : 0), Math.abs(s) * 0.035 * run, 0, 0, 0.1, -0.1, 0];
    if (hasBall && p.act === 'none') { t[10] -= 0.03 + 0.04 * Math.min(1, p.d.tight); t[8] += 0.06; }
    if (p.jock) { t[10] -= 0.07; t[8] = 0.25; t[13] = 0.5; t[14] = -0.5; t[2] += 0.3; t[3] += 0.3; }
    const kf = p.kickFoot > 0 ? 1 : 0; let ry = 0;
    switch (p.act) {
      case 'kick': {
        const kd = p.actKind, sw = u < 0.3 ? lerp(0, 0.9, u / 0.3) : u < 0.65 ? lerp(0.9, -1.35, (u - 0.3) / 0.35) : lerp(-1.35, 0, (u - 0.65) / 0.35);
        if (kd === 'header') { t[8] = u < 0.4 ? -0.3 : 0.5; t[10] = Math.sin(u * Math.PI) * 0.35; }
        else if (kd === 'throw') { t[4] = t[5] = lerp(-3, -1.2, u); t[8] = lerp(-0.3, 0.35, u); }
        else if (kd === 'heel') { t[kf] = lerp(0, 0.9, Math.sin(u * Math.PI)); t[2 + kf] = 1.2; }
        else if (kd === 'acro') { t[8] = -1.3 * Math.sin(u * Math.PI); t[10] = 0.5 * Math.sin(u * Math.PI); t[kf] = -1.8; t[1 - kf] = -0.6; }
        else { t[kf] = sw * (kd === 'pass' ? 0.6 : 1); t[2 + kf] = u < 0.35 ? 1.1 : 0.15; t[8] = kd === 'pass' ? 0.1 : -0.12 + u * 0.3; t[4 + kf] = 0.6; t[5 - kf] = -0.7; t[13] = 0.5; t[14] = -0.5; }
        break;
      }
      case 'tackle': t[1] = -1.1; t[3] = 0.1; t[0] = 0.5; t[2] = 0.9; t[8] = -0.1; t[10] = -0.12; t[13] = 0.7; t[14] = -0.7; break;
      case 'slide': t[8] = -1.15; t[10] = -0.62; t[1] = -1.35; t[3] = 0; t[0] = -0.5; t[2] = 1.3; t[4] = 0.8; t[5] = 0.8; break;
      case 'down': {
        const up = clamp(p.actT / 0.3, 0, 1), front = p.actKind === 'fouled' || p.actKind === 'smother';
        t[8] = (front ? 1.45 : -1.4) * up; t[10] = -0.68 * up; t[2] = t[3] = 0.4; t[4] = t[5] = front ? -2.4 : 0.6;
        if (p.actKind === 'dive') { t[8] = 0.2; t[9] = p.actDir * 1.45 * up; t[4] = t[5] = -2.6; }
        break;
      }
      case 'stun': t[8] = 0.5; t[13] = 0.9; t[14] = -0.9; t[10] = -0.05; break;
      case 'dive': {
        const go = clamp((m.t - p.gkGo) / Math.max(0.12, p.gkAt - p.gkGo), 0, 1);
        if (p.actKind === 'catch') { t[4] = t[5] = -1.5; t[6] = t[7] = -0.6; t[10] = -0.1; t[2] = t[3] = 0.5; }
        else { t[9] = p.actDir * 1.4 * go; t[4] = t[5] = -2.7; t[10] = (p.actKind === 'high' ? 0.25 + Math.min(1.1, p.gkTy * 0.45) : -0.35) * go - 0.2 * go; t[kf] = -0.4; t[13] = t[14] = 0; }
        break;
      }
      case 'jump': t[10] = Math.sin(u * Math.PI) * (0.45 + p.d.air / 400); t[4] = t[5] = -0.9; t[2] = t[3] = 0.5 * Math.sin(u * Math.PI); t[8] = p.actKind === 'head' ? (u < 0.45 ? -0.35 : 0.4) : 0; break;
      case 'throw': t[4] = t[5] = -3.0; t[8] = -0.15; break;
      case 'hold': t[4] = t[5] = -1.1; t[6] = t[7] = -1.0; break;
      case 'cele': { const j = Math.abs(Math.sin(m.t * 7)); t[4] = t[5] = -2.9; t[13] = 0.35; t[14] = -0.35; t[10] = j * 0.22; if (p.actKind === 'scorer') ry = m.t * 3; break; }
    }
    if (p.feintT > 0) {
      const f = 1 - p.feintT / 0.4, w = Math.sin(f * Math.PI * 2);
      if (p.feintKind === 'roulette') ry = f * Math.PI * 2;
      else if (p.feintKind === 'stepover') { t[11] = Math.max(0, w) * 0.7; t[12] = Math.min(0, w) * 0.7; t[0] -= 0.4 * Math.max(0, w); t[1] -= 0.4 * Math.max(0, -w); t[9] = w * 0.2; }
      else if (p.feintKind === 'elastico') { t[11 + kf] = w * 0.8 * (kf ? -1 : 1); t[kf] = -0.5; t[9] = -w * 0.25; }
      else if (p.feintKind === 'stopgo') { t[8] = f < 0.5 ? -0.2 : 0.45; t[2] = t[3] = 0.6; }
      else t[9] = w * 0.42;
    }
    const q = this.pose; for (let i = 0; i < 16; i++) q[i] += (t[i] - q[i]) * k;
    this.legs[0].rotation.set(q[0], 0, q[11]); this.legs[1].rotation.set(q[1], 0, q[12]); this.knees[0].rotation.x = q[2]; this.knees[1].rotation.x = q[3];
    this.arms[0].rotation.set(q[4], 0, q[13]); this.arms[1].rotation.set(q[5], 0, q[14]); this.elbows[0].rotation.x = q[6]; this.elbows[1].rotation.x = q[7];
    this.body.rotation.set(q[8], 0, q[9]); this.body.position.y = this.hip + q[10];
    this.spin = ry; r.position.set(p.x, 0, p.z); r.rotation.y = Math.PI / 2 - p.face + ry;
    this.shadow.position.set(p.x, 0.02, p.z);
  }
}

function pitchTexture() {
  const W = 2048, H = 1326, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!;
  const px = (m: number) => m / 105 * W;
  for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? '#2f8a3a' : '#35963f'; g.fillRect(i * W / 20, 0, W / 20 + 1, H); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,200' : '0,40,0'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 3.2; g.fillStyle = 'rgba(255,255,255,0.92)';
  g.strokeRect(2, 2, W - 4, H - 4); g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, px(9.15), 0, 7); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, 5, 0, 7); g.fill();
  for (const s of [0, 1]) {
    const x0 = s ? W : 0, d = s ? -1 : 1;
    g.strokeRect(Math.min(x0, x0 + d * px(PA_D)), H / 2 - px(PA_W), px(PA_D), px(PA_W) * 2);
    g.strokeRect(Math.min(x0, x0 + d * px(SIX_D)), H / 2 - px(9.16), px(SIX_D), px(18.32));
    g.beginPath(); g.arc(x0 + d * px(11), H / 2, 4.5, 0, 7); g.fill();
    g.beginPath(); g.arc(x0 + d * px(11), H / 2, px(9.15), s ? Math.PI - 0.925 : -0.925, s ? Math.PI + 0.925 : 0.925, false); g.stroke();
    for (const c of [0, 1]) { g.beginPath(); g.arc(x0, c ? H : 0, px(1), 0, 7); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx = 1, ry = 1) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
}

export class World {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); cam: THREE.PerspectiveCamera; figs: Figure[] = [];
  ball: THREE.Mesh; ballSh: THREE.Mesh; ring: THREE.Mesh; cone: THREE.Mesh; arrow: THREE.Mesh; reticle: THREE.Mesh; recvRing: THREE.Mesh;
  nets: { mesh: THREE.Mesh; base: Float32Array; amp: number; cy: number; cz: number }[] = [];
  cx = 0; cz = 0; look = new THREE.Vector3(); camPos = new THREE.Vector3(0, 30, 50); mode = ''; orbit = 0;
  constructor(canvas: HTMLCanvasElement, quality: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality >= 2, powerPreference: 'high-performance' });
    this.setQuality(quality);
    const sc = this.scene; sc.background = new THREE.Color(0x7fb2e6); sc.fog = new THREE.Fog(0x9cc4ea, 130, 320);
    this.cam = new THREE.PerspectiveCamera(30, 2, 0.5, 500);
    sc.add(new THREE.HemisphereLight(0xdfeeff, 0x3a5a2a, 1.25)); const sun = new THREE.DirectionalLight(0xfff4de, 1.5); sun.position.set(-40, 80, 35); sc.add(sun);
    // ground + pitch
    const out = new THREE.Mesh(new THREE.PlaneGeometry(190, 150), lam(0x2a7434)); out.rotation.x = -Math.PI / 2; out.position.y = -0.02; sc.add(out);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), new THREE.MeshLambertMaterial({ map: pitchTexture() })); pitch.rotation.x = -Math.PI / 2; sc.add(pitch);
    this.buildStadium(); this.buildGoals();
    const bt = canvasTex(128, 64, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#1b1b1f'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(8 + (i % 4) * 32 + (i > 3 ? 16 : 0), i > 3 ? 46 : 16, 7.5, 0, 7); g.fill(); } });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshLambertMaterial({ map: bt })); sc.add(this.ball);
    this.ballSh = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), shadowMat); this.ballSh.rotation.x = -Math.PI / 2; sc.add(this.ballSh);
    const flat = (g: THREE.BufferGeometry, c: number, o = 0.9) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; sc.add(m); return m; };
    this.ring = flat(new THREE.RingGeometry(0.5, 0.64, 24), 0xffe94a); this.recvRing = flat(new THREE.RingGeometry(0.42, 0.5, 20), 0xffffff, 0.55);
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xffe94a })); this.cone.rotation.x = Math.PI; sc.add(this.cone);
    const ag = new THREE.Shape(); ag.moveTo(0, -0.18); ag.lineTo(5.2, -0.18); ag.lineTo(5.2, -0.5); ag.lineTo(6.6, 0); ag.lineTo(5.2, 0.5); ag.lineTo(5.2, 0.18); ag.lineTo(0, 0.18);
    this.arrow = flat(new THREE.ShapeGeometry(ag), 0xffe94a, 0.85);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 20), new THREE.MeshBasicMaterial({ color: 0xffe94a, side: THREE.DoubleSide, depthTest: false })); this.reticle.visible = false; sc.add(this.reticle);
    for (let i = 0; i < 22; i++) { const f = new Figure(); this.figs.push(f); sc.add(f.root, f.shadow); f.root.visible = f.shadow.visible = false; }
  }
  setQuality(q: number) { this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][q] ?? 1.5)); }
  resize(w: number, h: number) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.fov = w / h < 1.5 ? 44 : 30; this.cam.updateProjectionMatrix(); }

  buildStadium() {
    const sc = this.scene;
    const crowd = (rx: number) => canvasTex(256, 128, g => { g.fillStyle = '#20242c'; g.fillRect(0, 0, 256, 128); const cols = ['#d7dbe2', '#c23b3b', '#3b6fc2', '#e0c040', '#f0f0f0', '#394150', '#8b5a3c', '#2e9a5a'];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 42; x++) { if (Math.random() < 0.12) continue; g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x * 6.1 + (y % 2) * 3, y * 8 + 1, 4, 3.4); g.fillStyle = '#e8c9a8'; g.fillRect(x * 6.1 + (y % 2) * 3 + 1, y * 8 - 1.2, 2, 2.2); } }, rx, 1);
    const stand = (w: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 26), new THREE.MeshLambertMaterial({ map: crowd(w / 22) })); m.rotation.order = 'YXZ'; m.rotation.y = ry; m.rotation.x = -0.95; m.position.set(x, 9.5, z); sc.add(m);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 3), lam(0x2b3340)); wall.rotation.y = ry; wall.position.set(x - Math.sin(ry) * -9.6, 1.5, z - Math.cos(ry) * -9.6); sc.add(wall);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 14), lam(0xe9edf2)); roof.rotation.y = ry; roof.position.set(x - Math.sin(ry) * 7, 23, z - Math.cos(ry) * 7); sc.add(roof);
    };
    stand(150, 0, -HW - 23, 0); stand(150, 0, HW + 30, Math.PI); stand(110, -HL - 24, 0, Math.PI / 2); stand(110, HL + 24, 0, -Math.PI / 2);
    const ad = canvasTex(1024, 32, g => { const c = ['#0d3b8c', '#b3141c', '#0f7a3c', '#e6a700', '#222']; for (let i = 0; i < 8; i++) { g.fillStyle = c[i % 5]; g.fillRect(i * 128, 0, 128, 32); g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText(['FOOTBALL GAME', 'CALCIO 11v11', 'FORZA!', 'GOL GOL GOL'][i % 4], i * 128 + 6, 23); } }, 3, 1);
    for (const [w, x, z, ry] of [[112, 0, -HW - 4.5, 0], [70, -HL - 5.5, 0, Math.PI / 2], [70, HL + 5.5, 0, -Math.PI / 2]] as number[][]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1), new THREE.MeshBasicMaterial({ map: ad })); m.rotation.y = ry; m.position.set(x, 0.5, z); sc.add(m);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // floodlight towers
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 36, 6), lam(0x8a929c)); p.position.set(sx * (HL + 30), 18, sz * (HW + 30)); sc.add(p);
      const l = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 1), new THREE.MeshBasicMaterial({ color: 0xfffbe8 })); l.position.set(sx * (HL + 29), 37, sz * (HW + 29)); l.lookAt(0, 0, 0); sc.add(l);
    }
  }
  buildGoals() {
    const white = lam(0xffffff), net = canvasTex(64, 64, g => { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } }, 1, 1);
    for (const sx of [-1, 1]) {
      const gx = sx * HL, g = new THREE.Group();
      for (const z of [-GW, GW]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GH, 8), white); p.position.set(gx, GH / 2, z); g.add(p); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.9, 6), white); s.rotation.z = sx * 0.76; s.position.set(gx + sx * 1, GH / 2, z); g.add(s); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GW * 2 + 0.12, 8), white); bar.rotation.x = Math.PI / 2; bar.position.set(gx, GH, 0); g.add(bar);
      const nm = (rx: number, ry: number) => { const t = net.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }); };
      const back = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GH, 14, 6), nm(24, 8)); back.rotation.y = Math.PI / 2; back.position.set(gx + sx * 2, GH / 2, 0); g.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(2, GW * 2), nm(6, 24)); top.rotation.x = Math.PI / 2; top.position.set(gx + sx * 1, GH, 0); g.add(top);
      for (const z of [-GW, GW]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(2, GH), nm(6, 8)); side.position.set(gx + sx * 1, GH / 2, z); g.add(side); }
      this.scene.add(g); this.nets.push({ mesh: back, base: (back.geometry.attributes.position.array as Float32Array).slice(), amp: 0, cy: 0, cz: 0 });
    }
  }
  /** The ball hit the back of a net: bulge it around the impact point. */
  netHit(side: number, y: number, z: number) { const n = this.nets[side > 0 ? 1 : 0]; n.amp = 0.9; n.cy = y - GH / 2; n.cz = z; }

  setMatch(m: Match) {
    m.ps.forEach((p, i) => this.figs[i].dress(p, p.grp === 'GK' ? GK_KITS[p.team.id] : KITS[p.team.kit]));
    this.mode = ''; this.cx = 0;
  }
  update(m: Match | null, dt: number) {
    if (!m) { // menu backdrop: slow orbit over the empty stadium
      this.orbit += dt * 0.07; this.cam.position.set(Math.cos(this.orbit) * 70, 26, Math.sin(this.orbit) * 62); this.cam.lookAt(0, 0, 0);
      for (const f of this.figs) f.root.visible = f.shadow.visible = false; this.ball.visible = this.ballSh.visible = this.ring.visible = this.cone.visible = this.arrow.visible = this.reticle.visible = this.recvRing.visible = false;
      this.renderer.render(this.scene, this.cam); return;
    }
    const b = m.ball; this.ball.visible = this.ballSh.visible = true;
    m.ps.forEach((p, i) => { const f = this.figs[i]; f.dress(p, p.grp === 'GK' ? GK_KITS[p.team.id] : KITS[p.team.kit]); f.update(p, m, dt); });
    this.ball.position.set(b.x, b.y, b.z); this.ball.rotation.z = -b.rx / 0.11; this.ball.rotation.x = b.rz / 0.11;
    this.ballSh.position.set(b.x, 0.02, b.z); this.ballSh.scale.setScalar(1 + b.y * 0.25); (this.ballSh.material as THREE.Material).opacity = 0.28;
    const c = m.ctrl, human = !m.auto;
    this.ring.visible = this.cone.visible = !!c && human && m.state !== 'goal';
    if (c) { this.ring.position.set(c.x, 0.03, c.z); this.cone.position.set(c.x, 2.25 * (c.data.look.h / 182) + (m.ball.owner === c && c.act === 'throw' ? 0.5 : 0), c.z); this.cone.rotation.y += dt * 3; }
    const rt = human && !b.owner && b.passTo && b.passTo !== c ? b.passTo : null; this.recvRing.visible = !!rt; if (rt) this.recvRing.position.set(rt.x, 0.03, rt.z);
    for (const n of this.nets) if (n.amp > 0.005) {
      const pos = n.mesh.geometry.attributes.position, a = pos.array as Float32Array; n.amp *= Math.exp(-dt * 3.2);
      for (let i = 0; i < a.length; i += 3) { const dz = n.base[i] + (n === this.nets[1] ? n.cz : -n.cz) * 1, dy = n.base[i + 1] - n.cy; a[i + 2] = n.base[i + 2] - n.amp * Math.exp(-(dz * dz + dy * dy) / 1.6) * (0.75 + 0.25 * Math.sin(n.amp * 40)); }
      pos.needsUpdate = true;
    }
    // set-piece aiming aids
    const sp = m.sp, mine = !!sp && human && sp.team.human && m.state === 'setpiece';
    this.arrow.visible = mine && !sp!.shoot; this.reticle.visible = mine && sp!.shoot;
    if (mine && !sp!.shoot) { this.arrow.position.set(sp!.x, 0.04, sp!.z); this.arrow.rotation.z = -sp!.aim; }
    if (mine && sp!.shoot) { this.reticle.position.set(sp!.team.dir * (HL - 0.05), sp!.ry, sp!.rz); this.reticle.rotation.y = Math.PI / 2; }
    // camera
    const k = 1 - Math.exp(-dt * 3.2), shootCam = !!sp && sp.shoot && m.state === 'setpiece';
    let px: number, py: number, pz: number, lx: number, ly: number, lz: number;
    if (shootCam) { const d = sp!.team.dir; px = sp!.x - d * 10; py = 3.4; pz = sp!.z * 1.25; lx = d * HL; ly = 1.3; lz = 0; }
    else {
      const fx = m.state === 'goal' && m.scorers.length ? (m.ps.find(p => p.act === 'cele' && p.actKind === 'scorer')?.x ?? b.x) : b.x + clamp(b.vx * 0.35, -6, 6);
      this.cx += (clamp(fx, -HL + 9, HL - 9) - this.cx) * k; this.cz += (b.z - this.cz) * k;
      const zoom = this.cam.aspect < 1.5 ? 1.35 : 1; px = this.cx; py = 19.5 * zoom; pz = (35 + this.cz * 0.36) * zoom; lx = this.cx; ly = 0; lz = this.cz * 0.5 - 1.5;
    }
    const kk = this.mode !== (shootCam ? 's' : 'n') ? 1 : 1 - Math.exp(-dt * 5); this.mode = shootCam ? 's' : 'n';
    this.camPos.x += (px - this.camPos.x) * kk; this.camPos.y += (py - this.camPos.y) * kk; this.camPos.z += (pz - this.camPos.z) * kk;
    this.look.x += (lx - this.look.x) * kk; this.look.y += (ly - this.look.y) * kk; this.look.z += (lz - this.look.z) * kk;
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.look);
    this.renderer.render(this.scene, this.cam);
  }
  /** Joystick → world direction, following the current camera heading. */
  mapInput(jx: number, jy: number): [number, number] {
    const fx = this.look.x - this.camPos.x, fz = this.look.z - this.camPos.z, n = hyp(fx, fz) || 1, ux = fx / n, uz = fz / n;
    return [-uz * jx - ux * jy, ux * jx - uz * jy];
  }
}
