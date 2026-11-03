# Requests from render-kit

## 2026-11-03 — to the world stream (src/render/world/**): transparent layers under the new HDR post pipeline
The Renderer now renders the scene into a linear half-float target and tone maps in src/render/fx/post.ts (auto exposure,
grading). Consequences for world materials:
1. Additive / toneMapped:false layers (glows.ts, mist.ts, particles.ts, the vertical glow volumes in vetta_attesa) now blend
   in LINEAR space and are exposure-scaled + ACES-compressed; before they blended on sRGB-encoded canvas values. They read
   stronger (hazier), especially when the camera faces the alba/tramonto glow. Please re-tune their intensities against
   the new path (roughly x0.45 for additive haze/mist alpha-energy reads the same as before) and keep the glow volumes from
   covering the arena floor at tramonto (vetta_attesa, rk2/e4lo_0_tramonto in my scratchpad shows the remaining veil).
2. No code change is needed for exposure: keep writing `renderer.toneMappingExposure` in scene.onBeforeRender; the
   Renderer reads it as the base exposure (renderer.post.baseExposure) and multiplies its auto correction on top.
Minimal diff suggestion (mist.ts / glows.ts / particles.ts additive materials): multiply the final alpha/intensity uniform
by a shared `uHdrHazeK` (0.45) instead of changing every preset.


### HANDLED 2026-11-03 by the world stream
- New shared uniform `ATMOS.uHazeK` (src/render/world/atmosphere.ts) multiplies every additive / toneMapped:false haze
  layer: site glows (glows.ts), Nebbia dell'Alba walls and portal disks (mist.ts), glowing and fog-bank particles
  (particles.ts). The WorldRenderer sets it in scene.onBeforeRender: HDR path (a half-float target bound) ->
  `HDR_HAZE_K` = 0.45; direct path -> follows the post pipeline's auto-exposure correction (last frame's final exposure /
  the atmosphere base; dims fully, brightens at most x1.12), so the layers no longer out-shine the tone-mapped geometry
  when the probe pulls exposure down. No post.ts change needed; keep writing toneMappingExposure as today.
- Root cause of the vetta_attesa tramonto veil and "glow columns": the follow camera backs out of the sealed arena
  through the Nebbia dell'Alba wall at the gate (player fighting near z 36-40), so the whole lower screen was seen through
  the additive wall and its arc ends read as vertical columns. The wall now fades within 2-12 m of the camera, thins to
  a 15% shimmer when seen from outside the arena, and fades at grazing angles (no bright seam). Gate floor pool/orb dimmed.
- Evidence (1280x576, world scratchpad c2/): before b0_tramonto_0 (low, exposure 0.71, near-white veil + columns);
  after b1_tramonto_0 (low) and b2_* (high: tramonto / alba / giorno, follow cam + reverse cam) — floor tiles, boss,
  player and HUD clear, exposure ~0.9-1.0 (key 0.13-0.25, in band). One zone per act at alba/giorno (z0_*, medium) reads.
