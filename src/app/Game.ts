/**
 * Game orchestrator: owns the sim, renderer, input, audio, UI and saves; runs the fixed 60 Hz loop with render interpolation,
 * perfect-dodge slow motion and hit-stop; handles app lifecycle (pause + autosave in background), respawn and zone travel.
 */
import type { Content } from '../core/content';
import { Loc } from '../core/loc';
import type { TimeOfDay } from '../core/types';
import { Sim } from '../sim/sim';
import { exportCode, importCode, newGamePlus, newGameState, type CharacterLook, type GameStateData } from '../sim/gamestate';
import type { SimEvent } from '../sim/types';
import type { BehaviorRegistry } from '../sim/behavior';
import { Renderer } from '../render/Renderer';
import { InputRouter } from '../input/InputRouter';
import { KeyboardSource } from '../input/keyboard';
import { GamepadSource } from '../input/gamepad';
import type { AudioDirector, GameMode, GameUI } from './interfaces';
import { Platform } from './platform';
import { loadSettings, saveSettings, type Settings } from './settings';
import { SaveStore } from './storage';

export class Game {
  readonly content: Content;
  readonly loc: Loc;
  settings: Settings;
  readonly platform = new Platform();
  readonly store = new SaveStore();
  readonly input = new InputRouter();
  readonly renderer: Renderer;
  sim: Sim;
  mode: GameMode = 'boot';
  slot = 0;
  ui!: GameUI;
  audio!: AudioDirector;
  private behaviors: BehaviorRegistry;
  private acc = 0;
  private last = 0;
  private slowmo = 0;
  private slowScale = 1;
  private hitstop = 0;
  private running = false;
  private backgrounded = false;
  private frameSkip = 0;
  private respawning = false;
  private travelling = false;
  /** Listeners for every sim event after the built-in handling (debug overlays, tests). */
  eventTaps: ((e: SimEvent) => void)[] = [];
  readonly canvas: HTMLCanvasElement;

