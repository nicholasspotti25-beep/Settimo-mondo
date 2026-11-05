/**
 * Weapon templates, Act II (story order): catene (Triplice Guinzaglio, Cerbero), spadone (Brace Eterna, Pyro),
 * martello_da_guerra (Tuono Spezzacielo, Thunder), stocco (Brina Silente, Ice), ascia_a_due_mani (Fenditura Ardente,
 * Mostro di Magma). Same contract as act1.ts: the weapon frame has +Z along the weapon out of the fist, edges on +-Y,
 * flats on +-X; type templates parameterized by model params + colors, the Bible look is the default.
 */
import * as THREE from 'three';
import * as geo from '../kit/geometry';
import type { V3 } from '../kit/geometry';
import { Prng, seedOf } from '../kit/noise';
import { mix, shade } from '../kit/palette';
import { Forge, bladeZ, inlay, latheZ, sampleProfile } from './forge';
import { finish, grip } from './act1';
import { colorsOf, num, type WeaponTemplate } from './types';

const TAU = Math.PI * 2;
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Flat double-faced strip in the edge plane at x (inlays, cores): along +Z from z0 over `len`, half-width hw(t),
 * centre offset off(t) on Y. Indexed, with normal + uv so it merges with kit geometry.
 */
function stripX(x: number, z0: number, len: number, n: number, hw: (t: number) => number, off: (t: number) => number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = Math.max(0.0004, hw(t)), y = off(t), z = z0 + t * len;
    pos.push(x, y - w, z, x, y + w, z);
    nor.push(Math.sign(x) || 1, 0, 0, Math.sign(x) || 1, 0, 0);
    uv.push(0, t, 1, t);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/* ================================================================================================================ */
/* Catene — Triplice Guinzaglio: three black-iron chains on a heavy ring, each ending in a barbed hook; ember heat    */
/* glints in the links. At rest the chains hang under gravity; on lashes they fly out to the swing's reach, fanned   */
/* like three heads (morph.extend).                                                                                 */
/* ================================================================================================================ */
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2);
const _qw = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _g = new THREE.Vector3();

