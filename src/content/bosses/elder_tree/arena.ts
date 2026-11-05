/**
 * Cuore della Foresta — the Elder Tree's clearing (center [0, 0, 120], walkable r 27, fog gate south at z 93, the road north
 * to the swamp at z 190; the tree stands on the north side at z ~132 and never moves).
 * A ring of colossal black trunks (r 31-38, open at the gate and at the north road) holds up a canopy that has not let light
 * through in centuries: dark leaf masses 27-36 m up, hanging moss, and only a small gap right above the Elder Tree, where its
 * own crown fills the sky. Black surface roots run from its foot across the floor (render-only, flat); luminous mushrooms (the
 * forest's teal, violet and gold) ring the clearing; a Cercatore's unlit lantern and helm lie at the western edge.
 * Cues:
 *  - elder_heart_open (phase 2): the heart's gold light spills in a pool on the roots in front of the trunk and the gold
 *    mushrooms around the clearing answer it.
 *  - first_light (death / defeat sequence): the first ray of light in centuries comes down through the gap onto the place where
 *    the tree stood: a slanted shaft with drifting motes and a pool of pale dawn on the floor. Once the Elder Tree is defeated
 *    the ray stays (weaker) every time the forest is loaded.
 *  - arena_state:default (retry): both reset (the ray stays only if the tree is already defeated).
 */
import * as THREE from 'three';
import type { ArenaDef, ZoneDef } from '../../../core/types';
import type { Sim } from '../../../sim/sim';
import type { ArenaVisual, RenderCtx } from '../../../render/types';
import { zoneEnv } from '../../../render/world/env';
import { Parts, R, blob, cyl, disposeTree, lathe, mat4, tube } from '../../../render/world/geo';
import { GlowSet } from '../../../render/world/glows';
import { ATMOS } from '../../../render/world/atmosphere';