  constructor(root: HTMLElement, content: Content, loc: Loc, behaviors: BehaviorRegistry) {
    this.content = content;
    this.loc = loc;
    this.behaviors = behaviors;
    this.settings = loadSettings();
    loc.setLang(this.settings.language);
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    root.appendChild(this.canvas);
    this.renderer = new Renderer(this.canvas, content);
    this.sim = new Sim(content, { behaviors });
    this.input.sources.push(new KeyboardSource(this.input, this.canvas), new GamepadSource());
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 250));
    this.platform.onLifecycle(() => this.onBackground(), () => this.onForeground());
    void SaveStore.requestPersistence();
  }

  attach(ui: GameUI, audio: AudioDirector): void {
    this.ui = ui;
    this.audio = audio;
    this.applySettings(this.settings);
  }

  start(): void {
    this.running = true;
    this.setMode('title');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  setMode(m: GameMode): void {
    this.mode = m;
    this.ui?.onMode(m);
    void this.platform.keepAwake(m === 'game');
  }

  applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.loc.setLang(s.language);
    this.renderer.setQuality(s.quality);
    this.renderer.targetFrameMs = 1000 / s.fps;
    this.renderer.rig.sensitivity = s.cameraSensitivity;
    this.renderer.rig.invertY = s.invertY;
    this.renderer.rig.reduceShake = s.reduceShake;
    this.platform.hapticsEnabled = s.haptics;
    this.platform.hapticStrength = s.hapticStrength;
    this.input.toggleGuard = s.toggleGuard;
    this.sim.settings.inputBuffer = Math.min(0.2, Math.max(0.15, s.inputBuffer));
    this.sim.settings.latencyComp = Math.min(this.content.balance.player.latency_comp_max, Math.max(0, s.latencyComp)) + (s.lenientWindows ? 0.04 : 0);
    this.audio?.setVolumes(s.volume);
    this.ui?.applySettings(s);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Sessions                                                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private makeSim(state: GameStateData): Sim {
    const sim = new Sim(this.content, { behaviors: this.behaviors, state, seed: state.rng });
    sim.settings.inputBuffer = Math.min(0.2, Math.max(0.15, this.settings.inputBuffer));
    sim.settings.latencyComp = Math.min(this.content.balance.player.latency_comp_max, this.settings.latencyComp) + (this.settings.lenientWindows ? 0.04 : 0);
    sim.seq.lineTime = (key) => {
      const s = this.loc.t(key);
      return Math.min(9, 2.2 + s.length * 0.055);
    };
    return sim;
  }

  async newGame(slot: number, character: CharacterLook): Promise<void> {
    this.slot = slot;
    const state = newGameState(this.content, character, slot);
    this.sim = this.makeSim(state);
    const p = this.content.bundle.progression;
    this.sim.loadZone(p.start_zone);
    this.sim.seq.start(this.sim, this.content.sequence(p.start_sequence));
    await this.store.write(slot, state);
    this.enterGame();
  }

  async continueGame(slot: number): Promise<boolean> {
    const state = await this.store.read(slot);
    if (!state) return false;
    this.loadState(state, slot);
    return true;
  }

  loadState(state: GameStateData, slot: number): void {
    this.slot = slot;
    state.slot = slot;
    this.sim = this.makeSim(state);
    const altar = this.content.hasAltar(state.lastAltar) ? this.content.altar(state.lastAltar) : null;
    if (altar && state.visitedAltars.includes(altar.id)) this.sim.loadZone(altar.zone, altar.id);
    else this.sim.loadZone(this.content.bundle.progression.start_zone);
    this.enterGame();
  }

  async startNewGamePlus(): Promise<void> {
    const s = newGamePlus(this.content, this.sim.state);
    this.sim = this.makeSim(s);
    const p = this.content.bundle.progression;
    this.sim.loadZone(p.start_zone);
    this.sim.seq.start(this.sim, this.content.sequence(p.start_sequence));
    await this.store.write(this.slot, s);
    this.enterGame();
  }

  importSave(code: string, slot: number): GameStateData {
    const s = importCode(code);
    s.slot = slot;
    void this.store.write(slot, s);
    return s;
  }

  exportSave(): string {
    return exportCode(this.sim.state);
  }

  async saveNow(reason = 'manual'): Promise<void> {
    if (this.mode !== 'game' && this.mode !== 'ending') return;
    this.sim.state.rng = this.sim.rng.state;
    await this.store.write(this.slot, this.sim.state);
    void reason;
  }

  private enterGame(): void {
    this.acc = 0;
    this.input.clear();
    this.renderer.rig.snapBehindPlayer(this.sim);
    void this.renderer.world.loadZone(this.sim);
    this.setMode('game');
  }

  quitToTitle(): void {
    void this.saveNow('quit');
    this.setMode('title');
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Loop                                                                                                              */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private frame(t: number): void {
    if (!this.running) return;
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.last) / 1000;
    if (this.settings.fps === 30) {
      // battery mode: render every other display frame
      this.frameSkip ^= 1;
      if (this.frameSkip) return;
    }
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.input.poll(dt);
    const cam = this.input.takeCamera();
    const sim = this.sim;
    const paused = this.backgrounded || this.mode !== 'game' && this.mode !== 'ending' || this.ui.paused();

    if (!paused) {
      // time scale: hit-stop freezes, perfect-dodge slow motion scales
      let simDt = dt;
      if (this.hitstop > 0) {
        this.hitstop -= dt;
        simDt = 0;
      } else if (this.slowmo > 0) {
        this.slowmo -= dt * this.slowScale;
        simDt = dt * this.slowScale;
      }
      this.acc += simDt;
      let first = true;
      let steps = 0;
      const camYaw = this.renderer.rig.yaw;
      while (this.acc >= sim.dt && steps < 6) {
        sim.step(this.input.build(camYaw, first));
        first = false;
        this.acc -= sim.dt;
        steps++;
      }
      if (steps === 6) this.acc = 0;
      for (const e of sim.drainEvents()) this.dispatch(e);
      if (sim.respawnPending && !this.respawning) void this.doRespawn();
    }
    const alpha = Math.min(1, this.acc / sim.dt);
    if (this.mode === 'game' || this.mode === 'ending' || this.mode === 'title' || this.mode === 'credits') this.renderer.render(sim, alpha, dt, paused ? { dx: 0, dy: 0 } : cam);
    this.audio.update(dt, this.mode === 'game' || this.mode === 'ending' ? sim : null, this.mode);
    this.ui.update(dt);
  }

  private dispatch(e: SimEvent): void {
    const sim = this.sim;
    switch (e.type) {
      case 'hitstop':
        this.hitstop = Math.max(this.hitstop, e.dur);
        break;
      case 'slowmo':
        this.slowmo = e.dur;
        this.slowScale = e.scale;
        break;
      case 'haptic':
        this.platform.haptic(e.pattern);
        break;
      case 'autosave':
        void this.saveNow(e.reason);
        break;
      case 'zoneEnter':
        void this.onZoneEnter();
        break;
      case 'ending':
        this.setMode('ending');
        break;
      case 'credits':
        this.setMode('credits');
        break;
      default:
        break;
    }
    this.renderer.onEvent(e, sim);
    this.audio.onEvent(e, sim);
    this.ui.onEvent(e);
    for (const tap of this.eventTaps) tap(e);
  }

  private async onZoneEnter(): Promise<void> {
    if (this.travelling) return;
    this.travelling = true;
    this.ui.setLoading(true);
    try {
      await this.renderer.world.loadZone(this.sim);
      this.renderer.rig.snapBehindPlayer(this.sim);
    } finally {
      this.ui.setLoading(false);
      this.travelling = false;
    }
  }

  private async doRespawn(): Promise<void> {
    this.respawning = true;
    await this.ui.fade('out', 1.2);
    this.sim.respawn();
    for (const e of this.sim.drainEvents()) this.dispatch(e);
    this.renderer.rig.snapBehindPlayer(this.sim);
    await this.ui.fade('in', 1.0);
    this.respawning = false;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Lifecycle                                                                                                         */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private onBackground(): void {
    if (this.backgrounded) return;
    this.backgrounded = true;
    this.input.clear();
    void this.saveNow('background');
    this.audio?.suspend();
    void this.platform.keepAwake(false);
  }

  private onForeground(): void {
    if (!this.backgrounded) return;
    this.backgrounded = false;
    this.last = performance.now();
    this.acc = 0;
    this.audio?.resume();
    if (this.mode === 'game') void this.platform.keepAwake(true);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Altar helpers for the UI                                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  meditate(tod: TimeOfDay): void {
    this.sim.meditate(tod);
    for (const e of this.sim.drainEvents()) this.dispatch(e);
  }

  /** Run an arbitrary sim mutation from the UI and dispatch its events. */
  act(fn: (sim: Sim) => void): void {
    fn(this.sim);
    for (const e of this.sim.drainEvents()) this.dispatch(e);
  }
}
