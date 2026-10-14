/**
 * Shared GLSL snippets for the world: hashes, value noise, fbm, and the "Lungo Crepuscolo" atmosphere (height fog with
 * in-scattering toward the twilight glow). Every world material uses the same fog function as the sky dome, so distant
 * terrain melts exactly into the horizon.
 */

export const GLSL_NOISE = /* glsl */ `
float smHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float smHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 smHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
vec2 smHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float smNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = smHash12(i), b = smHash12(i + vec2(1.0, 0.0)), c = smHash12(i + vec2(0.0, 1.0)), d = smHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float smNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = smHash13(i), n100 = smHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = smHash13(i + vec3(0.0, 1.0, 0.0)), n110 = smHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = smHash13(i + vec3(0.0, 0.0, 1.0)), n101 = smHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = smHash13(i + vec3(0.0, 1.0, 1.0)), n111 = smHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float smFbm2(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * smNoise2(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s / 0.9375;
}
float smFbm2x3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * smNoise2(p);
    p = p * 2.07 + vec2(11.7, 5.1);
    a *= 0.5;
  }
  return s / 0.875;
}
`;

/** Atmosphere uniforms (declared once per program). */
export const GLSL_ATMOS_PARS = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogGlow;
uniform vec3 uGlowDir;
uniform vec4 uFogParams; // x: density, y: height-fog density, z: height-fog base y, w: height falloff
uniform float uFogScale;
uniform float uFogMax;
vec3 smFogColor(vec3 dir) {
  float s = max(dot(dir, uGlowDir), 0.0);
  float up = clamp(dir.y * 2.5, 0.0, 1.0);
  return mix(mix(uFogColor, uFogGlow, pow(s, 5.0) * 0.62), uFogColor * 0.92, up * 0.25);
}
float smFogAmount(vec3 ray, float dist) {
  float d = dist * uFogScale;
  float fd = uFogParams.x * d;
  float b = max(uFogParams.w, 1e-4);
  float ry = ray.y * uFogScale;
  float t = abs(ry * b) > 0.001 ? (1.0 - exp(-b * ry)) / (b * ry) : 1.0;
  float h = uFogParams.y * exp(-b * (cameraPosition.y - uFogParams.z)) * d * t;
  return min(uFogMax, 1.0 - exp(-(fd * fd + max(h, 0.0))));
}
`;

/** Replacement for three's fog_fragment in world materials. Requires vAtmWorld. */
export const GLSL_ATMOS_FRAG = /* glsl */ `
#ifdef USE_FOG
{
  vec3 smRay = vAtmWorld - cameraPosition;
  float smDist = length(smRay);
  vec3 smDir = smRay / max(smDist, 1e-3);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, smFogColor(smDir), smFogAmount(smRay, smDist));
}
#endif
`;

/** World position from the view-space position (works for meshes, instances, points and sprites). */
export const GLSL_ATMOS_VERT = /* glsl */ `
#ifdef USE_FOG
vAtmWorld = (mvPosition.xyz * mat3(viewMatrix)) + cameraPosition;
#endif
`;

/** Sky gradient shared by the dome and by water reflections. Colors are display-space (sRGB). */
export const GLSL_SKY_PARS = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform float uSkyBright;
vec3 smSkyGradient(vec3 dir) {
  float e = dir.y;
  float s = max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5), normalize(vec3(uGlowDir.x, 0.0, uGlowDir.z) + 1e-5)), 0.0);
  vec3 hor = mix(uHorizon, uGlow, pow(s, 3.0) * 0.55);
  vec3 col = mix(hor, uZenith, pow(clamp(e, 0.0, 1.0), 0.45));
  col = mix(col, uGround, smoothstep(0.0, -0.22, e));
  float g = max(dot(dir, uGlowDir), 0.0);
  col += uGlow * (pow(g, 10.0) * 0.38 + pow(g, 60.0) * 0.35);
  return col * uSkyBright;
}
`;
