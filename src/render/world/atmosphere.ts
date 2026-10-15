/**
 * Atmosphere: the Lungo Crepuscolo state (sky colors, glow, stars, aurora, clouds, fog, lights, exposure) blended smoothly
 * between time-of-day presets, zone changes, sky brightening (violet -> gold) and the ending sunrise.
 * Exposes shared uniforms (ATMOS) used by every world material so sky, fog, water and props always agree.
 */
import * as THREE from 'three';
import type { SkyPresetDef, TodPreset } from '../../core/types';
import { srgb } from './color';

/** Shared uniforms: pass these objects by reference into world shaders. Colors named u* are display-space unless noted. */
export const ATMOS = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Vector3(0.6, 0.55, 0.6) },
  uFogGlow: { value: new THREE.Vector3(0.9, 0.75, 0.5) },
  uGlowDir: { value: new THREE.Vector3(0, 0.2, 1).normalize() },
  uFogParams: { value: new THREE.Vector4(0.004, 0.0, 0, 0.1) },
  uFogMax: { value: 1 },
  uZenith: { value: new THREE.Vector3(0.3, 0.3, 0.5) },
  uHorizon: { value: new THREE.Vector3(0.9, 0.8, 0.6) },
  uGround: { value: new THREE.Vector3(0.35, 0.35, 0.37) },
  uGlow: { value: new THREE.Vector3(1, 0.85, 0.6) },
  uSkyBright: { value: 1 },
  uStars: { value: 0 },
  uAurora: { value: 0 },
  uAuroraA: { value: new THREE.Vector3(0.3, 1.0, 0.6) },
  uAuroraB: { value: new THREE.Vector3(0.6, 0.3, 1.0) },
  uCloud: { value: 0.5 },
  uCloudColor: { value: new THREE.Vector3(0.6, 0.55, 0.7) },
  uRays: { value: 0.5 },
  uFlash: { value: 0 },
  uSunDisc: { value: 0 },
  uShade: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: new THREE.Vector4(0.6, 0.8, 1, 0.5) },
  /** Linear working-space light terms for custom-lit shaders (grass, particles, water). */
  uLightDir: { value: new THREE.Vector3(0, 0.5, 1).normalize() },
  uLightColor: { value: new THREE.Color(1, 0.9, 0.8) },
  uHemiSky: { value: new THREE.Color(0.5, 0.5, 0.6) },
  uHemiGround: { value: new THREE.Color(0.2, 0.2, 0.2) },
  uCoverColor: { value: new THREE.Color(0.3, 0.4, 0.2) },
  uCoverAmount: { value: 0 },
  uGlowBoost: { value: 1 },
};

interface AtmosParams {
  zenith: THREE.Vector3;
  horizon: THREE.Vector3;
  ground: THREE.Vector3;
  glow: THREE.Vector3;
  glowDir: THREE.Vector3;
  fog: THREE.Vector3;
  stars: number;
  aurora: number;
  cloud: number;
  rays: number;
  light: THREE.Vector3; // linear * intensity
  hemiSky: THREE.Vector3; // linear * intensity
  hemiGround: THREE.Vector3;
  exposure: number;
  fogDensity: number;
  fogHeight: number;
  fogHeightBase: number;
  fogFalloff: number;
  night: number;
  sun: number;
  glowBoost: number;
}

function blank(): AtmosParams {
  return {
    zenith: new THREE.Vector3(), horizon: new THREE.Vector3(), ground: new THREE.Vector3(), glow: new THREE.Vector3(),
    glowDir: new THREE.Vector3(0, 0.2, 1), fog: new THREE.Vector3(), stars: 0, aurora: 0, cloud: 0.5, rays: 0.5,
    light: new THREE.Vector3(), hemiSky: new THREE.Vector3(), hemiGround: new THREE.Vector3(), exposure: 1,
    fogDensity: 0.004, fogHeight: 0, fogHeightBase: 0, fogFalloff: 0.1, night: 0, sun: 0, glowBoost: 1,
  };
}