export const catene: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.5, metalness: 0.75, glowIntensity: 2.2 });
  const NC = Math.max(1, Math.round(num(def, 'chains', 3)));
  const LL = num(def, 'link_len', 0.09);
  const NL = Math.max(8, Math.round(num(def, 'links', 12) * 1.25));
  const EXT = num(def, 'extend', 4.4);
  const iron = c.primary, ember = c.accent;
  // the handle: an iron-bound grip, a pommel ring, the heavy joining ring the chains hang from
  grip(f, -0.12, 0.09, 0.019, mix(c.secondary, '#1a1416', 0.4), 6);
  f.add('metal', latheZ([[0, -0.15], [0.02, -0.146], [0.026, -0.13], [0.021, -0.118], [0, -0.116]], f.seg(10, 6)), shade(iron, 1.4));
  f.add('metal', latheZ([[0.0, 0.088], [0.026, 0.09], [0.03, 0.11], [0.022, 0.13], [0, 0.132]], f.seg(10, 6)), shade(iron, 1.5));
  const ring = geo.torus(0.04, 0.011, f.seg(6, 4), f.seg(16, 10));
  ring.rotateY(Math.PI / 2);
  f.add('metal', ring, shade(iron, 1.6), [0, 0, 0.17]);
  // three studs on the ring (one per chain), ember-hot
  for (let i = 0; i < NC; i++) f.add('glow', geo.ellipsoid(0.008, 0.008, 0.008, 6, 4), ember, [(i - (NC - 1) / 2) * 0.022, 0, 0.21]);
  // barbed hooks (one piece per chain): an eye, a curved hook, a back barb
  const hooks: THREE.Object3D[] = [];
  for (let i = 0; i < NC; i++) {
    const eye = geo.torus(0.016, 0.005, 3, f.seg(8, 5));
    eye.rotateY(Math.PI / 2);
    geo.paint(eye, shade(iron, 1.5));
    const hook = geo.horn(0.15, 0.013, 2.2, 0, f.seg(7, 5), f.seg(5, 4));
    hook.rotateX(Math.PI / 2);
    hook.translate(0, 0, 0.012);
    geo.gradient(hook, 2, shade(iron, 1.3), mix(iron, '#5a5058', 0.6));
    const barb = geo.spike(0.008, 0.05, 4, 0);
    barb.rotateX(-Math.PI * 0.75);
    barb.translate(0, 0.012, 0.09);
    geo.paint(barb, shade(iron, 1.4));
    const hp = f.piece('metal', [eye, hook, barb]);
    f.piece('glow', [geo.paint(geo.ellipsoid(0.006, 0.006, 0.02, 5, 4).translate(0, -0.03, 0.12), ember)], hp);
    hooks.push(hp);
  }
  // one link (instanced NC x NL): an oval ring, long axis on Z; ember-dark gradient across it
  const link = geo.torus(0.021, 0.0052, 3, f.q >= 0.8 ? 5 : 4);
  link.scale(1, 1.75, 1);
  link.rotateX(Math.PI / 2);
  geo.gradient(link, 1, shade(iron, 2.2), mix(iron, '#3a3036', 0.5));
  const linkMat = ctx.kit.surface({ vertexColors: true, metalness: 0.8, roughness: 0.4, detail: 'metal', detailScale: 9, detailStrength: 0.3, rim: 1.3, emissive: ember, emissiveIntensity: 0.04 });
  const links = new THREE.InstancedMesh(link, linkMat, NC * NL);
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  links.frustumCulled = false;
  const b = f.build();
  b.root.add(links);
  b.triangles += geo.triCount(link) * NC * NL;
  const glow = b.materials.glow;
  const anchorZ = 0.2;
  // centre lines, NC x (NL + 1) points
  const P = new Float32Array(NC * (NL + 1) * 3);
  const tip = new THREE.Vector3(0, 0, anchorZ + NL * LL * 0.8), base = new THREE.Vector3(0, 0, anchorZ + 0.4);
  let ext = 0, extNow = 0, art = 0, sw = 0, time = 0;
  const place = (): void => {
    // gravity in the weapon frame: the chains hang toward the ground when they are not thrown out
    _g.set(0, -1, 0);
    if (b.root.parent) {
      b.root.updateWorldMatrix(true, false);
      b.root.getWorldQuaternion(_qw);
      _g.applyQuaternion(_qw.invert());
    }
    const e = smooth(extNow);
    const restGap = LL * 0.5, L = EXT;
    const mid = (NC - 1) / 2;
    for (let ci = 0; ci < NC; ci++) {
      const fan = (ci - mid) * (0.34 + sw * 0.12);
      const ph = ci * 2.1;
      for (let i = 0; i <= NL; i++) {
        const t = i / NL, o = (ci * (NL + 1) + i) * 3;
        // hanging: straight down from the ring, a slow sway, the three chains a little apart
        const sway = Math.sin(time * 1.6 + ph) * 0.05 * t;
        // hung from three points of the ring, splaying a little as they fall
        const rx = (ci - mid) * (0.03 + t * 0.07) + sway, ry = (ci - mid) * t * 0.04, rz = anchorZ;
        const hx = rx + _g.x * restGap * i, hy = ry + _g.y * restGap * i, hz = rz + _g.z * restGap * i;
        // thrown: out along +Z to the reach, fanned in the edge plane, a travelling whip wave
        const amp = (0.14 + sw * 0.12) * Math.sin(t * Math.PI);
        const ex = (ci - mid) * 0.05 * t + Math.sin(t * 5 - time * 9 + ph) * 0.06 * t;
        const ey = Math.sin(fan) * t * L + amp * Math.sin(t * 7.5 - time * 14 + ph);
        const ez = anchorZ + Math.cos(fan) * t * L;
        P[o] = hx + (ex - hx) * e;
        P[o + 1] = hy + (ey - hy) * e;
        P[o + 2] = hz + (ez - hz) * e;
      }
      for (let i = 0; i < NL; i++) {
        const o = (ci * (NL + 1) + i) * 3;
        _d.set(P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]);
        const len = Math.max(1e-4, _d.length());
        _d.multiplyScalar(1 / len);
        _q.setFromUnitVectors(Z, _d);
        if (i % 2) _q.multiply(_qr);
        _p.set((P[o] + P[o + 3]) / 2, (P[o + 1] + P[o + 4]) / 2, (P[o + 2] + P[o + 5]) / 2);
        // links stretch a little when the chain is thrown (motion reads as a taut line of iron)
        _s.set(1, 1, Math.min(2.8, Math.max(0.9, len / (LL * 0.82))));
        _m4.compose(_p, _q, _s);
        links.setMatrixAt(ci * NL + i, _m4);
      }
      const o = (ci * (NL + 1) + NL) * 3;
      const h = hooks[ci];
      h.position.set(P[o], P[o + 1], P[o + 2]);
      _d.set(P[o] - P[o - 3], P[o + 1] - P[o - 2], P[o + 2] - P[o - 1]).normalize();
      h.quaternion.setFromUnitVectors(Z, _d);
      if (ci === Math.round(mid)) {
        tip.set(P[o] + _d.x * 0.12, P[o + 1] + _d.y * 0.12, P[o + 2] + _d.z * 0.12);
        const m = (ci * (NL + 1) + Math.round(NL * 0.35)) * 3;
        base.set(P[m], P[m + 1], P[m + 2]);
      }
    }
    links.instanceMatrix.needsUpdate = true;
  };
  place();
  return finish(def, b, {
    base, tip, grip: 'r',
    trail: { color: '#ffd8b0', glow: '#ff5a2a', width: 1.0 },
    aura: { kind: 'ember', color: '#ff7a3a', rate: 4, from: 0.2 },
    morph(m) {
      ext = m.extend;
      art = m.art;
      sw = m.swing;
    },
    update(dt, t) {
      time = t;
      const k = ext > extNow ? 1 - Math.exp(-dt * 22) : 1 - Math.exp(-dt * 7);
      extNow += (ext - extNow) * k;
      if (extNow < 1e-3) extNow = 0;
      place();
      // heat glints in the links only when they bite (lashes, Arts)
      linkMat.emissiveIntensity = 0.04 + extNow * 0.3 + art * 0.8 + Math.max(0, Math.sin(t * 6.1)) * 0.03;
      if (glow) glow.emissiveIntensity = 1.8 + art * 2.5 + Math.sin(t * 4.3) * 0.3;
    },
  }, [link, linkMat, links]);
};

