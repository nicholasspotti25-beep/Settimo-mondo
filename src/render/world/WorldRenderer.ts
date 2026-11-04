/**
 * World renderer: the Lungo Crepuscolo sky dome and atmosphere (time-of-day presets blended smoothly, sky brightening
 * violet -> gold with ctx.skyShade, act aurora, fog matched to the horizon, one hemisphere + one directional light,
 * exposure), the current zone visual (custom src/content/zones/<id>/zone.ts from the registry, else the generic data
 * builder) and the arena dressing of every arena in the zone (src/content/bosses/<boss>/arena.ts by arena id).
 *
 * API used by the Renderer: constructor(scene, ctx), loadZone(sim), onEvent(e, sim), update(sim, dt, camera), group,
 * dispose(). Extras for other streams: `atmosphere` (lightning(), current exposure), `zoneVisual`, `arenaVisuals`,
 * `buildStats` (ms per build phase of the last zone, for the smoke / perf logs).
 *
 * Performance notes:
 * - Luminance probe: the post pipeline's direct path re-renders the scene into a 32x16 target every 0.3 s. During that
 *   pass (scene.onBeforeRender with a render target <= 64 px) the world hides its small detail (props, ground cover,
 *   particles, sites) so the probe costs ~30 calls instead of a second full frame (it doubled the stats every few
 *   frames: the "alternating" draw-call count) and compiles no render-target variants of those shaders.
 * - Shader warm-up: once a zone is built its materials are compiled with renderer.compileAsync (parallel compile where
 *   KHR_parallel_shader_compile exists) before `busy` clears, so the compile happens behind the loading fade instead of
 *   stalling the first visible frames.
 */