const TAU = Math.PI * 2;
/** Where the Elder Tree stands (offset from the arena center, matches its spawn). */
const TREE_DZ = 12.2;
const MUSHROOM = ['#7af0d8', '#b89aff', '#ffd27a'];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Additive light shaft (open cone), bright toward the canopy, soft at the edges, dust bands drifting down. */
function shaftMaterial(height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uH: { value: height }, uTime: ATMOS.uTime, uHazeK: ATMOS.uHazeK, uColor: { value: new THREE.Color('#ffe8b4') } },
    vertexShader: /* glsl */ `
      uniform float uH;
      varying vec3 vN; varying vec3 vW; varying float vH;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vH = position.y / uH;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOn; uniform float uTime; uniform float uHazeK; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vW; varying float vH;
      void main() {
        vec3 vd = normalize(cameraPosition - vW);
        float face = abs(dot(normalize(vN), vd));
        float edge = pow(face, 1.6);
        float vert = smoothstep(0.0, 0.18, vH) * (1.0 - smoothstep(0.72, 1.0, vH)) * (0.55 + 0.45 * vH);
        float bands = 0.75 + 0.25 * sin(vH * 38.0 + uTime * 0.7 + vW.x * 0.6) * sin(vH * 17.0 - uTime * 0.45 + vW.z * 0.4);
        float a = uOn * edge * vert * bands * 0.42 * uHazeK;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export default function build(def: ArenaDef, zone: ZoneDef, ctx: RenderCtx): ArenaVisual {
  const env = zoneEnv(zone, ctx);
  const root = new THREE.Group();
  root.name = `arena:${def.id}`;
  const r = new R(3301);
  const p = new Parts(3302);
  const [cx, , cz] = def.center;
  const rad = def.radius ?? 27;
  const tx = cx, tz = cz + TREE_DZ;
  const gy = (x: number, z: number) => env.heightAt(x, z);
  const q = ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.75 : 1;
  const gateA = Math.atan2(def.gate.pos[0] - cx, def.gate.pos[2] - cz);
  const openAt = [gateA, gateA + Math.PI]; // the fog gate and the road north
  const nearOpening = (a: number, w: number) => openAt.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < w);

  // --- colossal trunks around the clearing, leaning in toward the canopy
  const nT = 15;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * TAU + r.range(-0.12, 0.12);
    if (nearOpening(a, 0.3)) continue;
    const d = rad + r.range(4.5, 10.5);
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d, y = gy(x, z);
    const rr = r.range(2.0, 3.2);
    const lean = r.range(2, 5);
    const ix = -Math.sin(a) * lean, iz = -Math.cos(a) * lean;
    const pts = [V(x, y - 1.5, z), V(x + ix * 0.25, y + 12, z + iz * 0.25), V(x + ix * 0.7, y + 26, z + iz * 0.7), V(x + ix, y + 40, z + iz)];
    p.add(tube(pts, rr, 12, 10, rr * 0.55), 'matte', { color: ['#16120f', '#2e2822'], cover: 0.8, aoBottom: 0.5, jitter: 0.08 });
    // buttress roots
    for (let k = 0; k < 5; k++) {
      const b = a + (k / 5) * TAU + r.range(-0.2, 0.2);
      const ox = Math.sin(b), oz = Math.cos(b), len = rr + r.range(2.2, 4.2);
      const ex = x + ox * len, ez = z + oz * len;
      p.add(tube([V(x + ox * rr * 0.6, y + rr * 0.9, z + oz * rr * 0.6), V(x + ox * (rr + 0.9), y + 0.7, z + oz * (rr + 0.9)), V(ex, gy(ex, ez) - 0.5, ez)], rr * 0.42, 7, 6, 0.18), 'matte', { color: ['#14100d', '#2a241e'], cover: 1, aoBottom: 0.6 });
    }
    // two boughs reaching in toward the canopy
    for (let k = 0; k < 2; k++) {
      const hy = y + r.range(20, 30), side = k ? 1 : -1;
      const bx = x + ix * 0.6, bz = z + iz * 0.6;
      const dx = -Math.sin(a + side * 0.5), dz = -Math.cos(a + side * 0.5), len = r.range(9, 15);
      p.add(tube([V(bx, hy, bz), V(bx + dx * len * 0.5, hy + 3, bz + dz * len * 0.5), V(bx + dx * len, hy + 4.5, bz + dz * len)], rr * 0.42, 7, 6, 0.25), 'matte', { color: ['#1a1612', '#26201b'], cover: 0.5 });
    }
  }

  // --- the black canopy: leaf masses high above, a gap only over the Elder Tree (its own crown fills it)
  const nC = Math.round(34 * q);
  for (let i = 0; i < nC; i++) {
    const a = r.range(0, TAU), d = r.range(10, rad + 13);
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    if (Math.hypot(x - tx, z - (tz - 1)) < 9) continue;
    const s = r.range(6, 11);
    p.add(blob(s, 1, 0.42, r.int(1, 9999), 0.55), 'foliage', { color: ['#060806', '#141a12'], wind: 0.12 }, mat4([x, gy(cx, cz) + r.range(27, 36), z], [0, r.range(0, TAU), 0], [1, r.range(0.45, 0.7), 1]));
  }
  // hanging moss from the canopy
  const nM = Math.round(46 * q);
  for (let i = 0; i < nM; i++) {
    const a = r.range(0, TAU), d = r.range(12, rad + 6);
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    const top = gy(cx, cz) + r.range(26, 31), len = r.range(6, 13);
    p.add(tube([V(x, top, z), V(x + r.range(-0.4, 0.4), top - len * 0.55, z + r.range(-0.4, 0.4)), V(x, top - len, z)], r.range(0.1, 0.18), 4, 4, 0.03), 'foliage', { color: ['#3e4a2c', '#1e261a'], wind: 0.6, windByHeight: true });
  }

  // --- black surface roots from the tree's foot across the floor (flat, render-only)
  const nR = 13;
  for (let i = 0; i < nR; i++) {
    const a = (i / nR) * TAU + r.range(-0.15, 0.15);
    const len = r.range(12, 24) * (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 1.2 ? 1 : 0.6);
    const pts: THREE.Vector3[] = [];
    let x = tx + Math.sin(a) * 6.5, z = tz + Math.cos(a) * 6.5, h = a;
    for (let k = 0; k <= 6; k++) {
      pts.push(V(x, gy(x, z) + 0.05 + (k === 0 ? 0.3 : 0), z));
      h += r.range(-0.35, 0.35);
      x += Math.sin(h) * (len / 6);
      z += Math.cos(h) * (len / 6);
    }
    // flattened to a low hump on the paved floor (the arena floor is flat at floor_y)
    p.add(tube(pts, 0.42, 6, 18, 0.08), 'matte', { color: ['#120e0b', '#2a231c'], cover: 0.6 }, mat4([0, gy(tx, tz) * 0.45, 0], [0, 0, 0], [1, 0.55, 1]));
  }

  // --- luminous mushrooms ringing the clearing (+ the halo of each cluster in the glow set)
  const glows = new GlowSet(`arena-glows:${def.id}`);
  const goldGlints: number[] = [];
  const nMu = Math.round(18 * q) + 4;
  for (let i = 0; i < nMu; i++) {
    const a = (i / nMu) * TAU + r.range(-0.1, 0.1);
    if (nearOpening(a, 0.18)) continue;
    const d = rad + r.range(-3.5, 2.5);
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    const col = MUSHROOM[i % 3];
    const n = r.int(3, 6);
    for (let k = 0; k < n; k++) {
      const mx = x + r.range(-1.1, 1.1), mz = z + r.range(-1.1, 1.1), s = r.range(0.14, 0.42);
      const my = gy(mx, mz);
      p.add(cyl(s * 0.16, s * 0.22, s * 1.1, 6), 'matte', { color: '#cfc7b4', cover: 0 }, mat4([mx, my + s * 0.55, mz], [r.range(-0.2, 0.2), 0, r.range(-0.2, 0.2)]));
      p.add(lathe([[0.001, s * 0.42], [s * 0.75, s * 0.32], [s, s * 0.08], [s * 0.2, 0.0]], 8), 'glow', { color: col, emissive: 0.65 }, mat4([mx, my + s * 1.05, mz]));
    }
    glows.add({ pos: [x, gy(x, z) + 0.5, z], color: col, size: 2.4, intensity: 0.28, mode: 'orb', phase: r.range(0, TAU) });
    if (col === MUSHROOM[2]) goldGlints.push(glows.add({ pos: [x, gy(x, z) + 0.6, z], color: '#ffc964', size: 3.6, intensity: 0.5, mode: 'orb', phase: r.range(0, TAU), on: 0 }));
  }

  // --- a Cercatore fell here: a planted pole with an unlit lantern, a helm in the moss
  {
    const a = gateA + 1.9, d = rad - 1.2;
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d, y = gy(x, z);
    p.add(cyl(0.05, 0.06, 2.2, 6), 'matte', { color: '#3a2c20', cover: 0.3 }, mat4([x, y + 1.0, z], [0.18, 0, 0.1]));
    p.add(cyl(0.16, 0.2, 0.36, 6), 'metal', { color: '#2b2a28' }, mat4([x + 0.2, y + 1.85, z + 0.1]));
    p.add(cyl(0.04, 0.17, 0.12, 6), 'metal', { color: '#2b2a28' }, mat4([x + 0.2, y + 2.08, z + 0.1]));
    p.add(blob(0.3, 1, 0.08, 7, 0.35), 'metal', { color: '#3c3b38' }, mat4([x - 0.6, y + 0.12, z + 0.4], [0.4, 1.2, 0.3]));
  }

  root.add(p.build({ matte: { detail: 0.9, breakup: 0.35 } }, ctx.quality !== 'low'));

  // --- heart-open pool, first-light pool and motes
  const ty = gy(tx, tz);
  const heartPool = glows.add({ pos: [tx, ty + 0.08, tz - 4.2], color: '#ffc45e', size: 10, intensity: 0.42, mode: 'pool', on: 0 });
  const lightPool = glows.add({ pos: [tx, ty + 0.06, tz - 1.5], color: '#fff0c8', size: 13, intensity: 0.55, mode: 'pool', on: 0 });
  const motes: number[] = [];
  const nMo = Math.round(22 * q);
  for (let i = 0; i < nMo; i++) {
    const h = r.range(1, 22), sp = 1.8 + h * 0.08;
    motes.push(glows.add({ pos: [tx + 3.2 * (h / 22) + r.range(-sp, sp), ty + h, tz - 1.5 - 1.8 * (h / 22) + r.range(-sp, sp)], color: '#fff3d6', size: r.range(0.12, 0.3), intensity: 0.9, mode: 'glint', phase: r.range(0, TAU), on: 0 }));
  }
  glows.finish();
  root.add(glows.mesh);

  // the ray: from the canopy gap, slanted, onto the place where the tree stood
  const shaftH = 38;
  const shaftMat = shaftMaterial(shaftH);
  const sg = cyl(2.6, 4.6, shaftH, 28, true);
    const shaft = new THREE.Mesh(sg, shaftMat);
  const bottom = V(tx, ty, tz - 1.5), topP = V(tx + 6.5, ty + shaftH, tz - 5.0);
  const dir = topP.clone().sub(bottom).normalize();
  shaft.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
  shaft.position.copy(bottom); // world cyl() is base-anchored (y 0..h)
  shaft.scale.set(1, topP.distanceTo(bottom) / shaftH, 1);
  shaft.frustumCulled = false;
  shaft.renderOrder = 5;
  shaft.visible = false;
  root.add(shaft);

  let heartK = 0, heartWant = 0;
  let lightK = 0, lightWant = 0;
  return {
    root,
    setState(state: string) {
      if (state === 'default') {
        heartWant = 0;
        lightWant = 0;
      }
    },
    onCue(id: string) {
      if (id === 'elder_heart_open') heartWant = 1;
      else if (id === 'first_light') {
        lightWant = 1;
        heartWant = 0;
      }
    },
    update(sim: Sim, dt: number) {
      const here = !!sim.fight && sim.fight.arena === def.id;
      const defeated = sim.state.defeated.includes('elder_tree');
      // a fight in phase 2 (also a save loaded there) shows the heart's pool
      if (here && sim.boss?.flags.has('heart_open') && sim.boss.alive) heartWant = 1;
      if (!here && !defeated) heartWant = 0;
      const lw = Math.max(lightWant, defeated && !here ? 0.6 : 0);
      heartK += (heartWant - heartK) * Math.min(1, dt * (heartWant ? 0.8 : 1.5));
      lightK += (lw - lightK) * Math.min(1, dt * (lw > lightK ? 0.35 : 1.2));
      glows.setOn(heartPool, heartK * (0.85 + 0.15 * Math.sin(ATMOS.uTime.value * 5.5)));
      for (const g of goldGlints) glows.setOn(g, heartK * 0.8);
      glows.setOn(lightPool, lightK);
      for (const m of motes) glows.setOn(m, lightK);
      shaftMat.uniforms.uOn.value = lightK * (1 - 0.45 * ATMOS.uNight.value);
      shaft.visible = lightK > 0.005;
      glows.update(dt);
    },
    dispose() {
      glows.dispose();
      shaftMat.dispose();
      sg.dispose();
      disposeTree(root);
    },
  };
}
