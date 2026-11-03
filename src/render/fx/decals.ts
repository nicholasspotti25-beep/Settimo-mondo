/**
 * Ground decals and light bands, each one instanced draw call, rebuilt every frame from pooled per-instance arrays.
 *
 * DecalBatch: analytic (SDF) shapes drawn on a flat quad lying on the ground — disc / annulus, sector (arc), box,
 * stadium (capsule footprint, charge lanes) and expanding ring. One shader handles
 *  - TELEGRAPH (attack warnings, hazard wind-up): a bright edge with a dark outline (reads on bright and dark floors),
 *    a faint fill of the whole area and a fill that grows toward the edge as impact approaches, the edge pulsing faster;
 *    red attacks (Colpo Rosso) add moving diagonal hatching: shape + pattern, not color alone (colorblind-safe);
 *  - ACTIVE looks per hazard visual family (flash, fire/lava, ice/glass, light/lightning/star, crack/roots/spikes/mud,
 *    swirl for void/shadow/water/whirlpool/fog, dots for pollen/flowers/acid/embers).
 * BandBatch: open vertical cylinders (expanding shockwave walls the player jumps over, light / fire / lightning pillars).
 */
import * as THREE from 'three';

export const SHAPE = { disc: 0, sector: 1, box: 2, stadium: 3, ring: 4 } as const;
/** Active look families. */
export const STYLE = { flash: 0, fire: 1, ice: 2, light: 3, crack: 4, swirl: 5, dots: 6 } as const;
/** Decal flags (bit values). */
export const DFLAG = { red: 1, attack: 2, debug: 4, player: 8 } as const;

const VISUAL_STYLE: Record<string, number> = {
  circle: STYLE.flash, fire: STYLE.fire, lava: STYLE.fire, embers: STYLE.dots, ice: STYLE.ice, glass: STYLE.ice,
  lightning: STYLE.light, light: STYLE.light, star: STYLE.light, crack: STYLE.crack, spikes: STYLE.crack, roots: STYLE.crack,
  mud: STYLE.crack, void: STYLE.swirl, shadow: STYLE.swirl, whirlpool: STYLE.swirl, water: STYLE.swirl, fog: STYLE.swirl,
  pollen: STYLE.dots, flowers: STYLE.dots, acid: STYLE.dots,
};
export function styleOf(visual: string): number {
  return VISUAL_STYLE[visual] ?? STYLE.flash;
}

const DECAL_VERT = /* glsl */ `
attribute vec4 aX;     // world center x, y, z, yaw
attribute vec4 aHalf;  // quad half extents x, z; p0, p1
attribute vec4 aShp;   // shape type, p2, p3, style
attribute vec4 aCol;   // rgb, alpha
attribute vec4 aSt;    // fill 0..1, active 0..1, time, flags
varying vec2 vP;
varying vec4 vHalf;
varying vec4 vShp;
varying vec4 vCol;
varying vec4 vSt;
varying vec3 vW;
void main() {
  vec2 p = position.xy * aHalf.xy;
  float s = sin(aX.w), c = cos(aX.w);
  vec3 w = vec3(aX.x + p.x * c + p.y * s, aX.y, aX.z - p.x * s + p.y * c);
  vP = p; vHalf = aHalf; vShp = aShp; vCol = aCol; vSt = aSt; vW = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const DECAL_FRAG = /* glsl */ `
