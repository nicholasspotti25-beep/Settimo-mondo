/**
 * Renderer core: Three.js setup, subsystems (world, actors, fx, camera), quality presets (Low/Medium/High/Auto), dynamic
 * resolution scaling driven by frame time (0.6..1.0), a watchdog that lowers quality before frames drop, WebGL context loss.
 */
import * as THREE from 'three';
import type { Content } from '../core/content';
import type { Sim } from '../sim/sim';
import type { SimEvent } from '../sim/types';
import { CameraRig } from './camera';
import { Kit } from './kit/index';
import { WorldRenderer } from './world/WorldRenderer';
import { ActorRenderer } from './actors/ActorRenderer';
import { FxRenderer } from './fx/FxRenderer';
import type { QualityLevel, RenderCtx } from './types';

export type QualitySetting = QualityLevel | 'auto';

export const QUALITY: Record<QualityLevel, { pixelRatioMax: number; shadows: boolean; shadowSize: number; antialias: boolean; particles: number; drawDistance: number; propDensity: number; bloom: boolean }> = {
  low: { pixelRatioMax: 1.0, shadows: false, shadowSize: 512, antialias: false, particles: 0.35, drawDistance: 0.6, propDensity: 0.45, bloom: false },
  medium: { pixelRatioMax: 1.5, shadows: true, shadowSize: 1024, antialias: false, particles: 0.7, drawDistance: 0.85, propDensity: 0.75, bloom: false },
  high: { pixelRatioMax: 2.0, shadows: true, shadowSize: 1024, antialias: true, particles: 1, drawDistance: 1, propDensity: 1, bloom: true },
};

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly ctx: RenderCtx;
  world: WorldRenderer;
  actors: ActorRenderer;
  fx: FxRenderer;
  quality: QualityLevel = 'medium';
  qualitySetting: QualitySetting = 'auto';
  /** Dynamic resolution scale 0.6..1.0. */
  resScale = 1;
  private frameEma = 16.7;
  private watchdogT = 0;
  private stableT = 0;
  targetFrameMs = 1000 / 60;
  contextLost = false;
  stats = { fps: 60, frameMs: 16.7, calls: 0, triangles: 0, geometries: 0, textures: 0 };
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private canvas: HTMLCanvasElement, content: Content) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    const kit = new Kit();
    this.ctx = {
      content,
      quality: this.quality,
      palette: (id) => content.bundle.palettes[id] ?? content.bundle.palettes.portatore ?? {},
      kit,
      time: 0,
      skyShade: 0,
    };
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.world = new WorldRenderer(this.scene, this.ctx);
    this.actors = new ActorRenderer(this.scene, this.ctx);
    this.fx = new FxRenderer(this.scene, this.ctx);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.applyQuality();
    });
    this.setQuality('auto');
    this.resize();
  }

  /** Initial guess for Auto quality from the device. */
  static detectQuality(): QualityLevel {
    const nav = navigator as any;
    const mem = nav.deviceMemory ?? 4;
    const cores = nav.hardwareConcurrency ?? 4;
    const small = Math.min(screen.width, screen.height) < 400;
    if (mem <= 3 || cores <= 4) return 'low';
    if (mem >= 8 && cores >= 8 && !small) return 'high';
    return 'medium';
  }

  setQuality(q: QualitySetting): void {
    this.qualitySetting = q;
    this.quality = q === 'auto' ? Renderer.detectQuality() : q;
    this.applyQuality();
  }

  private applyQuality(): void {
    const Q = QUALITY[this.quality];
    this.ctx.quality = this.quality;
    this.gl.shadowMap.enabled = Q.shadows;
    this.resScale = 1;
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].pixelRatioMax) * this.resScale;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
  }

  onEvent(e: SimEvent, sim: Sim): void {
    if (e.type === 'shake') this.rig.addShake(e.strength, e.dur);
    if (e.type === 'gravityFlip') this.rig.rollTarget = e.sign < 0 ? Math.PI : 0;
    this.world.onEvent(e, sim);
    this.actors.onEvent(e, sim);
    this.fx.onEvent(e, sim);
  }

  render(sim: Sim, alpha: number, dt: number, camInput: { dx: number; dy: number }): void {
    if (this.contextLost) return;
    this.ctx.time += dt;
    this.ctx.skyShade = sim.skyShade() / 7;
    this.rig.update(sim, alpha, dt, camInput);
    this.world.update(sim, dt, this.rig.camera);
    this.actors.update(sim, alpha, dt);
    this.fx.update(sim, alpha, dt);
    this.gl.render(this.scene, this.rig.camera);
    const info = this.gl.info;
    this.stats.calls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
    this.adapt(dt);
  }

  /** Dynamic resolution + watchdog. */
  private adapt(dt: number): void {
    const ms = dt * 1000;
    this.frameEma += (ms - this.frameEma) * 0.05;
    this.stats.frameMs = this.frameEma;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.watchdogT += dt;
    if (this.watchdogT < 0.5) return;
    this.watchdogT = 0;
    const budget = this.targetFrameMs;
    if (this.frameEma > budget * 1.18) {
      this.stableT = 0;
      if (this.resScale > 0.62) {
        this.resScale = Math.max(0.6, this.resScale - 0.08);
        this.resize();
      } else if (this.qualitySetting === 'auto' && this.quality !== 'low') {
        this.quality = this.quality === 'high' ? 'medium' : 'low';
        this.applyQuality();
      }
    } else if (this.frameEma < budget * 0.85) {
      this.stableT += 0.5;
      if (this.stableT > 4 && this.resScale < 1) {
        this.resScale = Math.min(1, this.resScale + 0.05);
        this.resize();
        this.stableT = 0;
      }
    }
  }
}