/* ================================================================================================================ */
/* Spadone — Brace Eterna: dark red flamberge, an incandescent core down the fuller, flames licking both edges      */
/* (additive flame sheets that grow under Lama Rovente), curling flame quillons, an ember pommel                     */
/* ================================================================================================================ */
const FLAME_VERT = /* glsl */ `
attribute vec3 aF; // x along 0..1, y across 0 edge .. 1 flame top, z side (+1 / -1)
uniform float uH;
varying vec2 vF;
void main() {
  vF = aF.xy;
  vec3 p = position;
  p.y += aF.z * aF.y * uH * (0.55 + 0.45 * sin(aF.x * 3.14159));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uI;
uniform vec3 uCore;
uniform vec3 uGlow;
varying vec2 vF;
void main() {
  float u = vF.x, v = vF.y;
  float n = 0.5 + 0.5 * sin(u * 46.0 - uTime * 8.0) * sin(u * 19.0 + uTime * 5.3 + v * 3.0);
  n = n * 0.75 + 0.25 * (0.5 + 0.5 * sin(u * 97.0 - uTime * 15.0));
  float h = 0.3 + 0.7 * n;
  float a = (1.0 - smoothstep(h * 0.35, h, v)) * smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.88, 1.0, u));
  vec3 col = mix(uCore, uGlow, smoothstep(0.0, h, v));
  gl_FragColor = vec4(col * a * uI, 1.0);
}`;