function lerpParams(out: AtmosParams, a: AtmosParams, b: AtmosParams, t: number): void {
  out.zenith.lerpVectors(a.zenith, b.zenith, t);
  out.horizon.lerpVectors(a.horizon, b.horizon, t);
  out.ground.lerpVectors(a.ground, b.ground, t);
  out.glow.lerpVectors(a.glow, b.glow, t);
  out.glowDir.lerpVectors(a.glowDir, b.glowDir, t).normalize();
  out.fog.lerpVectors(a.fog, b.fog, t);
  out.light.lerpVectors(a.light, b.light, t);
  out.hemiSky.lerpVectors(a.hemiSky, b.hemiSky, t);
  out.hemiGround.lerpVectors(a.hemiGround, b.hemiGround, t);
  const k = ['stars', 'aurora', 'cloud', 'rays', 'exposure', 'fogDensity', 'fogHeight', 'fogHeightBase', 'fogFalloff', 'night', 'sun', 'glowBoost'] as const;
  for (const key of k) out[key] = a[key] + (b[key] - a[key]) * t;
}

function copyParams(out: AtmosParams, a: AtmosParams): void {
  lerpParams(out, a, a, 0);
}

export const FOG_DENSITY: Record<TodPreset['fog'], number> = { none: 0.0006, thin: 0.0021, light: 0.0034, medium: 0.0055, dense: 0.0105 };

/** Zone-level atmosphere modifiers (from the biome table or a custom zone builder). */
export interface AtmosZoneOpts {
  /** Extra low-lying mist (swamps, rivers): density at base height, base y, falloff per meter. */
  heightFog?: [number, number, number];
  cloud?: number;
  rays?: number;
  wind?: number;
  /** Multiplier on fog density (interiors, giant scale). */
  fogMult?: number;
  /** Aurora colors (display space hex). */
  aurora?: [string, string];
  /** Top coverage color (moss/snow/ash) for props and landmarks (linear hex) and its amount. */
  cover?: [string, number];
  /** Constant darkening of light under canopies (0..1). */
  canopy?: number;
}

const ACT_AURORA: Record<number, [string, string]> = {
  1: ['#7affc0', '#b48cff'],
  2: ['#ff5a6a', '#8a5aff'],
  3: ['#5affb4', '#5ab8ff'],
  4: ['#ff7ad8', '#7aff8a'],
  5: ['#ffd27a', '#6aa8ff'],
  6: ['#c25aff', '#ff3a5a'],
  7: ['#fff1c0', '#ffb07a'],
};

/** Sky brightening target (gold) colors, display space. */
const GOLD = { zenith: srgb('#7d78b8'), horizon: srgb('#ffd9a0'), glow: srgb('#ffe9b8'), fog: srgb('#e8cfb0') };

