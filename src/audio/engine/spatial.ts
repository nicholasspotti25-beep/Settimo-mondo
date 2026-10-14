/**
 * Spatial math (pure): stereo pan from world position relative to the listener (camera) yaw and distance attenuation.
 * Conventions (docs/ARCHITECTURE.md): +Y up, yaw 0 faces +Z, forward(yaw) = (sin yaw, 0, cos yaw), +X is the LEFT side, so the
 * listener's right vector is (-cos yaw, 0, sin yaw).
 */

export interface Listener {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** World scale of the player (Little Garden 0.1, Gigante 3): distances are judged relative to it. */
  scale: number;
}

export interface SpatialOut {
  pan: number;
  gain: number;
  dist: number;
}

/**
 * @param ref distance (m) under which there is no attenuation
 * @param rolloff inverse-distance rolloff factor
 * @param floor minimum gain for far sounds (huge bosses stay audible)
 */
export function spatialize(l: Listener, x: number, y: number, z: number, ref: number, rolloff: number, floor: number, out: SpatialOut): SpatialOut {
  const dx = x - l.x;
  const dy = y - l.y;
  const dz = z - l.z;
  const s = Math.max(0.05, l.scale);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / s;
  const h = Math.sqrt(dx * dx + dz * dz);
  // right vector (-cos yaw, 0, sin yaw)
  const rx = -Math.cos(l.yaw);
  const rz = Math.sin(l.yaw);
  let pan = h > 1e-4 ? (dx * rx + dz * rz) / h : 0;
  // keep near sounds centered, never hard-pan
  pan *= Math.min(1, h / s / 2.5) * 0.8;
  const g = d <= ref ? 1 : ref / (ref + rolloff * (d - ref));
  out.pan = Math.max(-1, Math.min(1, pan));
  out.gain = Math.max(floor, Math.min(1, g));
  out.dist = d;
  return out;
}