export const spadone: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.38, metalness: 0.5, glowIntensity: 2.4 });
  const L = num(def, 'blade_len', 1.45), W = num(def, 'blade_w', 0.14), waves = num(def, 'wave', 7);
  const z0 = 0.2, th = 0.016;
  const steel = c.primary, dark = c.secondary, ember = c.accent;
  // long two-hand grip, a flame-bud pommel with an ember eye
  grip(f, -0.34, 0.08, 0.02, mix(dark, '#120a0a', 0.3), 9);
  f.add('metal', latheZ([[0, -0.44], [0.012, -0.43], [0.03, -0.405], [0.034, -0.385], [0.026, -0.36], [0.02, -0.345], [0, -0.343]], f.seg(12, 7)), shade(steel, 0.9));
  f.add('glow', geo.ellipsoid(0.012, 0.012, 0.016, 7, 5), ember, [0, 0, -0.447]);
  // guard: wide, the quillons curling up toward the blade like flame tongues
  for (const s of [-1, 1]) {
    const pts: V3[] = [[0, 0, 0.1], [0, s * 0.09, 0.098], [0, s * 0.17, 0.11], [0, s * 0.215, 0.15], [0, s * 0.2, 0.19], [0, s * 0.175, 0.175]];
    f.add('metal', geo.tube(pts, (t) => 0.013 * (1 - t * 0.7) + 0.003, { radial: f.seg(6, 4), perSeg: 3 }), shade(steel, 1.05));
  }
  f.add('metal', geo.bevelBox(0.04, 0.07, 0.045, 0.01), shade(steel, 0.85), [0, 0, 0.105]);
  f.add('glow', geo.ellipsoid(0.008, 0.015, 0.015, 6, 4), ember, [0.02, 0, 0.108]);
  f.add('glow', geo.ellipsoid(0.008, 0.015, 0.015, 6, 4), ember, [-0.02, 0, 0.108]);
  // ricasso with parrying lugs
  f.add('metal', bladeZ(0.085, [[0, W * 0.3], [1, W * 0.3]], th * 1.05, 2), shade(steel, 0.8), [0, 0, 0.125]);
  for (const s of [-1, 1]) f.add('metal', geo.spike(0.012, 0.045, 4, 0).rotateZ(-s * Math.PI / 2), shade(steel, 0.95), [0, s * W * 0.3, 0.2]);
  // the flamberge: the whole blade snakes in the edge plane, width tapering, darker steel near the edges
  const prof: [number, number][] = [[0, W * 0.5], [0.06, W * 0.47], [0.7, W * 0.4], [0.9, W * 0.26], [1, 0.001]];
  const wav = (t: number): number => Math.sin(t * waves * Math.PI) * W * 0.11 * (1 - t * 0.55) * smooth(t / 0.08);
  const bl = bladeZ(L, prof, th, f.seg(34, 20), wav);
  f.grad('metal', bl, 2, mix(steel, '#8a2a1a', 0.35), mix(steel, '#c8603a', 0.5), [0, 0, z0]);
  // the incandescent core: a narrow glowing strip in the fuller of each flat, white-hot at the hilt, ember toward the point
  for (const s of [-1, 1]) {
    // geo.blade adds a bevel of 0.42 x th on each flat: the strip sits just outside it
    const core = stripX(s * (th * 0.92 + 0.0008), z0 + 0.02, L * 0.84, f.seg(40, 18), (t) => W * (0.075 - t * 0.04), (t) => wav((0.02 + t * L * 0.84) / L));
    f.grad('glow', core, 2, '#fff0b0', ember);
  }
  // flame sheets along both edges (own additive material)
  const n = f.seg(48, 20);
  const fp: number[] = [], fa: number[] = [], fi: number[] = [];
  for (const side of [1, -1]) {
    const off = fp.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = 0.04 + (i / n) * 0.9;
      const y = side * sampleProfile(prof, t) + wav(t), z = z0 + t * L;
      fp.push(0, y, z, 0, y, z);
      fa.push(i / n, 0, side, i / n, 1, side);
      if (i < n) {
        const a = off + i * 2;
        fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  flameGeo.setAttribute('aF', new THREE.Float32BufferAttribute(fa, 3));
  flameGeo.setIndex(fi);
  const flameMat = new THREE.ShaderMaterial({
    name: 'weapon-flame', vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uH: { value: 0.07 }, uI: { value: 1 }, uCore: { value: new THREE.Color('#ffd27a') }, uGlow: { value: new THREE.Color(ember).multiplyScalar(0.8) } },
  });
  const flames = new THREE.Mesh(flameGeo, flameMat);
  flames.frustumCulled = false;
  flames.renderOrder = 12;
  const b = f.build();
  b.root.add(flames);
  b.triangles += fi.length / 3;
  const glow = b.materials.glow;
  let art = 0, buff = 0, sw = 0;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, z0 + 0.15), tip: new THREE.Vector3(0, 0, z0 + L), grip: 'both',
    trail: { color: '#ffe0a0', glow: '#ff6a1a', width: 1.15 },
    aura: { kind: 'ember', color: '#ff8a2a', rate: 7 },
    morph(m) {
      art = m.art;
      buff = m.buff ?? 0;
      sw = m.swing;
    },
    update(_dt, time) {
      flameMat.uniforms.uTime.value = time;
      flameMat.uniforms.uH.value = 0.06 + sw * 0.03 + art * 0.07 + buff * 0.16;
      flameMat.uniforms.uI.value = 0.85 + buff * 0.7 + art * 0.5 + Math.sin(time * 9.3) * 0.08;
      if (glow) glow.emissiveIntensity = 2.0 + Math.sin(time * 2.1) * 0.35 + art * 2.0 + buff * 1.6;
    },
  }, [flameGeo, flameMat]);
};