export class Atmosphere {
  readonly hemi = new THREE.HemisphereLight(0xb9a6d8, 0x3b3442, 1.0);
  readonly sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
  readonly fog = new THREE.FogExp2(0x6a4a6a, 0.004);
  exposure = 1;
  private cur = blank();
  private from = blank();
  private to = blank();
  private t = 1;
  private dur = 2.5;
  private flash = 0;
  private zoneOpts: AtmosZoneOpts = {};
  private act = 1;
  private qualityFog = 1;
  private shadeApplied = -1;
  private tmpV = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    scene.add(this.hemi);
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = this.fog;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
  }

  setQualityFog(k: number): void {
    this.qualityFog = k;
  }

  /** Compute the target parameters for a sky preset + tod preset. */
  private build(out: AtmosParams, sky: SkyPresetDef, tod: TodPreset, act: number, shade: number, ending: boolean, todName: string): void {
    srgb(sky.zenith, out.zenith);
    srgb(sky.horizon, out.horizon);
    srgb(sky.ground, out.ground);
    srgb(sky.glow, out.glow);
    out.glowDir.set(sky.glow_dir[0], sky.glow_dir[1], sky.glow_dir[2]).normalize();
    srgb(sky.fog_color, out.fog).lerp(out.horizon, 0.3);
    // Sky brightening: violet -> gold, one shade per principal boss (C8); New Game+ starts golden.
    const s = Math.min(1, Math.max(0, shade));
    if (s > 0 && sky.id !== 'sunrise') {
      out.zenith.lerp(GOLD.zenith, s * 0.32);
      out.horizon.lerp(GOLD.horizon, s * 0.42);
      out.glow.lerp(GOLD.glow, s * 0.4);
      out.fog.lerp(GOLD.fog, s * 0.3);
    }
    out.stars = tod.stars ?? sky.stars;
    out.aurora = tod.aurora ?? sky.aurora;
    if (act === 3 && todName === 'notte') out.aurora = Math.max(out.aurora, 0.9);
    const tint = tod.tint ? new THREE.Color(tod.tint) : new THREE.Color(1, 1, 1);
    const lc = new THREE.Color(sky.light_color).multiply(tint).multiplyScalar(sky.light_intensity * (1 + s * 0.12));
    out.light.set(lc.r, lc.g, lc.b);
    const amb = tod.ambient;
    // ambient stays well below the key light so forms read; the violet sky tint is partly desaturated
    const hs = new THREE.Color(sky.hemi_sky).multiply(tint);
    const hl = hs.r * 0.2126 + hs.g * 0.7152 + hs.b * 0.0722;
    hs.lerp(new THREE.Color(hl, hl, hl), 0.35).multiplyScalar(0.62 * amb);
    const hg = new THREE.Color(sky.hemi_ground).multiply(tint).multiplyScalar(0.7 * amb);
    out.hemiSky.set(hs.r, hs.g, hs.b);
    out.hemiGround.set(hg.r, hg.g, hg.b);
    out.exposure = sky.exposure * (1 + s * 0.06);
    const zo = this.zoneOpts;
    out.fogDensity = FOG_DENSITY[tod.fog] * (zo.fogMult ?? 1);
    const hf = zo.heightFog ?? [0, 0, 0.1];
    const fogBoost = tod.fog === 'dense' ? 1.5 : tod.fog === 'medium' ? 1.15 : tod.fog === 'thin' ? 0.6 : 1;
    out.fogHeight = hf[0] * fogBoost;
    out.fogHeightBase = hf[1];
    out.fogFalloff = hf[2];
    out.cloud = zo.cloud ?? 0.5;
    out.rays = (zo.rays ?? 0.5) * (todName === 'notte' ? 0.12 : todName === 'giorno' ? 0.75 : 1);
    out.night = todName === 'notte' ? 1 : todName === 'tramonto' ? 0.45 : todName === 'alba' ? 0.25 : 0;
    out.glowBoost = 1 + out.night * 1.1;
    out.sun = ending || sky.id === 'sunrise' ? 1 : 0;
    const canopy = zo.canopy ?? 0;
    if (canopy > 0) out.light.multiplyScalar(1 - canopy * 0.55);
  }

  /** Set the target atmosphere. instant = snap (zone load behind a fade). */
  setTarget(sky: SkyPresetDef, tod: TodPreset, act: number, shade: number, ending: boolean, todName: string, instant: boolean, dur = 2.8): void {
    this.act = act;
    if (instant) {
      this.build(this.to, sky, tod, act, shade, ending, todName);
      copyParams(this.cur, this.to);
      copyParams(this.from, this.to);
      this.t = 1;
    } else {
      copyParams(this.from, this.cur);
      this.build(this.to, sky, tod, act, shade, ending, todName);
      this.t = 0;
      this.dur = dur;
    }
    const ac = this.zoneOpts.aurora ?? ACT_AURORA[act] ?? ACT_AURORA[1];
    srgb(ac[0], ATMOS.uAuroraA.value);
    srgb(ac[1], ATMOS.uAuroraB.value);
    this.shadeApplied = shade;
  }

  setZoneOpts(o: AtmosZoneOpts): void {
    this.zoneOpts = o;
    ATMOS.uWind.value.z = o.wind ?? 1;
    if (o.cover) {
      ATMOS.uCoverColor.value.set(o.cover[0]);
      ATMOS.uCoverAmount.value = o.cover[1];
    } else ATMOS.uCoverAmount.value = 0;
  }

  get transitioning(): boolean {
    return this.t < 1;
  }

  get appliedShade(): number {
    return this.shadeApplied;
  }

  lightning(strength = 1): void {
    this.flash = Math.max(this.flash, strength);
  }

  update(dt: number, focus: THREE.Vector3, time: number): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = this.t * this.t * (3 - 2 * this.t);
      lerpParams(this.cur, this.from, this.to, k);
    }
    const c = this.cur;
    this.flash = Math.max(0, this.flash - dt * 2.8);
    const fl = this.flash;
    const U = ATMOS;
    U.uTime.value = time;
    U.uZenith.value.copy(c.zenith);
    U.uHorizon.value.copy(c.horizon);
    U.uGround.value.copy(c.ground);
    U.uGlow.value.copy(c.glow);
    U.uGlowDir.value.copy(c.glowDir);
    U.uFogColor.value.copy(c.fog).addScalar(fl * 0.25);
    U.uFogGlow.value.copy(c.glow).lerp(c.fog, 0.25);
    U.uFogParams.value.set(c.fogDensity / Math.max(0.5, this.qualityFog), c.fogHeight, c.fogHeightBase, c.fogFalloff);
    U.uStars.value = c.stars;
    U.uAurora.value = c.aurora;
    U.uCloud.value = c.cloud;
    U.uRays.value = c.rays;
    U.uFlash.value = fl;
    U.uSunDisc.value = c.sun;
    U.uNight.value = c.night;
    U.uGlowBoost.value = c.glowBoost;
    U.uCloudColor.value.copy(c.zenith).lerp(c.horizon, 0.35);
    // gusts
    const w = U.uWind.value;
    const ang = 0.6 + Math.sin(time * 0.05) * 0.4;
    w.x = Math.sin(ang);
    w.y = Math.cos(ang);
    w.w = 0.5 + 0.5 * Math.sin(time * 0.31) * Math.sin(time * 0.13 + 1.3);

    // lights (directional comes from the glow, never below ~20 degrees so shapes stay readable)
    const gd = this.tmpV.copy(c.glowDir);
    gd.y = Math.max(gd.y, 0.38);
    gd.normalize();
    U.uLightDir.value.copy(gd);
    this.sun.color.setRGB(c.light.x, c.light.y, c.light.z).multiplyScalar(1 + fl * 1.5);
    // three's Lambert/Standard BRDF divides by PI: lights carry PI so albedo x irradiance matches the custom shaders
    this.sun.intensity = Math.PI;
    this.sun.position.copy(focus).addScaledVector(gd, 120);
    this.sun.target.position.copy(focus);
    this.hemi.color.setRGB(c.hemiSky.x, c.hemiSky.y, c.hemiSky.z).multiplyScalar(1 + fl * 2);
    this.hemi.groundColor.setRGB(c.hemiGround.x, c.hemiGround.y, c.hemiGround.z);
    this.hemi.intensity = Math.PI;
    U.uLightColor.value.copy(this.sun.color);
    U.uHemiSky.value.copy(this.hemi.color);
    U.uHemiGround.value.copy(this.hemi.groundColor);
    this.fog.color.setRGB(U.uFogColor.value.x, U.uFogColor.value.y, U.uFogColor.value.z, THREE.SRGBColorSpace);
    this.fog.density = c.fogDensity * 0.8;
    this.exposure = c.exposure;
  }
}
