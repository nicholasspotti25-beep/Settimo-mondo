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