/* ================================================================================================================ */
/* Martello da guerra — Tuono Spezzacielo: azure metal head bound in silver, a striking face and a back spike, storm  */
/* runes; live sparks crawl along the haft (flickering arc pieces re-placed every few frames)                        */
/* ================================================================================================================ */
export const martello_da_guerra: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.22, metalness: 0.85, glowIntensity: 2.6 });
  const HL = num(def, 'haft_len', 1.35), HW = num(def, 'head_w', 0.5), HH = num(def, 'head_h', 0.26), NA = Math.max(0, Math.round(num(def, 'arcs', 4)));
  const azure = c.primary, silver = c.secondary, spark = c.accent;
  const zb = -0.48, zt = zb + HL, zh = zt - HH * 0.42;
  // haft: blue-black steel, silver rings, a leather two-hand grip
  f.grad('metal', latheZ([[0, zb - 0.03], [0.022, zb - 0.02], [0.026, zb + 0.02], [0.021, zb + 0.06], [0.02, zt - 0.3], [0.024, zt - 0.05], [0, zt]], f.seg(12, 7)), 2, '#1e2434', mix(azure, '#1e2434', 0.6));
  grip(f, zb + 0.07, zb + 0.62, 0.022, '#2a2630', 9);
  for (const z of [zb + 0.04, zb + 0.66, zt - 0.42]) f.add('metal', latheZ([[0.023, z - 0.016], [0.028, z - 0.01], [0.028, z + 0.01], [0.023, z + 0.016]], f.seg(12, 7)), silver);
  // langets: silver straps from the head down the haft
  for (const s of [-1, 1]) f.add('metal', geo.bevelBox(0.008, 0.026, 0.3, 0.003, 1), silver, [s * 0.022, 0, zh - HH * 0.5 - 0.12]);
  // the head: an azure block, octagonal striking face on +Y, a back spike on -Y, silver bands, a crown point
  f.add('metal', geo.bevelBox(HH * 0.7, HW * 0.56, HH, 0.03, 2), azure, [0, 0, zh]);
  const face = new THREE.CylinderGeometry(HH * 0.5, HH * 0.56, HW * 0.16, f.seg(8, 6), 1);
  f.add('metal', face, shade(azure, 1.15), [0, HW * 0.32, zh], [0, 22.5, 0]);
  const faceRim = geo.torus(HH * 0.52, 0.011, 4, f.seg(16, 8));
  faceRim.rotateX(Math.PI / 2);
  f.add('metal', faceRim, silver, [0, HW * 0.4, zh]);
  const back = geo.spike(HH * 0.32, HW * 0.48, f.seg(8, 5), 0);
  back.rotateZ(Math.PI);
  f.grad('metal', back, 1, mix(silver, '#ffffff', 0.4), shade(azure, 1.1), [0, -HW * 0.26, zh]);
  for (const y of [-HW * 0.12, HW * 0.12]) {
    const band = geo.torus(HH * 0.6, 0.012, 4, f.seg(16, 8));
    band.rotateX(Math.PI / 2);
    band.scale(0.82, 1, 1.08);
    f.add('metal', band, silver, [0, y, zh]);
  }
  f.add('metal', geo.spike(0.03, 0.16, f.seg(6, 4), 0).rotateX(Math.PI / 2), mix(silver, '#ffffff', 0.3), [0, 0, zh + HH * 0.5]);
  // storm runes on both flats: a forked lightning glyph
  for (const s of [-1, 1]) {
    const x = s * (HH * 0.35 + 0.0015);
    f.add('glow', inlay([[x, -HW * 0.2, zh + HH * 0.32], [x, -HW * 0.05, zh + HH * 0.05], [x, -HW * 0.12, zh - HH * 0.02], [x, HW * 0.08, zh - HH * 0.34]], 0.0045, 3), spark);
    f.add('glow', inlay([[x, -HW * 0.05, zh + HH * 0.05], [x, HW * 0.12, zh + HH * 0.22]], 0.0035, 3), spark);
  }
  // live sparks: NA jagged arcs, each re-placed along the haft every few frames
  const rng = new Prng(seedOf(def.id));
  const arcs: THREE.Object3D[] = [];
  for (let i = 0; i < NA; i++) {
    const pts: V3[] = [];
    const len = 0.16 + rng.next() * 0.1;
    for (let k = 0; k <= 6; k++) pts.push([0.026 + (rng.next() - 0.3) * 0.02, (rng.next() - 0.5) * 0.04, (k / 6) * len]);
    arcs.push(f.piece('glow', [geo.paint(inlay(pts, 0.0028, 3), mix(spark, '#ffffff', 0.4))]));
  }
  const b = f.build();
  const glow = b.materials.glow;
  let art = 0, sw = 0, next = 0, seed = seedOf(def.id) % 9973;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed % 10000) / 10000;
  };
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, zh - HH * 0.5 - 0.2), tip: new THREE.Vector3(0, 0, zh + HH * 0.5), grip: 'both',
    trail: { color: '#eaf8ff', glow: '#4a8ae8', width: 1.2 },
    aura: { kind: 'spark', color: '#bfeaff', rate: 10, from: 0.15 },
    morph(m) {
      art = m.art;
      sw = m.swing;
    },
    update(_dt, time) {
      if (time >= next || time < next - 1) {
        next = time + 0.05 + rand() * 0.06;
        for (const a of arcs) {
          a.visible = rand() < 0.55 + art * 0.4 + sw * 0.2;
          a.position.set(0, 0, zb + 0.1 + rand() * (zt - zb - 0.45));
          a.rotation.set(0, 0, rand() * TAU);
          a.scale.set(1, 1, rand() < 0.5 ? -1 : 1);
        }
      }
      if (glow) glow.emissiveIntensity = 2.2 + Math.max(0, Math.sin(time * 23) * Math.sin(time * 7.1)) * 1.4 + art * 2.6;
    },
  });
};