import * as THREE from 'three';
import type { SkyPresetDef, TimeOfDay, TodPreset, ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { SimEvent } from '../../sim/types';
import type { ArenaBuilder, ArenaVisual, QualityLevel, RenderCtx, ZoneBuilder, ZoneVisual } from '../types';
import { ARENA_BUILDERS, ZONE_BUILDERS } from '../../generated/registry.render';
import { ATMOS, Atmosphere, HDR_HAZE_K } from './atmosphere';
import { biomeOf } from './biomes';
import { createZoneEnv, releaseZoneEnv } from './env';
import { SkyDome } from './sky';
import { buildZone } from './zone';
import { ZoneSites } from './sites';
import { zoneEnv } from './env';
import { ZoneParticles, zoneParticleList } from './particles';

const FALLBACK_TOD: TodPreset = { sky: 'act1_giorno', fog: 'thin', ambient: 1 };

export class WorldRenderer {
  readonly group = new THREE.Group();
  readonly atmosphere: Atmosphere;
  readonly sky: SkyDome;
  zoneVisual: ZoneVisual | null = null;
  /** Altars, fog gates, Reperti, exits and vistas of the current zone (built for every zone, custom or generic). */
  sites: ZoneSites | null = null;
  /** Ambient particles of the current zone (zone.particles, else the biome's list). */
  particles: ZoneParticles | null = null;
  arenaVisuals = new Map<string, ArenaVisual>();
  private zoneId = '';
  private builtQuality: QualityLevel;
  private loading: Promise<void> | null = null;
  private token = 0;
  private tod: TimeOfDay = 'giorno';
  private ending = false;
  private shade = -1;
  private focus = new THREE.Vector3();
  private zoneDef: ZoneDef | null = null;
  private lastCamera: THREE.Camera | null = null;
  private lastBaseExposure = 0;
  private gl: THREE.WebGLRenderer | null = null;
  /** Objects hidden during the luminance probe pass (small detail). */
  private probeHidden: THREE.Object3D[] = [];
  private probeLite = false;
  /** Milliseconds per phase of the last zone build (env, zone, sites, particles, arenas, compile, total). */
  buildStats: Record<string, number> = {};

  constructor(private scene: THREE.Scene, private ctx: RenderCtx) {
    this.group.name = 'world';
    scene.add(this.group);
    this.atmosphere = new Atmosphere(scene);
    this.sky = new SkyDome(ctx.quality);
    scene.add(this.sky.mesh);
    scene.background = new THREE.Color('#2a2238');
    this.builtQuality = ctx.quality;
    // exposure follows the atmosphere (applied right before the scene renders; the Renderer's post pipeline multiplies
    // its auto correction on top afterwards). The haze scale of the toneMapped:false layers is derived here too.
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (renderer, sc, cam, geo, mat, grp) => {
      prev.call(scene, renderer, sc, cam, geo, mat, grp);
      this.gl = renderer;
      // three passes the render target as the 4th argument of Scene.onBeforeRender
      const rt = renderer.getRenderTarget();
      this.setProbeLite(!!rt && rt.width <= 64 && rt.height <= 64);
      this.updateHaze(renderer);
      renderer.toneMappingExposure = this.atmosphere.exposure;
      this.lastBaseExposure = this.atmosphere.exposure;
    };
    this.applyQuality();
  }

  /** Hide / restore the small detail for the luminance probe pass (see the header). */
  private setProbeLite(on: boolean): void {
    if (on === this.probeLite) return;
    this.probeLite = on;
    for (const o of this.probeHidden) {
      if (on) {
        o.userData.probeVis = o.visible;
        o.visible = false;
      } else if (o.userData.probeVis !== undefined) {
        o.visible = o.userData.probeVis as boolean;
        delete o.userData.probeVis;
      }
    }
  }

  private collectProbeHidden(): void {
    this.setProbeLite(false);
    const list: THREE.Object3D[] = [];
    const root = this.zoneVisual?.root;
    if (root) for (const c of root.children) if (c.name === 'props' || c.name === 'cover' || c.name.startsWith('cover')) list.push(c);
    if (this.particles) list.push(this.particles.group);
    if (this.sites) list.push(this.sites.group);
    this.probeHidden = list;
  }

  /**
   * ATMOS.uHazeK for this frame. Direct path: the renderer still holds last frame's final exposure (atmosphere base x the
   * post pipeline's auto correction), so the correction is final / base; the additive layers follow it (dimming fully,
   * brightening a little) so they never out-shine the tone-mapped floor, boss and player when the camera faces the glow.
   * HDR path (a half-float target is bound): the layers already pass exposure + ACES, only the linear-blend scale applies.
   */
  private updateHaze(renderer: THREE.WebGLRenderer): void {
    const rt = renderer.getRenderTarget();
    if (rt && rt.texture.type === THREE.HalfFloatType) {
      ATMOS.uHazeK.value = HDR_HAZE_K;
      return;
    }
    const auto = this.lastBaseExposure > 0 ? renderer.toneMappingExposure / this.lastBaseExposure : 1;
    ATMOS.uHazeK.value = THREE.MathUtils.clamp(auto < 1 ? Math.pow(auto, 1.15) : Math.pow(auto, 0.5), 0.25, 1.12);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Atmosphere targets                                                                                               */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private todPreset(def: ZoneDef, tod: TimeOfDay): TodPreset {
    const set = this.ctx.content.bundle.timeofday[def.timeofday] ?? this.ctx.content.bundle.timeofday[def.id];
    return set?.[tod] ?? FALLBACK_TOD;
  }

  private skyPreset(def: ZoneDef, tod: TodPreset): SkyPresetDef | null {
    const c = this.ctx.content;
    if (this.ending) return c.sky('sunrise') ?? c.sky(tod.sky) ?? null;
    return c.sky(tod.sky) ?? c.sky(`act${def.act}_${this.tod}`) ?? c.sky('act1_giorno') ?? null;
  }

  private retarget(instant: boolean, dur?: number): void {
    const def = this.zoneDef;
    if (!def) return;
    const tp = this.todPreset(def, this.tod);
    const sky = this.skyPreset(def, tp);
    if (!sky) return;
    this.shade = this.ctx.skyShade;
    this.atmosphere.setTarget(sky, tp, def.act, this.shade, this.ending, this.tod, instant, dur ?? (this.ending ? 9 : 2.8));
  }

  private applyQuality(): void {
    const q = this.ctx.quality;
    this.sky.setQuality(q);
    this.atmosphere.setQualityFog(q === 'low' ? 0.8 : 1);
    const sun = this.atmosphere.sun;
    sun.castShadow = q !== 'low';
    const size = q === 'high' ? 1024 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    const ext = q === 'high' ? 46 : 36;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 320;
    cam.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Zone loading                                                                                                     */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private disposeZone(): void {
    this.setProbeLite(false);
    this.probeHidden = [];
    if (this.particles) {
      this.group.remove(this.particles.group);
      this.particles.dispose();
      this.particles = null;
    }
    if (this.sites) {
      this.group.remove(this.sites.group);
      this.sites.dispose();
      this.sites = null;
    }
    for (const a of this.arenaVisuals.values()) {
      this.group.remove(a.root);
      a.dispose();
    }
    this.arenaVisuals.clear();
    if (this.zoneVisual) {
      this.group.remove(this.zoneVisual.root);
      this.zoneVisual.dispose();
      this.zoneVisual = null;
    }
  }

  async loadZone(sim: Sim): Promise<void> {
    const z = sim.zone;
    if (!z) return;
    if (z.def.id === this.zoneId && this.builtQuality === this.ctx.quality) return this.loading ?? undefined;
    const def = z.def;
    const token = ++this.token;
    this.zoneId = def.id;
    this.zoneDef = def;
    this.builtQuality = this.ctx.quality;
    this.applyQuality();
    this.tod = sim.state.timeOfDay;
    this.ending = sim.endingActive;
    const biome = biomeOf(def.biome);
    this.atmosphere.setZoneOpts(biome.atmos ?? {});
    this.retarget(true);
    const job = (async () => {
      const T: Record<string, number> = {};
      let t = performance.now();
      const t0 = t;
      const lap = (k: string) => {
        const n = performance.now();
        T[k] = Math.round(n - t);
        t = n;
      };
      this.disposeZone();
      releaseZoneEnv();
      createZoneEnv(def, this.ctx);
      lap('env');
      let visual: ZoneVisual;
      const custom = ZONE_BUILDERS[def.id];
      if (custom) {
        const mod = (await custom()) as { default: ZoneBuilder };
        visual = await mod.default(def, this.ctx);
      } else {
        visual = await buildZone(def, this.ctx);
      }
      if (token !== this.token) {
        visual.dispose();
        return;
      }
      this.zoneVisual = visual;
      this.group.add(visual.root);
      lap('zone');
      try {
        this.sites = new ZoneSites(zoneEnv(def, this.ctx));
        if (this.sites) this.group.add(this.sites.group);
      } catch (err) {
        console.error(`[world] sites of ${def.id} failed`, err);
      }
      lap('sites');
      try {
        const env = zoneEnv(def, this.ctx);
        this.particles = new ZoneParticles(env, zoneParticleList(env), (s) => this.atmosphere.lightning(s));
        this.group.add(this.particles.group);
      } catch (err) {
        console.error(`[world] particles of ${def.id} failed`, err);
      }
      lap('particles');
      for (const arenaId of def.arenas) {
        const loader = ARENA_BUILDERS[arenaId];
        if (!loader) continue;
        try {
          const mod = (await loader()) as { default: ArenaBuilder };
          const av = mod.default(this.ctx.content.arena(arenaId), def, this.ctx);
          if (token !== this.token) {
            av.dispose();
            return;
          }
          this.arenaVisuals.set(arenaId, av);
          this.group.add(av.root);
        } catch (err) {
          console.error(`[world] arena builder ${arenaId} failed`, err);
        }
      }
      lap('arenas');
      this.collectProbeHidden();
      await this.warmShaders(token);
      lap('compile');
      T.total = Math.round(performance.now() - t0);
      if (token === this.token) this.buildStats = T;
    })();
    this.loading = job;
    try {
      await job;
    } finally {
      if (this.loading === job) this.loading = null;
    }
  }

  /**
   * Compile the new zone's materials before the zone is shown (see the header). Bounded: a driver without parallel
   * compile resolves at once after the synchronous compile; a stuck one never holds the loading fade over ~6 s.
   */
  private async warmShaders(token: number): Promise<void> {
    const gl = this.gl, cam = this.lastCamera;
    if (!gl || !cam || token !== this.token) return;
    try {
      await Promise.race([gl.compileAsync(this.group, cam, this.scene), new Promise((r) => setTimeout(r, 6000))]);
    } catch (err) {
      console.warn('[world] shader warm-up failed', err);
    }
  }

  /** True while a zone is being built (the presentation keeps its fade up). */
  get busy(): boolean {
    return this.loading !== null;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Events                                                                                                           */
  /* ---------------------------------------------------------------------------------------------------------------- */

  onEvent(e: SimEvent, sim: Sim): void {
    switch (e.type) {
      case 'timeOfDay':
        this.tod = e.tod;
        this.retarget(false, 3.2);
        break;
      case 'zoneEnter':
        void this.loadZone(sim);
        break;
      case 'skyBrighten':
        this.retarget(false, 6);
        break;
      case 'ending':
        this.ending = true;
        this.retarget(false, 12);
        break;
      case 'cue': {
        if (e.id === 'lightning' || e.id.startsWith('lightning')) {
          this.atmosphere.lightning(1);
          if (this.lastCamera) this.particles?.strike(this.lastCamera);
        }
        const st = e.id.startsWith('arena_state:') ? e.id.slice(12) : null;
        for (const a of this.arenaVisuals.values()) {
          if (st && a.setState) a.setState(st);
          a.onCue?.(e.id);
        }
        this.zoneVisual?.onCue?.(e.id);
        break;
      }
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Frame                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  update(sim: Sim, dt: number, camera: THREE.Camera): void {
    if (sim.zone && (sim.zone.def.id !== this.zoneId || this.builtQuality !== this.ctx.quality) && !this.loading) void this.loadZone(sim);
    if (this.zoneDef) {
      if (sim.state.timeOfDay !== this.tod) {
        this.tod = sim.state.timeOfDay;
        this.retarget(false, 3.2);
      }
      if (sim.endingActive !== this.ending) {
        this.ending = sim.endingActive;
        this.retarget(false, this.ending ? 12 : 3);
      }
      if (Math.abs(this.ctx.skyShade - this.shade) > 1e-3) this.retarget(false, 6);
    }
    const p = sim.player?.pos;
    if (p) this.focus.set(p.x, p.y, p.z);
    else this.focus.copy(camera.position);
    this.atmosphere.update(dt, this.focus, this.ctx.time);
    this.sky.update(camera);
    if (this.zoneVisual) this.zoneVisual.update(sim, dt, camera);
    this.sites?.update(sim, dt);
    this.lastCamera = camera;
    this.particles?.update(dt, this.focus, camera);
    for (const a of this.arenaVisuals.values()) a.update(sim, dt);
  }

  dispose(): void {
    this.token++;
    this.disposeZone();
    releaseZoneEnv();
    this.scene.remove(this.sky.mesh);
    this.sky.dispose();
    this.group.clear();
  }
}
