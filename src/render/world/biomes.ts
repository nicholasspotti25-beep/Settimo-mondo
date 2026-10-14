/**
 * Biome table: terrain surface layers, ground cover, atmosphere modifiers, default render-only dressing, particles,
 * water and backdrop for every zone biome. A zone with no custom builder is rendered entirely from its biome + data.
 */
import type { PropScatterDef } from '../../core/types';
import type { AtmosZoneOpts } from './atmosphere';

/** Terrain surfaces (sRGB hex pairs; the shader mixes A/B with procedural noise). */
export interface SurfaceDef {
  a: string;
  b: string;
  /** Flagstone/paving pattern strength 0..1. */
  pave?: number;
  /** Emissive speckles (embers, stars) color and density 0..1. */
  speck?: [string, number];
  /** Crack/vein pattern (marble, ice, obsidian) color and strength. */
  vein?: [string, number];
}

export const SURFACES: Record<string, SurfaceDef> = {
  grass: { a: '#4f6a34', b: '#7d8a46' },
  meadow: { a: '#5d7a3a', b: '#a49a52' },
  dry_grass: { a: '#8a8048', b: '#b8a462' },
  moss: { a: '#2f4426', b: '#4c5f2e' },
  forest_floor: { a: '#2a2a1e', b: '#3f3a26' },
  rock: { a: '#6e6a66', b: '#8f8a80' },
  dark_rock: { a: '#3a3838', b: '#55504c' },
  cliff: { a: '#5e5a58', b: '#7c7670' },
  snow: { a: '#dfe6f0', b: '#f6f8fc' },
  ash: { a: '#3e3a3a', b: '#5a5452', speck: ['#ff7a2a', 0.35] },
  embers: { a: '#2a1c1a', b: '#46302a', speck: ['#ff6a1a', 0.9] },
  sand: { a: '#b6a07a', b: '#cdbb94' },
  marble: { a: '#e6e2da', b: '#f6f3ee', vein: ['#a8a2b4', 0.6], pave: 0.6 },
  black_marble: { a: '#1a181e', b: '#2c2832', vein: ['#7a6a8a', 0.5], pave: 0.6 },
  mud: { a: '#3a3224', b: '#4e4430' },
  ice: { a: '#9cc4e0', b: '#cfe6f6', vein: ['#ffffff', 0.5] },
  obsidian: { a: '#141218', b: '#2a2430', vein: ['#ff5a2a', 0.35] },
  bone: { a: '#c8bca0', b: '#e2d8c0' },
  soil: { a: '#4a3c2c', b: '#6a5638' },
  bark: { a: '#4a3a2a', b: '#6a5236' },
  void: { a: '#0c0a14', b: '#1c1630', speck: ['#c8b8ff', 0.6] },
  cloud: { a: '#e8e4f0', b: '#ffffff' },
  stone: { a: '#8c8478', b: '#a89e90', pave: 1 },
  pale_stone: { a: '#b8b0a2', b: '#d0c8ba', pave: 1 },
  wood: { a: '#5a4430', b: '#7a5c3c', pave: 0.4 },
  basalt: { a: '#262428', b: '#3a3638', speck: ['#ff4a1a', 0.12] },
  pine: { a: '#3a3226', b: '#4e4430' },
  path: { a: '#6a5a44', b: '#857258' },
  wet: { a: '#2a2a20', b: '#34342a' },
  flowers: { a: '#4c7a3a', b: '#8a9a4a' },
  red_rock: { a: '#5a2a24', b: '#7a3a2c', speck: ['#ff5a1a', 0.08] },
};

export type CoverType = 'meadow' | 'short' | 'moss' | 'reeds' | 'flowers' | 'snowgrass' | 'none';

export interface CoverDef {
  type: CoverType;
  /** Instances per m² at high quality (0..2). */
  density: number;
  height: [number, number];
  base: string;
  tip: string;
  /** Max slope (1 - normal.y) where cover grows. */
  maxSlope?: number;
  /** Grows inside arenas (e.g. the tall-grass duel). */
  inArenas?: boolean;
}