/* ================================================================================================================ */
/* Stocco — Brina Silente: an ultra-thin blade of clear azure ice (translucent, a sliver of light inside), a swept    */
/* hilt of frost crystal, crystal finials; cold breath drifts from the point (aura)                                  */
/* ================================================================================================================ */
export const stocco: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.14, metalness: 0.55, glowIntensity: 1.6, rim: 1.6 });
  const L = num(def, 'blade_len', 1.05), W = num(def, 'blade_w', 0.022);
  const ice = c.primary, deep = c.secondary;
  const frost = mix(ice, '#ffffff', 0.35);
  const z0 = 0.09;
  // wire-wrapped grip, a faceted crystal pommel
  grip(f, -0.14, 0.055, 0.0135, mix(deep, '#c8d8e8', 0.4), 9);
  f.add('metal', geo.ellipsoid(0.022, 0.022, 0.03, 6, 4), frost, [0, 0, -0.17]);
  f.add('glow', geo.ellipsoid(0.008, 0.008, 0.012, 5, 3), c.accent, [0, 0, -0.2]);
  // swept hilt: knuckle bow, cross with crystal finials, two side rings and the arms
  f.add('metal', geo.tube([[0, 0.0, 0.075], [0, 0.06, 0.05], [0, 0.085, -0.03], [0, 0.065, -0.11], [0, 0.015, -0.15]], 0.0042, { radial: f.seg(5, 4), perSeg: 4 }), frost);
  f.add('metal', geo.tube([[0, -0.12, 0.08], [0, -0.04, 0.072], [0, 0.04, 0.072], [0, 0.12, 0.08]], 0.0048, { radial: f.seg(5, 4), perSeg: 3 }), frost);
  for (const s of [-1, 1]) {
    f.add('glow', geo.spike(0.008, 0.045, 5, 0).rotateZ(-s * Math.PI / 2), mix(ice, '#ffffff', 0.6), [0, s * 0.12, 0.08]);
    const sr = geo.torus(0.034, 0.0034, 4, f.seg(14, 8));
    sr.rotateY(Math.PI / 2);
    sr.rotateX(0.3 * s);
    f.add('metal', sr, frost, [s * 0.026, 0, 0.05]);
    f.add('metal', geo.tube([[0, s * 0.012, 0.075], [s * 0.014, s * 0.02, 0.1], [0, s * 0.006, 0.12]], 0.003, { radial: 4, perSeg: 3 }), frost);
  }
  // frost crystals growing at the base of the blade
  const rng = new Prng(seedOf(def.id));
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * TAU, r = 0.008 + rng.next() * 0.01;
    const sp = geo.spike(0.004 + rng.next() * 0.003, 0.02 + rng.next() * 0.025, 4, 0);
    sp.rotateX(Math.PI / 2 - 0.5 - rng.next() * 0.6);
    sp.rotateZ(a);
    f.add('glow', sp, mix(ice, '#ffffff', 0.5), [Math.cos(a) * r, Math.sin(a) * r, z0 + 0.005]);
  }
  // the ultra-thin ice blade: translucent material of its own, a sliver of light inside
  const prof: [number, number][] = [[0, W * 0.55], [0.08, W * 0.5], [0.85, W * 0.32], [1, 0.0005]];
  const bladeGeo = bladeZ(L, prof, 0.0075, f.seg(16, 8));
  geo.gradient(bladeGeo, 2, mix(deep, ice, 0.55), mix(ice, '#ffffff', 0.4));
  bladeGeo.translate(0, 0, z0);
  const iceMat = ctx.kit.surface({ vertexColors: true, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.86, emissive: '#9fd4ff', emissiveIntensity: 0.9, rim: 2.8, detail: 'crystal', detailScale: 6, detailStrength: 0.25 });
  const blade = new THREE.Mesh(bladeGeo, iceMat);
  blade.frustumCulled = false;
  blade.renderOrder = 2;
  f.add('glow', inlay([[0, 0, z0 + 0.02], [0, 0, z0 + L * 0.93]], 0.0026, 3), '#ffffff');
  const b = f.build();
  b.root.add(blade);
  b.triangles += geo.triCount(bladeGeo);
  const glow = b.materials.glow;
  let art = 0;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, z0 + 0.12), tip: new THREE.Vector3(0, 0, z0 + L), grip: 'r',
    trail: { color: '#ffffff', glow: '#8fd0ff', width: 0.95 },
    aura: { kind: 'mist', color: '#e4f6ff', rate: 7, from: 0.55 },
    morph(m) {
      art = m.art;
    },
    update(_dt, time) {
      iceMat.emissiveIntensity = 0.85 + Math.sin(time * 1.7) * 0.1 + art * 1.4;
      if (glow) glow.emissiveIntensity = 1.4 + Math.sin(time * 2.3 + 1) * 0.2 + art * 2.4;
    },
  }, [bladeGeo, iceMat]);
};

