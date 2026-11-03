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

