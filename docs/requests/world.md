# Requests from the WORLD stream

## 1. Renderer.ts (render kit): PCFSoftShadowMap is removed in three 0.186

Every page load logs `THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.`

```diff
--- a/src/render/Renderer.ts
+++ b/src/render/Renderer.ts
-    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
+    this.gl.shadowMap.type = THREE.PCFShadowMap;
```

Note: the WorldRenderer drives `toneMappingExposure` itself (scene.onBeforeRender, from the atmosphere preset), so the
Renderer's constant 1.0 is overwritten each frame by design; no Renderer change needed for exposure.

## 2. post.ts / Renderer.ts (render kit): the luminance probe re-renders the whole scene and is counted in `stats`

Found while measuring vetta_attesa (integration log: "the same static shot alternates 106 / 182 calls"). On the direct
path (every tier while `HDR_ENABLED = false`) `PostPipeline.end` re-renders the full scene into the 32x16 probe target
every `PROBE_DT` (0.3 s). `gl.info.autoReset = false` sums it into `renderer.stats`, so every probe frame reported up to
twice the real frame (vetta Medium spawn: 148 real -> 260 on a probe frame; High fight view 105 -> 154 calls,
278k -> 432k tris). Rendering into a render target also selects a second shader variant of every material (no tone
mapping, linear output), so the first probe after each new zone compiled ~35 extra programs (a multi-second stall under
SwiftShader).

World side (done, src/render/world/WorldRenderer.ts): during any pass into a target <= 64 px the world hides its small
detail (props, ground cover, particles, sites), and the probe variants of the zone's materials are compiled behind the
loading fade. The probe now costs ~10-50 calls instead of a second frame; it still draws terrain, landmarks, arena and
actors (~150k tris on High).

Requested (render kit):
1. Report the presented frame in `stats` and the probe separately, so smoke / budgets read the steady frame:
```diff
--- a/src/render/Renderer.ts
+++ b/src/render/Renderer.ts
     this.post.begin();
     this.gl.render(this.scene, this.rig.camera);
+    const mainCalls = this.gl.info.render.calls, mainTris = this.gl.info.render.triangles;
     this.post.end(this.scene, this.rig.camera, dt, this.ctx.time);
@@
-    this.stats.calls = info.render.calls;
-    this.stats.triangles = info.render.triangles;
+    this.stats.calls = mainCalls;
+    this.stats.triangles = mainTris;
+    this.stats.probeCalls = info.render.calls - mainCalls;   // add `probeCalls: 0` to the stats object
```
2. Better (your call): measure the probe from the frame already drawn instead of a scene re-render, e.g.
   `gl.copyFramebufferToTexture(probeSrc)` of a centred region (FramebufferTexture) right after the main render, then the
   existing mCopy/mReduce passes on it (tone-mapped sRGB input: invert ACES approximately or calibrate KEY_LO/KEY_HI for
   it). No extra draw calls, no second shader variant per material, no stall after a zone change.