/* ================================================================================================================ */
/* Ascia a due mani — Fenditura Ardente: a heavy bearded blade of black volcanic rock split by veins of lava (and a    */
/* molten line inside the edge), charred haft with iron bands, an obsidian spike crowning the haft; lava drips       */
/* ================================================================================================================ */
export const ascia_a_due_mani: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { matteRough: 0.92, matteDetail: 'stone', matteDetailScale: 10, metalRough: 0.18, metalness: 0.5, glowIntensity: 2.4 });
  const HL = num(def, 'haft_len', 1.4), H = num(def, 'blade_h', 0.55), D = num(def, 'blade_d', 0.42), NV = Math.max(2, Math.round(num(def, 'veins', 6)));
  const rock = c.primary, haft = c.secondary, lava = c.accent;
  const zb = -0.5, zt = zb + HL, zc = zt - H * 0.55;
  const rng = new Prng(seedOf(def.id));
  // charred haft: matte wood, iron bands, a leather two-hand grip
  f.grad('matte', latheZ([[0, zb - 0.02], [0.026, zb], [0.027, zb + 0.3], [0.025, zt - 0.2], [0.03, zt], [0, zt + 0.01]], f.seg(12, 7)), 2, shade(haft, 0.8), mix(haft, '#1a1210', 0.5));
  grip(f, zb + 0.04, zb + 0.58, 0.026, '#2a1e18', 8);
  for (const z of [zb + 0.02, zb + 0.62, zc - H * 0.55]) f.add('metal', latheZ([[0.027, z - 0.018], [0.032, z - 0.012], [0.032, z + 0.012], [0.027, z + 0.018]], f.seg(12, 7)), '#2a2628');
  // the obsidian spike crowning the haft: glassy black, a faint violet sheen
  f.grad('metal', geo.spike(0.034, 0.3, f.seg(7, 5), 0).rotateX(Math.PI / 2), 2, '#0a080c', '#2a2234', [0, 0, zt - 0.02]);
  // the bearded blade (outline in the edge plane: x = +Y away from the haft, y = Z along it)
  const outline: [number, number][] = [
    [0.02, -0.13], [0.1, -0.16], [D * 0.55, -H * 0.42], [D * 0.8, -H * 0.55], [D * 0.95, -H * 0.36], [D * 1.03, -H * 0.1],
    [D * 1.04, H * 0.12], [D * 0.97, H * 0.34], [D * 0.84, H * 0.47], [D * 0.55, H * 0.3], [0.1, H * 0.2], [0.02, H * 0.17],
  ];
  const bg = geo.blade(outline, 0.05, 0.022, 2);
  bg.rotateX(Math.PI / 2);
  bg.rotateZ(Math.PI / 2);
  geo.noiseDisplace(bg, 0.008, 14, seedOf(def.id) % 97);
  f.grad('matte', bg, 1, mix(rock, '#2a2420', 0.5), shade(rock, 1.25), [0, 0, zc]);
  // the back of the head: a lava-cracked rock knob
  f.add('matte', geo.rock(0.06, 1, 5, 0.3, [0.8, 1.2, 1.3]), shade(rock, 1.1), [0, -0.05, zc]);
  // a molten line just inside the edge
  const edge: V3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, a = -0.95 + t * 1.9;
    edge.push([0, D * (0.72 + 0.24 * Math.cos(a)), zc + Math.sin(a) * H * 0.46]);
  }
  for (const s of [-1, 1]) {
    f.add('glow', inlay(edge.map(([, y, z]) => [s * 0.026, y * 0.96, z] as V3), 0.0035, 3), mix(lava, '#ffd080', 0.3));
    // branching veins from the haft toward the edge
    for (let v = 0; v < NV; v++) {
      const zz = zc + (v / (NV - 1) - 0.5) * H * 0.62;
      const pts: V3[] = [[s * 0.027, 0.06, zz]];
      let y = 0.06, z = zz;
      for (let k = 0; k < 4; k++) {
        y += D * (0.13 + rng.next() * 0.08);
        z += (rng.next() - 0.5) * H * 0.12 + (zz - zc) * 0.12;
        pts.push([s * 0.027, y, z]);
      }
      f.add('glow', inlay(pts, 0.0042 - v * 0.0002, 3), v % 2 ? lava : mix(lava, '#ffb040', 0.4));
      if (v % 2 === 0) {
        const p2 = pts[2];
        f.add('glow', inlay([p2, [p2[0], p2[1] + D * 0.12, p2[2] + (rng.next() - 0.5) * 0.08]], 0.0028, 3), lava);
      }
    }
  }
  const b = f.build();
  const glow = b.materials.glow;
  let art = 0;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0.02, zc - H * 0.4), tip: new THREE.Vector3(0, D * 0.95, zc + H * 0.08), grip: 'both',
    trail: { color: '#ffd0a0', glow: '#ff4a10', width: 1.15 },
    aura: { kind: 'drip', color: '#ff7a2a', rate: 4, from: 0.5 },
    morph(m) {
      art = m.art;
    },
    update(_dt, time) {
      // a slow molten heartbeat
      const beat = Math.pow(Math.max(0, Math.sin(time * 2.2)), 6);
      if (glow) glow.emissiveIntensity = 1.9 + beat * 1.2 + art * 2.8;
    },
  });
};

export const ACT2_TEMPLATES: Record<string, WeaponTemplate> = { catene, spadone, martello_da_guerra, stocco, ascia_a_due_mani };