varying vec2 vP;
varying vec4 vHalf;
varying vec4 vShp;
varying vec4 vCol;
varying vec4 vSt;
varying vec3 vW;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.1 + 7.3) * 0.3 + vn(p * 4.3 + 1.7) * 0.15; }
bool bit(float f, float b) { return mod(floor(f / b), 2.0) > 0.5; }
void main() {
  vec2 p = vP;
  float type = vShp.x;
  float p0 = vHalf.z, p1 = vHalf.w, p2 = vShp.y, p3 = vShp.z;
  float len = length(p);
  float d; float u;
  if (type < 0.5) {            // disc / annulus: r = p0, r_in = p1
    d = len - p0; if (p1 > 0.0) d = max(d, p1 - len);
    u = clamp((len - p1) / max(p0 - p1, 1e-3), 0.0, 1.0);
  } else if (type < 1.5) {     // sector: r = p0, r_in = p1, half angle = p2 (+Z forward)
    d = len - p0; if (p1 > 0.0) d = max(d, p1 - len);
    float a = abs(atan(p.x, p.y));
    float da = a - p2;
    d = max(d, da > 0.0 ? len * sin(min(da, 1.57)) : da * len);
    u = clamp((len - p1) / max(p0 - p1, 1e-3), 0.0, 1.0);
  } else if (type < 2.5) {     // box: half = p0 (x), p1 (z); fills back to front
    vec2 q = abs(p) - vec2(p0, p1);
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    u = clamp((p.y + p1) / max(2.0 * p1, 1e-3), 0.0, 1.0);
  } else if (type < 3.5) {     // stadium along z: radius p0, half segment p1; fills back to front
    vec2 q = vec2(p.x, p.y - clamp(p.y, -p1, p1));
    d = length(q) - p0;
    u = clamp((p.y + p1 + p0) / max(2.0 * (p1 + p0), 1e-3), 0.0, 1.0);
  } else {                     // ring: outer r1 = p0, current radius p2, width p3
    d = abs(len - p2) - p3 * 0.5;
    u = clamp(len / max(p0, 1e-3), 0.0, 1.0);
  }
  float fill = vSt.x, act = vSt.y, t = vSt.z, flags = vSt.w;
  bool red = bit(flags, 1.0), atk = bit(flags, 2.0), dbg = bit(flags, 4.0), ply = bit(flags, 8.0);
  float size = max(vHalf.x, vHalf.y);
  float aa = max(fwidth(d), 1e-3) * 1.2;
  // edges keep a readable width on a phone screen: grow with camera distance
  float camD = distance(cameraPosition, vW);
  float edgeW = min(max(clamp(size * 0.05, 0.16, 0.42), camD * 0.012), 0.9) * (red ? 1.3 : 1.0);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float edge = smoothstep(-edgeW - aa, -edgeW + aa, d) * inside;
  float outline = (1.0 - smoothstep(0.0, edgeW * 1.1 + aa, d)) * smoothstep(-aa, aa, d);
  vec3 base = vCol.rgb;
  vec3 hot = mix(base, vec3(1.0), 0.3) * 1.3;
  vec3 edgeCol = mix(base, vec3(1.0), 0.18) * 1.25;
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (dbg) {
    col = base; a = edge * 0.9 + inside * 0.12;
  } else if (act < 0.001) {
    // TELEGRAPH
    float pulse = 0.72 + 0.28 * sin(t * (7.0 + 12.0 * fill));
    float front = 1.0 - smoothstep(0.0, 0.035, abs(u - fill));
    float filled = step(u, fill) * inside;
    float hatch = red ? step(0.5, fract((p.x + p.y) * 0.9 - t * 1.6)) : 0.0;
    float fa = inside * (red ? 0.22 : 0.17) + filled * ((red ? 0.3 : 0.26) + 0.3 * hatch);
    col = base * (0.9 + 0.35 * hatch);
    a = fa;
    col = mix(col, hot, clamp(front * inside * 0.9, 0.0, 1.0)); a = max(a, front * inside * 0.85);
    col = mix(col, edgeCol * (red ? 1.1 : 1.0), edge); a = max(a, edge * (0.78 + 0.22 * pulse));
    col = mix(col, vec3(0.02, 0.01, 0.01), outline); a = max(a, outline * 0.7);
  } else {
    // ACTIVE
    float style = vShp.w;
    float flash = smoothstep(0.75, 1.0, act);
    float ang = atan(p.x, p.y);
    float n = fbm(p * 0.9 + vec2(0.0, -t * 1.4));
    vec3 c = base; float k = 0.5;
    if (style < 0.5) {            // flash
      c = mix(base, hot, 0.5); k = 0.32 + 0.3 * (1.0 - u);
    } else if (style < 1.5) {     // fire / lava
      float f = fbm(p * 1.4 + vec2(t * 0.6, -t * 2.2));
      c = mix(base * 0.6, mix(hot, vec3(1.0, 0.86, 0.45) * 1.4, 0.5), f * f * 1.4); k = 0.45 + 0.45 * f;
    } else if (style < 2.5) {     // ice / glass
      float r1 = 1.0 - abs(fbm(p * 1.6) * 2.0 - 1.0);
      float facets = smoothstep(0.82, 0.97, r1);
      c = mix(base * 0.8, vec3(0.92, 0.98, 1.0) * 1.3, facets); k = 0.38 + 0.5 * facets;
    } else if (style < 3.5) {     // light / lightning / star
      float rays = pow(abs(sin(ang * 6.0 + t * 1.5)), 10.0) * (1.0 - u);
      c = mix(base, vec3(1.0) * 1.4, clamp((1.0 - u) * 0.6 + rays, 0.0, 1.0)); k = 0.3 + 0.4 * (1.0 - u) + 0.3 * rays;
    } else if (style < 4.5) {     // crack / roots / spikes / mud: dark broken ground with glowing seams
      float r1 = 1.0 - abs(fbm(p * 0.8 + 3.1) * 2.0 - 1.0);
      float seam = smoothstep(0.86, 0.97, r1);
      c = mix(base * 0.3, base * 1.6 + 0.06, seam); k = 0.55 + 0.35 * seam;
    } else if (style < 5.5) {     // swirl: void / shadow / water / whirlpool / fog
      float sw = 0.5 + 0.5 * sin(ang * 3.0 + len * 1.3 - t * 3.0 + n * 2.0);
      c = mix(base * 0.35, mix(base, hot, 0.3), sw); k = 0.4 + 0.3 * sw;
    } else {                      // dots: pollen / flowers / acid / embers
      vec2 g = p * 1.6; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
      float rr = 0.18 + 0.2 * h21(id);
      float dot1 = 1.0 - smoothstep(rr - 0.06, rr, length(f + (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.4));
      float tw = 0.5 + 0.5 * sin(t * 4.0 + h21(id) * 6.28);
      c = mix(base * 0.5, hot, dot1 * tw); k = 0.25 + 0.55 * dot1 * tw;
    }
    col = mix(c, vec3(1.0) * 1.4, flash * 0.6);
    a = inside * clamp(k + flash * 0.4, 0.0, 1.0) * min(1.0, act * 4.0);
    a = max(a, edge * 0.6 * min(1.0, act * 3.0));
    if (ply) a *= 0.7;
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const _c = new THREE.Color();

export class DecalBatch {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  count = 0;
  private readonly x: Float32Array;
  private readonly half: Float32Array;
  private readonly shp: Float32Array;
  private readonly col: Float32Array;
  private readonly st: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geo: THREE.InstancedBufferGeometry;

  constructor(capacity: number) {
    this.capacity = capacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const mk = (name: string) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    const ax = mk('aX'), ah = mk('aHalf'), as = mk('aShp'), ac = mk('aCol'), at = mk('aSt');
    this.attrs = [ax, ah, as, ac, at];
    this.x = ax.array as Float32Array; this.half = ah.array as Float32Array; this.shp = as.array as Float32Array;
    this.col = ac.array as Float32Array; this.st = at.array as Float32Array;
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      name: 'fx-decals', vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'fx-decals';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * Add one decal. (x, y, z, yaw) place the quad's local frame (+Z forward); halfX/halfZ its extents; p0..p3 the shape
   * parameters (see the shader); color hex; alpha; fill 0..1 (telegraph progress); act 0..1 (active, 1 at its start).
   */
  add(shape: number, x: number, y: number, z: number, yaw: number, halfX: number, halfZ: number, p0: number, p1: number, p2: number, p3: number,
    style: number, color: THREE.ColorRepresentation, alpha: number, fill: number, act: number, time: number, flags: number): void {
    if (this.count >= this.capacity) return;
    const o = this.count * 4;
    this.x[o] = x; this.x[o + 1] = y; this.x[o + 2] = z; this.x[o + 3] = yaw;
    this.half[o] = halfX; this.half[o + 1] = halfZ; this.half[o + 2] = p0; this.half[o + 3] = p1;
    this.shp[o] = shape; this.shp[o + 1] = p2; this.shp[o + 2] = p3; this.shp[o + 3] = style;
    _c.set(color);
    this.col[o] = _c.r; this.col[o + 1] = _c.g; this.col[o + 2] = _c.b; this.col[o + 3] = alpha;
    this.st[o] = fill; this.st[o + 1] = act; this.st[o + 2] = time; this.st[o + 3] = flags;
    this.count++;
  }

  end(): void {
    const n = this.count;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (let i = 0; i < this.attrs.length; i++) {
      const a = this.attrs[i];
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const BAND_VERT = /* glsl */ `
attribute vec4 aB;    // center x, y, z, radius
attribute vec4 aB2;   // height, alpha, time, kind (0 wall, 1 pillar)
attribute vec3 aBC;   // color
varying vec2 vUv;
varying vec4 vB2;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 w = vec3(aB.x + position.x * aB.w, aB.y + position.y * aB2.x, aB.z + position.z * aB.w);
  vUv = uv; vB2 = aB2; vC = aBC;
  vN = normalize(vec3(position.x, 0.0, position.z));
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vV = normalize(cameraPosition - w);
  gl_Position = projectionMatrix * mv;
}
`;
const BAND_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vB2;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
void main() {
  float y = vUv.y;
  float t = vB2.z;
  float rip = 0.75 + 0.25 * sin(vUv.x * 62.83 + t * 9.0);
  float g;
  if (vB2.w < 0.5) g = pow(1.0 - y, 2.2) * rip;                     // shockwave wall: bright foot, fading top
  else g = (0.12 + 0.88 * pow(1.0 - abs(dot(vN, vV)), 2.0)) * (1.0 - smoothstep(0.6, 1.0, y)) * (0.8 + 0.2 * sin(y * 30.0 - t * 14.0)) * (gl_FrontFacing ? 0.55 : 0.15);
  float a = g * vB2.y;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vC, vec3(1.0), 0.25 * (1.0 - y)) * 1.2 * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class BandBatch {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  count = 0;
  private readonly b: Float32Array;
  private readonly b2: Float32Array;
  private readonly bc: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geo: THREE.InstancedBufferGeometry;

  constructor(capacity: number, segments: number) {
    this.capacity = capacity;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, segments, 1, true).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(cyl.index);
    g.setAttribute('position', cyl.attributes.position);
    g.setAttribute('uv', cyl.attributes.uv);
    const mk = (name: string, n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    const a1 = mk('aB', 4), a2 = mk('aB2', 4), a3 = mk('aBC', 3);
    this.attrs = [a1, a2, a3];
    this.b = a1.array as Float32Array; this.b2 = a2.array as Float32Array; this.bc = a3.array as Float32Array;
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      name: 'fx-bands', vertexShader: BAND_VERT, fragmentShader: BAND_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'fx-bands';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
  }

  begin(): void {
    this.count = 0;
  }

  /** kind 0 = shockwave wall (bright at the foot), 1 = pillar (fresnel column). */
  add(x: number, y: number, z: number, radius: number, height: number, color: THREE.ColorRepresentation, alpha: number, time: number, kind: number): void {
    if (this.count >= this.capacity || radius <= 0.01 || alpha <= 0.003) return;
    const i = this.count;
    this.b[i * 4] = x; this.b[i * 4 + 1] = y; this.b[i * 4 + 2] = z; this.b[i * 4 + 3] = radius;
    this.b2[i * 4] = height; this.b2[i * 4 + 1] = alpha; this.b2[i * 4 + 2] = time; this.b2[i * 4 + 3] = kind;
    _c.set(color);
    this.bc[i * 3] = _c.r; this.bc[i * 3 + 1] = _c.g; this.bc[i * 3 + 2] = _c.b;
    this.count++;
  }

  end(): void {
    const n = this.count;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (let i = 0; i < this.attrs.length; i++) {
      const a = this.attrs[i];
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