export interface BiomeDef {
  layers: { base: string; alt: string; steep: string; high: string; path: string; wet?: string };
  /** Height range where the 'high' layer takes over. */
  high?: [number, number];
  /** Slope range (1 - normal.y) where 'steep' takes over. */
  steep?: [number, number];
  /** How much of the 'alt' layer shows (0..1). */
  alt?: number;
  pathWidth?: number;
  cover?: CoverDef;
  atmos?: AtmosZoneOpts;
  /** Render-only, walk-through decoration used only when the zone data has no props of its own. */
  dressing?: PropScatterDef[];
  particles?: string[];
  water?: string;
  /** Outside the walkable bounds: rising hills, canyon cliffs, a drop into the world below, open water, or nothing. */
  backdrop?: 'hills' | 'cliffs' | 'drop' | 'water' | 'none' | 'peaks';
  backdropHeight?: number;
  /** Props that ring the zone beyond its bounds (forest walls, rock spires) — render only. */
  rim?: { kind: string; count: number; scale: [number, number] }[];
}

const ACT1_COVER: CoverDef = { type: 'meadow', density: 0.9, height: [0.35, 0.8], base: '#3c5426', tip: '#b8b066' };

export const BIOMES: Record<string, BiomeDef> = {
  castle: {
    layers: { base: 'pale_stone', alt: 'stone', steep: 'rock', high: 'pale_stone', path: 'pale_stone' },
    alt: 0.3, pathWidth: 4,
    atmos: { cloud: 0.3, rays: 1, wind: 0.2, fogMult: 0.6, cover: ['#5a6a40', 0.25] },
    particles: ['dust'], backdrop: 'none',
  },
  summit: {
    layers: { base: 'rock', alt: 'grass', steep: 'cliff', high: 'snow', path: 'stone' },
    high: [16, 30], steep: [0.32, 0.55], alt: 0.55, pathWidth: 6,
    cover: { type: 'short', density: 0.55, height: [0.15, 0.4], base: '#4a5a30', tip: '#c2b47a', maxSlope: 0.3 },
    atmos: { cloud: 0.55, rays: 1, wind: 1.6, cover: ['#e8eef6', 0.25] },
    particles: ['dust'], backdrop: 'drop',
    dressing: [
      { kind: 'pebbles', count: 90, scale: [0.6, 1.4], avoid_path: 4 },
    ],
  },
  plains: {
    layers: { base: 'meadow', alt: 'dry_grass', steep: 'rock', high: 'grass', path: 'path' },
    steep: [0.3, 0.55], alt: 0.6, pathWidth: 3.2,
    cover: { ...ACT1_COVER, density: 1.0, height: [0.5, 1.15], inArenas: true },
    atmos: { cloud: 0.6, rays: 0.8, wind: 1.4, cover: ['#6a7a3a', 0.35] },
    particles: ['pollen', 'fireflies'], backdrop: 'hills', backdropHeight: 40,
    rim: [{ kind: 'twilight_tree', count: 70, scale: [1.0, 1.8] }, { kind: 'cliff_rock', count: 30, scale: [3, 7] }],
    dressing: [
      { kind: 'flower_glow', count: 120, scale: [0.6, 1.1], avoid_path: 2 },
      { kind: 'pebbles', count: 60, scale: [0.6, 1.2], avoid_path: 3 },
    ],
  },
  dark_forest: {
    layers: { base: 'forest_floor', alt: 'moss', steep: 'dark_rock', high: 'moss', path: 'soil' },
    steep: [0.3, 0.6], alt: 0.7, pathWidth: 3,
    cover: { type: 'moss', density: 0.7, height: [0.2, 0.55], base: '#1c2a16', tip: '#4e6a34', maxSlope: 0.45 },
    atmos: { cloud: 0.4, rays: 0.6, wind: 0.35, heightFog: [0.012, 0, 0.12], canopy: 0.55, cover: ['#3e5a2a', 0.65] },
    particles: ['fireflies', 'mist', 'spores'], backdrop: 'hills', backdropHeight: 30,
    rim: [{ kind: 'giant_tree', count: 60, scale: [0.9, 1.6] }],
    dressing: [
      { kind: 'mushroom_glow', count: 160, scale: [0.5, 1.2], avoid_path: 2 },
      { kind: 'fern', count: 220, scale: [0.7, 1.4], avoid_path: 2.5 },
    ],
  },
  swamp: {
    layers: { base: 'mud', alt: 'moss', steep: 'dark_rock', high: 'grass', path: 'wood', wet: 'wet' },
    steep: [0.3, 0.6], alt: 0.5, pathWidth: 3,
    cover: { type: 'reeds', density: 0.6, height: [0.6, 1.6], base: '#2c3420', tip: '#8a8a52', maxSlope: 0.4 },
    atmos: { cloud: 0.7, rays: 0.4, wind: 0.6, heightFog: [0.05, -0.6, 0.22], cover: ['#4a5a30', 0.5] },
    particles: ['fireflies', 'mist'], water: 'swamp', backdrop: 'water',
    rim: [{ kind: 'dead_tree', count: 50, scale: [1.0, 1.8] }, { kind: 'willow_tree', count: 40, scale: [1.0, 1.6] }],
    dressing: [{ kind: 'lily_pad', count: 160, scale: [0.6, 1.4] }, { kind: 'reeds', count: 200, scale: [0.8, 1.4] }],
  },
  river_souls: {
    layers: { base: 'dark_rock', alt: 'mud', steep: 'dark_rock', high: 'rock', path: 'wood', wet: 'wet' },
    steep: [0.3, 0.6], alt: 0.4, pathWidth: 3,
    cover: { type: 'short', density: 0.25, height: [0.2, 0.5], base: '#1e2420', tip: '#4a5a52', maxSlope: 0.4 },
    atmos: { cloud: 0.5, rays: 0.5, wind: 0.5, heightFog: [0.04, -0.6, 0.2], cover: ['#2a3a3a', 0.3] },
    particles: ['souls', 'mist'], water: 'souls', backdrop: 'water',
    rim: [{ kind: 'dead_tree', count: 40, scale: [1, 1.6] }, { kind: 'cliff_rock', count: 30, scale: [3, 8] }],
    dressing: [{ kind: 'soul_light', count: 60, scale: [0.6, 1.2] }, { kind: 'reeds', count: 120, scale: [0.8, 1.3] }],
  },
  hell_gate: {
    layers: { base: 'basalt', alt: 'bone', steep: 'dark_rock', high: 'red_rock', path: 'bone' },
    alt: 0.35, pathWidth: 4,
    atmos: { cloud: 0.7, rays: 0.3, wind: 0.6, cover: ['#3a2a2a', 0.3] },
    particles: ['embers', 'ash'], backdrop: 'cliffs', backdropHeight: 90,
    rim: [{ kind: 'cliff_rock', count: 60, scale: [4, 10] }],
    dressing: [{ kind: 'bones', count: 80, scale: [0.6, 1.3], avoid_path: 3 }, { kind: 'pebbles', count: 60, scale: [0.8, 1.4], avoid_path: 3 }],
  },
  pyres: {
    layers: { base: 'embers', alt: 'ash', steep: 'basalt', high: 'red_rock', path: 'ash' },
    alt: 0.5, pathWidth: 4,
    atmos: { cloud: 0.8, rays: 0.4, wind: 0.8, cover: ['#2a2020', 0.3] },
    particles: ['embers', 'ash'], backdrop: 'hills', backdropHeight: 50,
    rim: [{ kind: 'obsidian_rock', count: 50, scale: [3, 8] }],
    dressing: [{ kind: 'ember_vent', count: 40, scale: [0.8, 1.6], avoid_path: 4 }],
  },
  tempest: {
    layers: { base: 'dark_rock', alt: 'basalt', steep: 'cliff', high: 'rock', path: 'stone' },
    alt: 0.5, pathWidth: 4,
    atmos: { cloud: 1, rays: 0.1, wind: 2.2, cover: ['#2a2a34', 0.2] },
    particles: ['rain', 'lightning'], backdrop: 'cliffs', backdropHeight: 70,
    rim: [{ kind: 'cliff_rock', count: 50, scale: [4, 9] }],
    dressing: [{ kind: 'pebbles', count: 80, scale: [0.6, 1.6], avoid_path: 3 }],
  },
  cocytus: {
    layers: { base: 'ice', alt: 'snow', steep: 'dark_rock', high: 'snow', path: 'ice' },
    alt: 0.4, pathWidth: 4,
    atmos: { cloud: 0.5, rays: 0.5, wind: 0.8, cover: ['#e0eef8', 0.6] },
    particles: ['snow'], water: 'ice', backdrop: 'cliffs', backdropHeight: 60,
    rim: [{ kind: 'ice_spike', count: 60, scale: [3, 8] }],
    dressing: [{ kind: 'pebbles', count: 60, scale: [0.6, 1.4], avoid_path: 3 }],
  },
  forges: {
    layers: { base: 'basalt', alt: 'obsidian', steep: 'dark_rock', high: 'red_rock', path: 'stone' },
    alt: 0.4, pathWidth: 4,
    atmos: { cloud: 0.2, rays: 0.2, wind: 0.3, fogMult: 1.2, cover: ['#2a1a18', 0.2] },
    particles: ['embers'], water: 'lava', backdrop: 'cliffs', backdropHeight: 80,
    rim: [{ kind: 'obsidian_rock', count: 50, scale: [4, 9] }],
    dressing: [{ kind: 'ember_vent', count: 30, scale: [0.8, 1.4], avoid_path: 4 }, { kind: 'pebbles', count: 60, scale: [0.6, 1.4], avoid_path: 3 }],
  },
  cathedral: {
    layers: { base: 'black_marble', alt: 'obsidian', steep: 'dark_rock', high: 'black_marble', path: 'black_marble' },
    alt: 0.3, pathWidth: 5,
    atmos: { cloud: 0.4, rays: 0.6, wind: 0.2, cover: ['#2a2430', 0.2] },
    particles: ['ash', 'embers'], water: 'lava', backdrop: 'cliffs', backdropHeight: 80,
    dressing: [{ kind: 'sword_grave', count: 60, scale: [0.6, 1.0], avoid_path: 4 }],
  },
  volcano: {
    layers: { base: 'basalt', alt: 'snow', steep: 'red_rock', high: 'snow', path: 'ash' },
    high: [20, 40], alt: 0.35, pathWidth: 4,
    atmos: { cloud: 0.7, rays: 0.6, wind: 1.4, cover: ['#e8eef6', 0.4] },
    particles: ['embers', 'snow'], backdrop: 'peaks', backdropHeight: 160,
    dressing: [{ kind: 'ember_vent', count: 30, scale: [0.8, 1.6], avoid_path: 4 }, { kind: 'pebbles', count: 60, scale: [0.8, 1.6], avoid_path: 3 }],
  },
  snow_peaks: {
    layers: { base: 'snow', alt: 'rock', steep: 'cliff', high: 'snow', path: 'snow' },
    alt: 0.25, pathWidth: 3.5,
    cover: { type: 'snowgrass', density: 0.25, height: [0.15, 0.35], base: '#6a7a6a', tip: '#cfd8d0', maxSlope: 0.3 },
    atmos: { cloud: 0.6, rays: 1, wind: 1.8, cover: ['#f4f8ff', 0.85] },
    particles: ['snow'], backdrop: 'peaks', backdropHeight: 200,
    rim: [{ kind: 'fir', count: 60, scale: [1.2, 2] }],
    dressing: [{ kind: 'pebbles', count: 80, scale: [0.8, 1.6], avoid_path: 3 }],
  },
  ice_castle: {
    layers: { base: 'ice', alt: 'snow', steep: 'ice', high: 'snow', path: 'ice' },
    alt: 0.5, pathWidth: 5,
    atmos: { cloud: 0.5, rays: 0.8, wind: 1, cover: ['#f4f8ff', 0.85] },
    particles: ['snow'], backdrop: 'peaks', backdropHeight: 160,
    dressing: [{ kind: 'pebbles', count: 50, scale: [0.6, 1.4], avoid_path: 3 }],
  },
  taiga: {
    layers: { base: 'pine', alt: 'snow', steep: 'rock', high: 'snow', path: 'soil' },
    alt: 0.45, pathWidth: 3,
    cover: { type: 'short', density: 0.4, height: [0.2, 0.5], base: '#2a3424', tip: '#6a7a52', maxSlope: 0.4 },
    atmos: { cloud: 0.5, rays: 0.7, wind: 0.6, canopy: 0.25, cover: ['#eef4fa', 0.55] },
    particles: ['snow'], backdrop: 'hills', backdropHeight: 50,
    rim: [{ kind: 'pine', count: 120, scale: [1.2, 2.2] }],
    dressing: [{ kind: 'fern', count: 100, scale: [0.7, 1.2], avoid_path: 3 }],
  },
  ship_river: {
    layers: { base: 'wood', alt: 'wood', steep: 'wood', high: 'wood', path: 'wood' },
    atmos: { cloud: 0.5, rays: 0.7, wind: 1.2 }, particles: ['snow'], water: 'river', backdrop: 'none',
  },
  river_port: {
    layers: { base: 'stone', alt: 'snow', steep: 'rock', high: 'snow', path: 'wood' },
    alt: 0.4, pathWidth: 4,
    atmos: { cloud: 0.5, rays: 0.7, wind: 1, cover: ['#eef4fa', 0.5] },
    particles: ['snow'], water: 'river', backdrop: 'hills', backdropHeight: 40,
    rim: [{ kind: 'pine', count: 60, scale: [1.2, 2] }],
  },
  ship_sea: {
    layers: { base: 'wood', alt: 'wood', steep: 'wood', high: 'wood', path: 'wood' },
    atmos: { cloud: 0.6, rays: 0.4, wind: 1.6 }, particles: ['rain'], water: 'sea', backdrop: 'none',
  },
  giant_garden: {
    layers: { base: 'flowers', alt: 'grass', steep: 'soil', high: 'grass', path: 'soil' },
    alt: 0.6, pathWidth: 3,
    cover: { type: 'flowers', density: 0.9, height: [0.6, 1.6], base: '#2e6a2a', tip: '#a8e05a', inArenas: false },
    atmos: { cloud: 0.4, rays: 1, wind: 0.5, cover: ['#5aa03a', 0.4] },
    particles: ['pollen'], backdrop: 'hills', backdropHeight: 60,
    rim: [{ kind: 'giant_grass', count: 80, scale: [1, 2] }, { kind: 'giant_flower', count: 30, scale: [1, 2] }],
    dressing: [{ kind: 'flower_glow', count: 120, scale: [0.6, 1.2], avoid_path: 3 }],
  },
  greenhouse: {
    layers: { base: 'soil', alt: 'flowers', steep: 'rock', high: 'grass', path: 'stone' },
    alt: 0.5, pathWidth: 4,
    cover: { type: 'flowers', density: 0.7, height: [0.4, 1.2], base: '#2e6a2a', tip: '#ff9ad0' },
    atmos: { cloud: 0.2, rays: 1, wind: 0.2, fogMult: 0.7, cover: ['#5aa03a', 0.5] },
    particles: ['pollen'], backdrop: 'none',
  },
  bone_plateau: {
    layers: { base: 'sand', alt: 'bone', steep: 'rock', high: 'rock', path: 'bone' },
    alt: 0.4, pathWidth: 4,
    cover: { type: 'short', density: 0.3, height: [0.2, 0.5], base: '#7a6a42', tip: '#d8c88a', maxSlope: 0.3 },
    atmos: { cloud: 0.5, rays: 1, wind: 1.4, cover: ['#e0d8c0', 0.2] },
    particles: ['dust'], backdrop: 'hills', backdropHeight: 60,
    rim: [{ kind: 'cliff_rock', count: 40, scale: [4, 9] }],
    dressing: [{ kind: 'bones', count: 40, scale: [0.8, 1.6], avoid_path: 4 }],
  },
  nests: {
    layers: { base: 'rock', alt: 'bone', steep: 'cliff', high: 'rock', path: 'stone' },
    alt: 0.3, pathWidth: 3,
    atmos: { cloud: 0.6, rays: 1, wind: 1.8, cover: ['#c8c0a8', 0.3] },
    particles: ['dust'], backdrop: 'cliffs', backdropHeight: 120,
    rim: [{ kind: 'cliff_rock', count: 60, scale: [5, 12] }],
  },
  observatory: {
    layers: { base: 'marble', alt: 'grass', steep: 'rock', high: 'marble', path: 'marble' },
    alt: 0.4, pathWidth: 4,
    atmos: { cloud: 0.3, rays: 0.8, wind: 0.8 }, particles: ['stars'], backdrop: 'peaks', backdropHeight: 120,
  },
  mirror_lake: {
    layers: { base: 'grass', alt: 'rock', steep: 'cliff', high: 'rock', path: 'stone' },
    alt: 0.4, pathWidth: 3,
    cover: { type: 'short', density: 0.4, height: [0.2, 0.5], base: '#2e4a3a', tip: '#8ab0a0', maxSlope: 0.35 },
    atmos: { cloud: 0.4, rays: 0.8, wind: 0.3, heightFog: [0.03, -0.6, 0.15] },
    particles: ['mist', 'fireflies'], water: 'mirror', backdrop: 'peaks', backdropHeight: 140,
  },
  wind_cliffs: {
    layers: { base: 'rock', alt: 'grass', steep: 'cliff', high: 'rock', path: 'stone' },
    alt: 0.4, pathWidth: 3,
    cover: { type: 'short', density: 0.5, height: [0.2, 0.5], base: '#4a5a3a', tip: '#c0c08a', maxSlope: 0.3 },
    atmos: { cloud: 0.7, rays: 1, wind: 2.4 }, particles: ['dust'], backdrop: 'drop',
  },
  world_tree: {
    layers: { base: 'bark', alt: 'moss', steep: 'bark', high: 'moss', path: 'bark' },
    alt: 0.5, pathWidth: 4,
    atmos: { cloud: 0.8, rays: 1, wind: 1, cover: ['#4a6a3a', 0.6] }, particles: ['pollen'], water: 'cloud', backdrop: 'drop',
  },
  hollow_root: {
    layers: { base: 'bark', alt: 'moss', steep: 'bark', high: 'bark', path: 'bark' },
    alt: 0.4, pathWidth: 4,
    atmos: { cloud: 0.2, rays: 0.3, wind: 0.2, fogMult: 1.4, cover: ['#3a5a2a', 0.5] }, particles: ['spores', 'fireflies'], backdrop: 'none',
  },
  upturned_plain: {
    layers: { base: 'void', alt: 'meadow', steep: 'dark_rock', high: 'void', path: 'ash' },
    alt: 0.5, pathWidth: 4,
    atmos: { cloud: 0.6, rays: 0.3, wind: 0.6 }, particles: ['ash', 'stars'], backdrop: 'hills', backdropHeight: -60,
  },
  ash_desert: {
    layers: { base: 'ash', alt: 'sand', steep: 'dark_rock', high: 'ash', path: 'ash' },
    alt: 0.4, pathWidth: 4,
    atmos: { cloud: 0.6, rays: 0.4, wind: 1.6 }, particles: ['ash'], backdrop: 'hills', backdropHeight: 40,
    dressing: [{ kind: 'void_shard', count: 40, scale: [0.6, 1.6], avoid_path: 5 }],
  },
  upturned_palace: {
    layers: { base: 'black_marble', alt: 'void', steep: 'dark_rock', high: 'black_marble', path: 'black_marble' },
    alt: 0.3, pathWidth: 5,
    atmos: { cloud: 0.3, rays: 0.3, wind: 0.2 }, particles: ['stars', 'ash'], backdrop: 'none',
  },
  celestial: {
    layers: { base: 'marble', alt: 'grass', steep: 'marble', high: 'cloud', path: 'marble' },
    alt: 0.35, pathWidth: 5,
    cover: { type: 'flowers', density: 0.4, height: [0.2, 0.5], base: '#4a8a4a', tip: '#fff0c0', maxSlope: 0.3 },
    atmos: { cloud: 0.3, rays: 1.2, wind: 0.6, fogMult: 0.7 }, particles: ['pollen'], water: 'cloud', backdrop: 'none',
    dressing: [{ kind: 'cloud_puff', count: 30, scale: [1, 2.4], avoid_path: 6 }],
  },
  collapse: {
    layers: { base: 'void', alt: 'marble', steep: 'dark_rock', high: 'void', path: 'marble' },
    alt: 0.4, pathWidth: 5,
    atmos: { cloud: 0.2, rays: 0.2, wind: 0.4 }, particles: ['stars'], backdrop: 'none',
    dressing: [{ kind: 'void_shard', count: 60, scale: [1, 3] }],
  },
  cloud_sea: {
    layers: { base: 'cloud', alt: 'marble', steep: 'rock', high: 'cloud', path: 'marble' },
    alt: 0.3, pathWidth: 4,
    atmos: { cloud: 0.5, rays: 1.3, wind: 0.5, fogMult: 0.5 }, particles: ['pollen'], water: 'cloud', backdrop: 'none',
  },
};

export function biomeOf(id: string): BiomeDef {
  return BIOMES[id] ?? BIOMES.plains;
}
