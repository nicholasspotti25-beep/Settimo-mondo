"""
Soft-Body Character -- Blender build script
===========================================
Generates the whole scene procedurally: a continuous anatomical quad mesh, fitted halter
dress, strand hair, a deform rig with jiggle bones, baked walk / jog / idle / turn actions
with spring-mass-damper soft-tissue and Verlet ponytail dynamics, PBR materials and a
golden-hour set with cameras.

Run (Blender 4.2+; developed and tested on 5.3):
    blender --python build_character.py                       # build, then explore in the UI
    blender --background --python build_character.py -- --save character.blend --render still.png

Options after "--":  --save PATH   --render PATH   --voxel 0.005   --samples 96   --fast
Axes while building: +x = character's left, +y = up, +z = front (metres, 1.70 m tall);
everything is converted to Blender's Z-up / facing -Y convention when objects are created.
"""
import bpy, math, sys, time
import numpy as np
from mathutils import Vector, Matrix, Quaternion

# ---------------------------------------------------------------------------------------
# 0. SETTINGS
# ---------------------------------------------------------------------------------------
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def _opt(name, default=None, cast=str):
    return cast(ARGV[ARGV.index(name) + 1]) if name in ARGV else default
FAST    = "--fast" in ARGV                       # coarse mesh + fewer strands, for quick iteration
VOXEL   = _opt("--voxel", 0.008 if FAST else 0.005, float)   # body / dress extraction cell (m)
SAMPLES = _opt("--samples", 32 if FAST else 96, int)
SAVE_TO, RENDER_TO = _opt("--save"), _opt("--render")
FPS     = 30
PHYS    = dict(k=380.0, c=7.0, bounce=1.0, wind=0.6, sway=1.0)   # same meaning as the WebGL sliders
T0      = time.time()
def log(msg): print(f"[{time.time() - T0:6.1f}s] {msg}", flush=True)

# ---------------------------------------------------------------------------------------
# 1. ANATOMY FIELD (numpy): lofted superellipse cross-sections fused with smooth unions
# ---------------------------------------------------------------------------------------
def sat(x): return np.clip(x, 0.0, 1.0)
def sstep(a, b, x):
    t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k; return np.minimum(a, b) - h * h * k * 0.25
def smax(a, b, k): return -smin(-a, -b, k)
def ell(dx, dy, dz, rx, ry, rz):
    return (np.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry) + dz * dz / (rz * rz)) - 1.0) * min(rx, ry, rz)
def seg(s, p, w, a, b, r0, r1):
    """Distance to a tapered capsule a->b in (s, p, w) hand space."""
    a, b = np.array(a), np.array(b); ab = b - a
    t = sat(((s - a[0]) * ab[0] + (p - a[1]) * ab[1] + (w - a[2]) * ab[2]) / ab.dot(ab))
    return np.sqrt((s - a[0] - ab[0] * t) ** 2 + (p - a[1] - ab[1] * t) ** 2 + (w - a[2] - ab[2] * t) ** 2) - lerp(r0, r1, t)

class Loft:
    """Cross-section channels along an axis: non-uniform Catmull-Rom (cubic Hermite) baked to a 2 mm table."""
    def __init__(self, stations):
        st = np.array(stations, float); t = st[:, 0]; n = len(t)
        self.t0, self.t1 = t[0], t[-1]
        self.grid = np.linspace(t[0], t[-1], int(math.ceil((t[-1] - t[0]) / 0.002)) + 1)
        i0, i1 = np.maximum(np.arange(n) - 1, 0), np.minimum(np.arange(n) + 1, n - 1)
        sg = np.clip(np.searchsorted(t, self.grid, side="right") - 1, 0, n - 2)
        h = t[sg + 1] - t[sg]; u = sat((self.grid - t[sg]) / h); u2, u3 = u * u, u * u * u
        self.lut = []
        for c in range(1, st.shape[1]):
            v = st[:, c]; m = (v[i1] - v[i0]) / (t[i1] - t[i0])
            self.lut.append((2 * u3 - 3 * u2 + 1) * v[sg] + (u3 - 2 * u2 + u) * h * m[sg]
                            + (-2 * u3 + 3 * u2) * v[sg + 1] + (u3 - u2) * h * m[sg + 1])
    def __call__(self, t, c): return np.interp(t, self.grid, self.lut[c])

# torso: [y, half-width, half-depth, depth-centre, superellipse exponent]
TORSO = Loft([[0.80, 0.085, 0.080, -0.006, 2.2], [0.84, 0.150, 0.098, -0.008, 2.3], [0.88, 0.176, 0.106, -0.010, 2.4],
              [0.93, 0.180, 0.108, -0.012, 2.4], [0.98, 0.168, 0.101, -0.010, 2.3], [1.04, 0.142, 0.089, -0.004, 2.2],
              [1.10, 0.123, 0.082, 0.002, 2.2], [1.16, 0.126, 0.086, 0.004, 2.3], [1.22, 0.138, 0.094, 0.002, 2.4],
              [1.28, 0.150, 0.100, -0.002, 2.5], [1.34, 0.157, 0.097, -0.006, 2.5], [1.385, 0.156, 0.082, -0.010, 2.4],
              [1.425, 0.126, 0.064, -0.012, 2.2], [1.46, 0.060, 0.054, -0.010, 2.0]])
# leg (mirrored): [y, centre-x, centre-z, radius-x, radius-z]
LEG = Loft([[0.055, 0.076, -0.022, 0.030, 0.036], [0.09, 0.076, -0.024, 0.0275, 0.034], [0.16, 0.077, -0.024, 0.031, 0.037],
            [0.26, 0.079, -0.027, 0.043, 0.049], [0.35, 0.081, -0.029, 0.052, 0.058], [0.43, 0.082, -0.020, 0.048, 0.053],
            [0.50, 0.083, -0.012, 0.050, 0.056], [0.56, 0.084, -0.008, 0.056, 0.062], [0.64, 0.086, -0.004, 0.068, 0.075],
            [0.73, 0.089, -0.004, 0.081, 0.088], [0.81, 0.091, -0.006, 0.088, 0.094], [0.88, 0.092, -0.008, 0.086, 0.092],
            [0.94, 0.092, -0.008, 0.080, 0.085]])
# arm along the A-pose axis: [s, in-plane radius, depth radius]
ARM = Loft([[0, 0.050, 0.052], [0.07, 0.047, 0.050], [0.15, 0.041, 0.044], [0.23, 0.035, 0.038], [0.275, 0.033, 0.036],
            [0.33, 0.036, 0.037], [0.40, 0.031, 0.032], [0.47, 0.025, 0.027], [0.525, 0.021, 0.026]])
ARM_B = math.radians(27); SB, CB = math.sin(ARM_B), math.cos(ARM_B); SHX, SHY, SHZ = 0.166, 1.388, -0.012
HEM, TOPB = 0.735, 1.288                      # dress hem height / bare-back edge height

def f_torso(x, y, z):
    rx, rz, cz, n = TORSO(y, 0), TORSO(y, 1), TORSO(y, 2), TORSO(y, 3)
    d = ((np.abs(x) / rx) ** n + (np.abs(z - cz) / rz) ** n) ** (1.0 / n)
    d = (d - 1.0) * np.minimum(rx, rz)
    return smax(smax(d, TORSO.t0 - y, 0.03), y - TORSO.t1, 0.03), cz - rz
def f_glute(ax, y, z): return ell(ax - 0.080, y - 0.905, z + 0.078, 0.094, 0.102, 0.086)
def f_bust(ax, y, z):  return ell(ax - 0.074, y - 1.268, z - 0.072, 0.068, 0.066, 0.064)
def f_scap(ax, y, z):  return ell(ax - 0.078, y - 1.325, z + 0.082, 0.052, 0.066, 0.030)
def f_leg(ax, y, z):
    cx, cz, rx, rz = LEG(y, 0), LEG(y, 1), LEG(y, 2), LEG(y, 3)
    d = (np.hypot((ax - cx) / rx, (z - cz) / rz) - 1.0) * np.minimum(rx, rz)
    d = smax(smax(d, y - LEG.t1, 0.03), LEG.t0 - y, 0.02)
    f = smin(ell(ax - 0.076, y - 0.042, z + 0.032, 0.034, 0.042, 0.048),      # heel
             ell(ax - 0.080, y - 0.027, z - 0.064, 0.045, 0.028, 0.088), 0.03)  # forefoot
    return smin(d, smax(f, -y, 0.006), 0.025)
def f_arm(ax, y, z):
    px, py, w = ax - SHX, y - SHY, z - SHZ
    s, p = px * SB - py * CB, px * CB + py * SB
    ra, rb = ARM(s, 0), ARM(s, 1)
    d = (np.hypot(p / ra, w / rb) - 1.0) * np.minimum(ra, rb)
    d = smax(smax(d, -s - 0.02, 0.03), s - ARM.t1, 0.02)
    # hand: palm, four fingers and a thumb (fingers meet in creases, not blends)
    palm = ell(s - 0.566, p, w - 0.004, 0.050, 0.0140, 0.041)
    fing = np.minimum(np.minimum(seg(s, p, w, (0.600, 0, 0.030), (0.672, 0.004, 0.033), 0.0086, 0.0070),
                                 seg(s, p, w, (0.604, 0, 0.0105), (0.684, 0.005, 0.0110), 0.0088, 0.0072)),
                      np.minimum(seg(s, p, w, (0.602, 0, -0.0095), (0.676, 0.005, -0.0105), 0.0085, 0.0069),
                                 seg(s, p, w, (0.594, 0, -0.0285), (0.656, 0.004, -0.0315), 0.0076, 0.0062)))
    hand = smin(smin(palm, fing, 0.009), seg(s, p, w, (0.538, 0.002, 0.034), (0.606, 0.006, 0.064), 0.0115, 0.0085), 0.010)
    d = smin(d, hand, 0.018)
    return smin(d, ell(ax - 0.172, y - 1.366, z + 0.012, 0.050, 0.060, 0.056), 0.03)    # deltoid cap
def f_headneck(ax, y, z):
    ny = sat((y - 1.43) / 0.125)
    d = np.sqrt(ax * ax + (y - (1.43 + 0.125 * ny)) ** 2 + (z - (-0.016 + 0.016 * ny)) ** 2) - (0.048 - 0.006 * ny)
    h = ell(ax, y - 1.612, z - 0.008, 0.075, 0.094, 0.094)                           # cranium
    h = smin(h, ell(ax, y - 1.560, z - 0.030, 0.051, 0.054, 0.062), 0.03)            # jaw
    h = smin(h, ell(ax, y - 1.531, z - 0.062, 0.026, 0.022, 0.027), 0.02)            # chin
    h = smin(h, ell(ax - 0.040, y - 1.592, z - 0.062, 0.024, 0.022, 0.028), 0.03)    # cheekbone
    h = smax(h, 0.0165 - np.sqrt((ax - 0.031) ** 2 + (y - 1.619) ** 2 + (z - 0.106) ** 2), 0.014)   # eye socket
    h = smin(h, np.sqrt((ax - 0.031) ** 2 + (y - 1.619) ** 2 + (z - 0.0845) ** 2) - 0.0128, 0.004)  # lid over the eyeball
    h = smin(h, ell(ax, y - 1.606, z - 0.097, 0.0105, 0.027, 0.014), 0.012)          # nose bridge
    h = smin(h, ell(ax, y - 1.588, z - 0.108, 0.0140, 0.0120, 0.0155), 0.010)        # nose tip
    h = smin(h, ell(ax - 0.0115, y - 1.585, z - 0.1005, 0.0080, 0.0070, 0.0095), 0.006)   # nostril wings
    h = smin(h, ell(ax, y - 1.5650, z - 0.0890, 0.0230, 0.0064, 0.0120), 0.006)      # upper lip
    h = smin(h, ell(ax, y - 1.5545, z - 0.0880, 0.0200, 0.0074, 0.0120), 0.006)      # lower lip
    h = smin(h, ell(ax - 0.0735, y - 1.602, z + 0.004, 0.0085, 0.026, 0.015), 0.006) # ear
    return smin(d, h, 0.02)
def body_parts(x, y, z):
    """Torso, head+neck, leg and arm fields (kept separate for skin-weight ownership)."""
    ax = np.abs(x)
    t, zb = f_torso(x, y, z)
    t = smin(t, f_glute(ax, y, z), 0.035)
    t = smin(smin(t, f_bust(ax, y, z), 0.03), f_scap(ax, y, z), 0.03)
    gf = sstep(0.98, 1.06, y) * sstep(1.42, 1.34, y) * (z < 0)                       # spinal furrow on the bare back
    g = smax(t, 0.004 * gf - np.hypot(ax, z - zb + 0.004), np.maximum(0.02 * gf, 1e-6))
    t = np.where(gf > 0.01, g, t)
    return t, f_headneck(ax, y, z), f_leg(ax, y, z), f_arm(ax, y, z)
def f_body(x, y, z):
    t, hn, lg, ar = body_parts(x, y, z)
    return smin(smin(smin(t, hn, 0.035), lg, 0.022), ar, 0.028)
def f_dress(x, y, z):
    """Form-fitting dress: the body offset outward, both thighs wrapped by one skirt hull."""
    ax = np.abs(x); t, _ = f_torso(x, y, z)
    t = smin(t, f_glute(ax, y, z), 0.04)
    t = smin(t, f_bust(ax, y, z), 0.035)
    t = smin(t, ell(ax, y - 1.262, z - 0.064, 0.075, 0.058, 0.058), 0.03)            # fabric bridging the bust
    t = smin(t, f_scap(ax, y, z), 0.03)
    t = smin(t, f_headneck(ax, y, z), 0.035)
    t = smin(t, f_leg(ax, y, z), 0.03)
    cx, cz, rx, rz = LEG(y, 0), LEG(y, 1), LEG(y, 2), LEG(y, 3)
    u, v = ax / (cx + rx * 0.86), np.abs(z - cz) / (rz * 0.94)
    hull = (np.cbrt(u ** 3 + v ** 3) - 1.0) * rz * 0.94
    hull = smax(smax(hull, y - 0.93, 0.03), 0.60 - y, 0.03)
    return smin(t, hull, 0.02) - 0.0055
def hair_mask(x, y, z):   # > 0 inside the hairline: forehead arc -> temple -> over the ear -> nape
    return 0.8 * (y - (1.545 + 0.085 * sstep(-0.055, -0.02, z) + 0.058 * sstep(0.03, 0.085, z)))
def f_hair(x, y, z):
    ax = np.abs(x)
    h = smin(ell(ax, y - 1.612, z - 0.008, 0.075, 0.094, 0.094), ell(ax, y - 1.585, z + 0.020, 0.066, 0.070, 0.072), 0.03)
    h = h - (0.0025 + 0.0050 * sstep(0.0, 0.02, hair_mask(x, y, z)))
    return smin(h, ell(ax, y - 1.664, z + 0.080, 0.030, 0.028, 0.030), 0.025)
def dress_mask(x, y, z):  # > 0 where the garment pattern covers the surface (metres from the cut line)
    ax = np.abs(x); t = sat((y - 1.26) / 0.205); hw = lerp(0.170, 0.034, t ** 0.8)
    tube = np.minimum(y - HEM, TOPB - y)
    bib = np.minimum(np.minimum(hw - ax, z - lerp(-0.012, 0.012, t)), np.minimum(1.470 - y, y - 1.25))
    strap = np.minimum(np.minimum(y - 1.438, 1.470 - y), 0.085 - ax)
    return np.maximum(tube, np.maximum(bib, strap))

# ---------------------------------------------------------------------------------------
# 2. SURFACE EXTRACTION: narrow-band sampling + vectorised Surface Nets (all-quad mesh)
# ---------------------------------------------------------------------------------------
def sample_field(f, b0, b1, h, coarse=4):
    """Sample f on a regular grid; only blocks near the surface are evaluated densely."""
    n = [int(round((b1[i] - b0[i]) / h)) + 1 for i in range(3)]
    ax = [b0[i] + np.arange(n[i]) * h for i in range(3)]
    cax = [a[::coarse] for a in ax]
    X, Y, Z = np.meshgrid(*cax, indexing="ij")
    Fc = f(X.ravel(), Y.ravel(), Z.ravel()).reshape(X.shape)
    idx = [np.minimum(np.rint(np.arange(n[i]) / coarse).astype(int), len(cax[i]) - 1) for i in range(3)]
    F = Fc[np.ix_(*idx)].astype(np.float32)
    I, J, K = np.nonzero((np.abs(Fc) < coarse * h * 1.7)[np.ix_(*idx)])
    for s in range(0, len(I), 400000):
        sl = slice(s, s + 400000)
        F[I[sl], J[sl], K[sl]] = f(ax[0][I[sl]], ax[1][J[sl]], ax[2][K[sl]])
    return F

def surface_nets(F, origin, h):
    """One vertex per sign-changing cell (mean of its edge crossings), one quad per sign-changing grid edge."""
    inside = F < 0
    nx, ny, nz = F.shape
    corners = [(i, j, k) for k in (0, 1) for j in (0, 1) for i in (0, 1)]
    cnt = np.zeros((nx - 1, ny - 1, nz - 1), np.int8)
    for (i, j, k) in corners:
        cnt += inside[i:nx - 1 + i, j:ny - 1 + j, k:nz - 1 + k]
    ci, cj, ck = np.nonzero((cnt > 0) & (cnt < 8)); n = len(ci)
    vid = np.full(cnt.shape, -1, np.int32); vid[ci, cj, ck] = np.arange(n)
    acc = np.zeros((n, 3)); num = np.zeros(n)
    for a in corners:
        fa = F[ci + a[0], cj + a[1], ck + a[2]].astype(np.float64)
        for axis in range(3):
            if a[axis]: continue
            b = list(a); b[axis] = 1
            fb = F[ci + b[0], cj + b[1], ck + b[2]].astype(np.float64)
            cross = (fa < 0) != (fb < 0)
            t = np.where(cross, fa / np.where(cross, fa - fb, 1.0), 0.0)
            for d in range(3):
                acc[:, d] += cross * (a[d] + (t if d == axis else 0.0))
            num += cross
    V = np.asarray(origin) + (np.stack([ci, cj, ck], 1) + acc / num[:, None]) * h
    quads = []
    for d in range(3):
        u, v = (d + 1) % 3, (d + 2) % 3
        lo = tuple(slice(0, s - 1) for s in F.shape)
        hi = list(lo); hi[d] = slice(1, F.shape[d])
        a_in = inside[lo]; e = a_in != inside[tuple(hi)]
        cut = [slice(None)] * 3; cut[u] = 0; e[tuple(cut)] = False
        cut = [slice(None)] * 3; cut[v] = 0; e[tuple(cut)] = False
        idx = np.stack(np.nonzero(e), 1)
        du = np.zeros(3, int); du[u] = 1; dv = np.zeros(3, int); dv[v] = 1
        q = np.stack([vid[tuple(idx.T)], vid[tuple((idx - du).T)], vid[tuple((idx - du - dv).T)], vid[tuple((idx - dv).T)]], 1)
        flip = ~a_in[tuple(idx.T)]
        q[flip] = q[flip][:, [0, 3, 2, 1]]
        quads.append(q[(q >= 0).all(1)])
    return V, np.concatenate(quads)

def compact(V, Q, keep_faces):
    Q = Q[keep_faces]; used = np.zeros(len(V), bool); used[Q.ravel()] = True
    remap = np.cumsum(used) - 1
    return V[used], remap[Q]

def relax(V, Q, iters=2, lam=0.5):
    """Umbrella-operator Laplacian smoothing over the quad edge graph (open borders stay put)."""
    e0 = Q.ravel(); e1 = np.roll(Q, -1, axis=1).ravel(); n = len(V)
    cnt = np.bincount(e0, minlength=n) + np.bincount(e1, minlength=n)
    for _ in range(iters):
        acc = np.stack([np.bincount(e0, V[e1, k], n) + np.bincount(e1, V[e0, k], n) for k in range(3)], 1)
        m = cnt >= 6
        V[m] += (acc[m] / cnt[m, None] - V[m]) * lam
    return V

def gradient(f, V, e=0.0015):
    g = np.empty_like(V)
    for k in range(3):
        d = np.zeros(3); d[k] = e
        g[:, k] = (f(*(V + d).T) - f(*(V - d).T)) / (2 * e)
    return g

def project(f, V, steps=2):
    """Newton re-projection onto the iso-surface; returns positions and analytic normals."""
    for _ in range(steps):
        g = gradient(f, V); gl = np.maximum((g * g).sum(1), 1e-12)
        V = V - (np.clip(f(*V.T), -0.006, 0.006) / gl)[:, None] * g
    g = gradient(f, V)
    return V, g / np.maximum(np.linalg.norm(g, axis=1), 1e-9)[:, None]

def extract_layer(f, b0, b1, h, keep=None, smooth=2):
    half = math.ceil(max(-b0[0], b1[0]) / h) * h                      # keep a grid plane exactly on x = 0
    b0, b1 = (-half, b0[1], b0[2]), (half, b1[1], b1[2])
    V, Q = surface_nets(sample_field(f, b0, b1, h), b0, h)
    if keep is not None:
        V, Q = compact(V, Q, keep(V)[Q].any(1))
    V = relax(V, Q, smooth)
    V, N = project(f, V)
    return V, N, Q

# ---------------------------------------------------------------------------------------
# 3. SKELETON LAYOUT, SKIN WEIGHTS AND SOFT-TISSUE ZONES
# ---------------------------------------------------------------------------------------
BONES = ["pelvis", "spine1", "spine2", "neck", "head", "upperarm.L", "forearm.L", "hand.L",
         "upperarm.R", "forearm.R", "hand.R", "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R"]
PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15]
JOINT = np.array([[0, 0.95, -0.005], [0, 1.07, 0], [0, 1.24, -0.004], [0, 1.445, -0.012], [0, 1.535, 0],
                  [SHX, SHY, SHZ], [SHX + SB * 0.275, SHY - CB * 0.275, SHZ], [SHX + SB * 0.525, SHY - CB * 0.525, SHZ],
                  [-SHX, SHY, SHZ], [-SHX - SB * 0.275, SHY - CB * 0.275, SHZ], [-SHX - SB * 0.525, SHY - CB * 0.525, SHZ],
                  [0.090, 0.905, -0.006], [0.083, 0.50, -0.012], [0.076, 0.085, -0.024],
                  [-0.090, 0.905, -0.006], [-0.083, 0.50, -0.012], [-0.076, 0.085, -0.024]])
# jiggle bones: (name, parent bone index, anchor in rest space, outward axis)
JIGGLE = [("jig_glute.L", 0, (0.082, 0.905, -0.10), (0.25, -0.1, -1)), ("jig_glute.R", 0, (-0.082, 0.905, -0.10), (-0.25, -0.1, -1)),
          ("jig_thigh.L", 11, (0.09, 0.74, -0.03), (0.3, 0, -1)),      ("jig_thigh.R", 14, (-0.09, 0.74, -0.03), (-0.3, 0, -1)),
          ("jig_chest.L", 2, (0.074, 1.265, 0.09), (0.2, 0, 1)),       ("jig_chest.R", 2, (-0.074, 1.265, 0.09), (-0.2, 0, 1)),
          ("jig_core", 1, (0, 1.08, 0.05), (0, 0, 1)),
          ("jig_scap.L", 2, (0.12, 1.35, -0.07), (0.5, 0, -1)),        ("jig_scap.R", 2, (-0.12, 1.35, -0.07), (-0.5, 0, -1))]
PONY_ROOT, PONY_DIR, PONY_N, PONY_SEG = np.array([0, 1.668, -0.088]), np.array([0, 0.32, -0.95]), 14, 0.0335

def zone_weights(x, y, z, layer):
    """Physics heatmap: per-zone soft-tissue weights. Returns (n x 9 zone weights, display heat 0..1)."""
    ax = np.abs(x); body = sstep(0.235, 0.200, ax)
    sw = 0.03 if layer == 1 else lerp(0.002, 0.02, sstep(0.79, 0.86, y))
    L = sstep(-sw, sw, x); R = 1 - L
    q = np.sqrt(((ax - 0.082) / 0.118) ** 2 + ((y - 0.905) / 0.128) ** 2 + ((z + 0.128) / 0.105) ** 2)
    wg = sstep(1.0, 0.38, q) * sstep(0.02, -0.04, z) * body                                    # 1.0  glute lobes
    wt = sstep(0.535, 0.70, y) * sstep(0.945, 0.845, y) * (0.42 + 0.38 * sstep(0.02, -0.07, z)) * (1 - 0.55 * wg) * body
    q = np.sqrt(((ax - 0.074) / 0.088) ** 2 + ((y - 1.265) / 0.086) ** 2 + ((z - 0.112) / 0.072) ** 2)
    wc = 0.92 * sstep(1.0, 0.38, q) * sstep(0.0, 0.04, z) * body                               # 0.9  chest lobes
    wcore = 0.45 * sstep(0.955, 1.03, y) * sstep(1.225, 1.14, y) * body                        # 0.45 waist / lower back
    q = np.sqrt(((ax - 0.178) / 0.085) ** 2 + ((y - 1.372) / 0.085) ** 2 + ((z + 0.012) / 0.085) ** 2)
    wdel = 0.42 * sstep(1.0, 0.3, q)                                                           # 0.4  deltoids (display only)
    q = np.sqrt(((ax - 0.082) / 0.085) ** 2 + ((y - 1.325) / 0.09) ** 2 + ((z + 0.09) / 0.07) ** 2)
    wsc = 0.36 * sstep(1.0, 0.3, q) * sstep(0.0, -0.03, z)                                     # 0.35 scapulae
    S = sstep(-0.01, 0.01, x)
    Z = np.stack([wg * L, wg * R, wt * L, wt * R, wc * L, wc * R, wcore, wsc * S, wsc * (1 - S)], 1)
    return Z, np.maximum.reduce([wg, wt, wc, wcore, wdel, wsc])

def skin_weights(x, y, z, layer):
    """Analytic linear-blend weights for the 17 deform bones. Returns (n x 17, arm ownership)."""
    n = len(x); W = np.zeros((n, len(BONES)))
    if layer == 2:
        W[:, 4] = 1; return W, np.zeros(n)
    P = np.stack(body_parts(x, y, z), 1); ax = np.abs(x)
    w = np.exp(-(P - P.min(1, keepdims=True)) / 0.012)
    if layer == 1: w[:, 3] = 0                                   # the dress never follows the arms
    w /= w.sum(1, keepdims=True); wT, wH, wL, wA = w.T
    sw = 0.05 if layer == 1 else lerp(0.002, 0.03, sstep(0.79, 0.87, y))
    L = sstep(-sw, sw, x); R = 1 - L
    th, up1, up2, nk = sstep(0.955, 0.79, y), sstep(0.98, 1.10, y), sstep(1.14, 1.30, y), sstep(1.405, 1.47, y)
    sh, ft = sstep(0.545, 0.455, y), sstep(0.115, 0.06, y)
    s2, hd = 1 - sstep(1.40, 1.46, y), sstep(1.50, 1.565, y)
    s = (ax - SHX) * SB - (y - SHY) * CB
    ua, fa, hn = sstep(-0.035, 0.055, s), sstep(0.235, 0.315, s), sstep(0.495, 0.555, s)
    W[:, 0] = wT * (1 - up1) * (1 - th) + wL * (1 - th)
    tt = wT * th + wL * th * (1 - sh)
    W[:, 11], W[:, 14] = tt * L, tt * R
    W[:, 12], W[:, 15] = wL * sh * (1 - ft) * L, wL * sh * (1 - ft) * R
    W[:, 13], W[:, 16] = wL * sh * ft * L, wL * sh * ft * R
    W[:, 1] = wT * up1 * (1 - up2)
    W[:, 2] = wT * up2 * (1 - nk) + wH * s2 + wA * (1 - ua)
    W[:, 3] = wT * up2 * nk + wH * (1 - s2) * (1 - hd)
    W[:, 4] = wH * (1 - s2) * hd
    left = x >= 0
    for o, m in ((5, left), (8, ~left)):
        W[:, o] += m * wA * ua * (1 - fa); W[:, o + 1] += m * wA * ua * fa * (1 - hn); W[:, o + 2] += m * wA * ua * fa * hn
    return W, wA

def heat_color(t):
    """Blue -> cyan -> green -> yellow -> red ramp used for the physics heatmap."""
    stops = np.array([[0.02, 0.07, 0.72], [0.0, 0.72, 1.0], [0.08, 0.85, 0.25], [1.0, 0.88, 0.08], [1.0, 0.10, 0.04]])
    f = sat(t) * 4; i = np.minimum(f.astype(int), 3); u = (f - i)[:, None]
    return np.concatenate([stops[i] * (1 - u) + stops[i + 1] * u, np.ones((len(t), 1))], 1)

def build_layers():
    """Extract body, dress and scalp-hair surfaces and bake every per-vertex quantity."""
    h = VOXEL; out = {}
    specs = [("Body", f_body, (-0.505, -0.012, -0.192), (0.505, 1.724, 0.184), h, None, 0),
             ("Dress", f_dress, (-0.225, 0.70, -0.195), (0.225, 1.50, 0.17), h, lambda V: dress_mask(*V.T) > -0.012, 1),
             ("HairCap", f_hair, (-0.105, 1.50, -0.13), (0.105, 1.73, 0.125), h * 0.8, lambda V: hair_mask(*V.T) > -0.010, 2)]
    for name, f, b0, b1, hh, keep, lid in specs:
        V, N, Q = extract_layer(f, b0, b1, hh, keep)
        x, y, z = V.T
        W, arm = skin_weights(x, y, z, lid)
        Z, heat = zone_weights(x, y, z, lid) if lid < 2 else (np.zeros((len(V), 9)), 0.3 + 0.25 * sstep(0.02, -0.08, z))
        dm, hm = dress_mask(x, y, z), hair_mask(x, y, z)
        if lid == 0:
            torso = arm < 0.5
            tuck = torso & (dm > 0.008)                                   # tuck skin under the cloth
            V[tuck] -= N[tuck] * 0.0035
            hidden = (torso & (dm > 0.070)) | ((y > 1.5) & (hm > 0.012))   # never visible: drop those faces
            keepf = ~hidden[Q].all(1)
            used = np.zeros(len(V), bool); used[Q[keepf].ravel()] = True
            V, Q = compact(V, Q, keepf)
            N, W, Z, heat, dm, hm, x, y, z = N[used], W[used], Z[used], heat[used], dm[used], hm[used], x[used], y[used], z[used]
        # jiggle bones take their share of each vertex from the skeleton weights
        a = np.minimum(Z.sum(1), 0.95); Zs = Z * (a / np.maximum(Z.sum(1), 1e-9))[:, None]
        W = W / W.sum(1, keepdims=True) * (1 - a)[:, None]
        out[name] = dict(V=V, N=N, Q=Q, W=W, Z=Zs, heat=heat, dress_mask=dm, hair_mask=hm, layer=lid,
                         face=sstep(0.040, 0.056, z) * sstep(1.50, 1.515, y) if lid == 0 else np.zeros(len(V)))
        log(f"{name}: {len(V)} verts, {len(Q)} quads")
    return out

# ---------------------------------------------------------------------------------------
# 4. BLENDER OBJECTS
# ---------------------------------------------------------------------------------------
def to_b(V):
    """Prototype axes (x left, y up, z front) -> Blender (X left, Y back, Z up); the character faces -Y."""
    V = np.asarray(V, float); return np.stack([V[..., 0], -V[..., 2], V[..., 1]], -1)
AXES = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))               # same mapping as a rotation matrix

def new_collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c

def make_mesh(name, L, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata(to_b(L["V"]).tolist(), [], L["Q"].tolist()); me.update()
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), bool))
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    # rest-space coordinates and pattern masks for the shaders
    me.attributes.new("rest", "FLOAT_VECTOR", "POINT").data.foreach_set("vector", L["V"].ravel())
    for key in ("dress_mask", "hair_mask", "face", "heat"):
        me.attributes.new(key, "FLOAT", "POINT").data.foreach_set("value", np.asarray(L[key], float))
    me.color_attributes.new("jiggle_heat", "FLOAT_COLOR", "POINT").data.foreach_set("color", heat_color(L["heat"]).ravel())
    # planar face UVs (front projection of the head)
    li = np.zeros(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", li)
    uv = np.stack([(L["V"][li, 0] + 0.1) / 0.2, (L["V"][li, 1] - 1.5) / 0.2], 1)
    me.uv_layers.new(name="face_uv").data.foreach_set("uv", uv.ravel())
    # vertex groups: deform bones, jiggle bones, and the display heatmap (Weight Paint mode shows it natively)
    names = BONES + [j[0] for j in JIGGLE]; W = np.concatenate([L["W"], L["Z"]], 1)
    for b, nm in enumerate(names):
        idx = np.nonzero(W[:, b] > 0.004)[0]
        if not len(idx): continue
        vg = ob.vertex_groups.new(name=nm)
        for q in np.unique(np.round(W[idx, b], 2)):               # batch by quantised weight: far fewer API calls
            vg.add(idx[np.round(W[idx, b], 2) == q].tolist(), float(q), "REPLACE")
    vg = ob.vertex_groups.new(name="jiggle_weight")
    for q in np.unique(np.round(L["heat"], 2)):
        if q > 0: vg.add(np.nonzero(np.round(L["heat"], 2) == q)[0].tolist(), float(q), "REPLACE")
    return ob

def pony_rest_nodes():
    """Rest shape of the ponytail guide chain: out of the tie, then hanging."""
    d = PONY_DIR / np.linalg.norm(PONY_DIR); n = [PONY_ROOT.copy(), PONY_ROOT + d * PONY_SEG]
    for i in range(2, PONY_N):
        n.append(n[1] + np.array([0, -(i - 1) * PONY_SEG, -(i - 1) * 0.004]) * (PONY_SEG / math.hypot(PONY_SEG, 0.004)))
    return np.array(n)

def make_armature(coll):
    """17 deform bones + 9 jiggle bones + a 13-bone ponytail chain. Bind pose = the modelled A-pose."""
    arm = bpy.data.armatures.new("Rig"); ob = bpy.data.objects.new("Rig", arm); coll.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones; J = to_b(JOINT)
    tails = {0: J[1], 1: J[2], 2: J[3], 3: J[4], 4: J[4] + np.array([0, 0, 0.17]),
             5: J[6], 6: J[7], 7: 2 * J[7] - J[6] + (J[6] - J[7]) * 0.66, 8: J[9], 9: J[10], 10: 2 * J[10] - J[9] + (J[9] - J[10]) * 0.66,
             11: J[12], 12: J[13], 13: J[13] + np.array([0, -0.13, -0.06]), 14: J[15], 15: J[16], 16: J[16] + np.array([0, -0.13, -0.06])}
    for i, name in enumerate(BONES):
        b = eb.new(name); b.head, b.tail = J[i], tails[i]
        if PARENT[i] >= 0: b.parent = eb[BONES[PARENT[i]]]
    for name, parent, anchor, axis in JIGGLE:
        a = to_b(anchor); ax = to_b(axis); ax = ax / np.linalg.norm(ax)
        b = eb.new(name); b.head, b.tail = a, a + ax * 0.06; b.parent = eb[BONES[parent]]
    nodes = to_b(pony_rest_nodes()); prev = eb["head"]
    for i in range(PONY_N - 1):
        b = eb.new(f"pony.{i:02d}"); b.head, b.tail = nodes[i], nodes[i + 1]; b.parent = prev; prev = b
    for b in eb: b.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.show_in_front = True; arm.display_type = "STICK"
    return ob

def bind(ob, rig, subsurf=1):
    ob.parent = rig
    m = ob.modifiers.new("Armature", "ARMATURE"); m.object = rig
    if subsurf:
        s = ob.modifiers.new("Subdivision", "SUBSURF"); s.levels = 0; s.render_levels = subsurf

# ---------------------------------------------------------------------------------------
# 5. LOCOMOTION SOLVER (prototype axes): pelvic kinematics, spine counter-rotation, leg IK
# ---------------------------------------------------------------------------------------
AX, AY, AZ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
JV = [Vector(j) for j in JOINT]
L1, L2 = (JV[11] - JV[12]).length, (JV[12] - JV[13]).length
HIP_OFF = [JV[11] - JV[0], JV[14] - JV[0]]
HINGE = [Vector((-CB, -SB, 0)), Vector((-CB, SB, 0))]                # elbow hinge axes in bind space
def fstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0); return t * t * (3 - 2 * t)
def fsmin(a, b, k):
    h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25
def eul(pitch, yaw, roll): return Quaternion(AY, yaw) @ Quaternion(AZ, roll) @ Quaternion(AX, pitch)
def frame_q(yv, fw):
    y = yv.normalized(); x = y.cross(fw).normalized(); z = x.cross(y)
    return Matrix((x, y, z)).transposed().to_quaternion()
BIND_INV = [frame_q(JV[i] - JV[i + 1], AZ).inverted() for i in (11, 12, 14, 15)]

def new_pose(**kw):
    P = dict(px=0, py=0.95, pz=0, pRoll=0, pYaw=0, pPitch=0, s1Roll=0, s1Yaw=0, s1Pitch=0, s2Roll=0, s2Yaw=0, s2Pitch=0,
             nYaw=0, nPitch=0, nRoll=0, hRoll=0, hYaw=0, hPitch=0, aLf=0, aLa=0, aLe=0, aRf=0, aRa=0, aRe=0,
             fLx=0.076, fLy=0.085, fLz=-0.024, fLp=0, fRx=-0.076, fRy=0.085, fRz=-0.024, fRp=0, speed=0, reach=0.9995, yaw=0)
    P.update(kw); return P

def solve_skeleton(P):
    """Pose parameters -> joint positions and rotations in world space (root yaw applied)."""
    pos, rot = [None] * 17, [None] * 17
    rot[0] = eul(P["pPitch"], P["pYaw"], P["pRoll"])
    py = P["py"]; lm = (L1 + L2) * P["reach"]
    for s, side in enumerate("LR"):                 # pelvis height is limited by how far each planted leg can reach
        o = rot[0] @ HIP_OFF[s]
        dx, dz = P[f"f{side}x"] - (P["px"] + o.x), P[f"f{side}z"] - (P["pz"] + o.z)
        py = fsmin(py, P[f"f{side}y"] + math.sqrt(max(lm * lm - dx * dx - dz * dz, 0.04)) - o.y, 0.012)
    pos[0] = Vector((P["px"], py, P["pz"]))
    def fk(i, lq):
        p = PARENT[i]; pos[i] = rot[p] @ (JV[i] - JV[p]) + pos[p]; rot[i] = rot[p] @ lq
    fk(1, eul(P["s1Pitch"], P["s1Yaw"], P["s1Roll"]))        # spine counter-rotation keeps the shoulders level
    fk(2, eul(P["s2Pitch"], P["s2Yaw"], P["s2Roll"]))
    fk(3, eul(P["nPitch"], P["nYaw"], P["nRoll"]))
    fk(4, eul(P["hPitch"], P["hYaw"], P["hRoll"]))
    fk(5, Quaternion(AX, -P["aLf"]) @ Quaternion(AZ, -P["aLa"])); fk(6, Quaternion(HINGE[0], P["aLe"])); fk(7, Quaternion())
    fk(8, Quaternion(AX, -P["aRf"]) @ Quaternion(AZ, P["aRa"]));  fk(9, Quaternion(HINGE[1], P["aRe"])); fk(10, Quaternion())
    flex = [0, 0]
    for s, side in enumerate("LR"):                 # analytic two-bone IK from hip joint to ankle target
        iT = 14 if s else 11
        H = rot[0] @ HIP_OFF[s] + pos[0]; A = Vector((P[f"f{side}x"], P[f"f{side}y"], P[f"f{side}z"]))
        u = A - H; d = u.length; dm = (L1 + L2) * 0.999
        if d > dm: u *= dm / d; d = dm; A = H + u
        u /= d
        ca = min(max((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1), 1); sa = math.sqrt(1 - ca * ca)
        f = Quaternion(AY, P["pYaw"] * 0.5) @ Vector((-0.10 if s else 0.10, 0, 1)).normalized()
        w = (f - u * u.dot(f)).normalized()
        K = H + u * (L1 * ca) + w * (L1 * sa)
        pos[iT], pos[iT + 1], pos[iT + 2] = H, K, A
        rot[iT] = frame_q(H - K, f) @ BIND_INV[s * 2]; rot[iT + 1] = frame_q(K - A, f) @ BIND_INV[s * 2 + 1]
        rot[iT + 2] = Quaternion(AY, -0.10 if s else 0.10) @ Quaternion(AX, P[f"f{side}p"])
        flex[s] = math.atan2(K.z - H.z, H.y - K.y)
    rq = Quaternion(AY, P["yaw"])
    return [rq @ p for p in pos], [rq @ r for r in rot], flex

GAITS = {
    "walk": dict(v=1.05, duty=0.62, zS=0.27, zO=-0.33, strike=-0.22, toe=0.62, lift=0.045, width=0.032, hip=0.945, bob=0,
                 list=0.105, yaw=0.15, shift=0.024, lean=0.035, arm=0.36, armAdd=0.37, elbow=0.16, elbowSw=0.22, heel=1.0, reach=0.9945),
    "jog":  dict(v=2.25, duty=0.40, zS=0.20, zO=-0.42, strike=0.02, toe=0.92, lift=0.20, width=0.045, hip=0.915, bob=0.032,
                 list=0.075, yaw=0.19, shift=0.012, lean=0.15, arm=0.72, armAdd=0.40, elbow=1.45, elbowSw=0.25, heel=1.5, reach=0.987)}

def foot_path(P, side, p, g):
    D, zS, zO = g["duty"], g["zS"], g["zO"]
    off_dz = lambda t: 0.085 * math.sin(t) + 0.12 * (1 - math.cos(t))
    off_y = lambda t: 0.085 * math.cos(t) + 0.12 * math.sin(t)
    if p < D:                                     # stance: heel strike -> flat -> heel-off roll onto the toes
        s = p / D; th = lerp(g["strike"], 0, fstep(0, 0.2, s)) + g["toe"] * fstep(0.66, 1, s)
        z = lerp(zS, zO, s) + (off_dz(th) if th > 0 else 0); y = off_y(th) if th > 0 else 0.085 + 0.055 * -th
    else:                                         # swing: Hermite arc that retracts into ground speed before contact
        u = (p - D) / (1 - D); u2, u3 = u * u, u * u * u; m = (zO - zS) / D * (1 - D); z0 = zO + off_dz(g["toe"])
        z = (2 * u3 - 3 * u2 + 1) * z0 + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * zS + (u3 - u2) * m
        y = lerp(off_y(g["toe"]), 0.085 + 0.055 * -min(g["strike"], 0), fstep(0, 1, u)) + g["lift"] * math.sin(math.pi * u) ** 1.3
        th = lerp(g["toe"], g["strike"], fstep(0.2, 0.92, u))
    P[f"f{side}x"] = (-1 if side == "R" else 1) * g["width"]; P[f"f{side}y"], P[f"f{side}z"], P[f"f{side}p"] = y, z, th

def gait_pose(g, ph, sway=1.0):
    P = new_pose(); a = ph * math.tau; c, s = math.cos(a), math.sin(a)
    foot_path(P, "L", ph % 1.0, g); foot_path(P, "R", (ph + 0.5) % 1.0, g)
    P["px"] = g["shift"] * sway * s
    P["py"] = g["hip"] + g["bob"] * math.cos(2 * a - math.tau * (g["duty"] + 0.5))     # jog: ballistic arc peaking mid-flight
    P["pRoll"] = g["list"] * sway * math.sin(a + 0.30)                                 # stance hip rises, swing hip drops
    P["pYaw"] = -g["yaw"] * (0.6 + 0.4 * sway) * c                                     # swing-side hip rotates forward
    P["pPitch"] = 0.05 + g["lean"] * 0.3
    P["s1Roll"], P["s1Yaw"], P["s1Pitch"] = -0.55 * P["pRoll"], -0.60 * P["pYaw"], g["lean"] * 0.5
    P["s2Roll"], P["s2Yaw"], P["s2Pitch"] = -0.50 * P["pRoll"], -0.80 * P["pYaw"], g["lean"] * 0.5
    P["nYaw"], P["nPitch"] = 0.25 * P["pYaw"], -g["lean"] * 0.6
    P["hYaw"], P["hRoll"], P["hPitch"] = 0.15 * P["pYaw"], 0.05 * P["pRoll"], -g["lean"] * 0.25
    P["aLf"], P["aRf"] = -g["arm"] * c, g["arm"] * c; P["aLa"] = P["aRa"] = g["armAdd"]
    P["aLe"], P["aRe"] = g["elbow"] + g["elbowSw"] * max(-c, 0), g["elbow"] + g["elbowSw"] * max(c, 0)
    P["speed"], P["reach"] = g["v"], g["reach"]
    return P

def idle_pose(t, period=4.4, sway=1.0):
    a = t * math.tau / period; w, w2, br = math.sin(a), math.sin(a + 0.7), math.sin(a * 1.0 + 1.9)
    P = new_pose(px=0.046 * w * sway, py=0.932 - 0.008 * abs(w), pRoll=0.105 * w * sway, pYaw=0.06 * w2 * sway, pPitch=0.04,
                 s1Roll=-0.065 * w * sway, s2Roll=-0.050 * w * sway, s1Yaw=-0.03 * w2 * sway, s2Pitch=0.012 * br,
                 hYaw=0.12 * math.sin(a + 2.4), hRoll=-0.03 * w, nPitch=-0.01 * br, aLa=0.36, aRa=0.36,
                 aLf=0.05 * w2, aRf=-0.05 * w2, aLe=0.15, aRe=0.15, fLx=0.085, fRx=-0.085, reach=0.997)
    uR, uL = max(w, 0) * sway, max(-w, 0) * sway          # the unweighted leg relaxes: heel lifts, knee breaks forward
    P["fRz"] += 0.035 * uR; P["fRp"] = 0.30 * uR; P["fRy"] = 0.085 + 0.035 * uR
    P["fLz"] += 0.035 * uL; P["fLp"] = 0.30 * uL; P["fLy"] = 0.085 + 0.035 * uL
    return P

def turn_pose(t):
    """Idle with a 180-degree quick turn out and back (the skull leads, the torso follows)."""
    P = idle_pose(t); seq = [(0.45, 0.52, 0.0, 1), (2.67, 0.52, math.pi, -1)]
    P["yaw"] = 0.0 if t < 2.67 else math.pi
    for start, dur, base, sgn in seq:
        if t >= start:
            u = min((t - start) / dur, 1.0); e = u * u * u * (u * (u * 6 - 15) + 10); b = math.sin(math.pi * u)
            P["yaw"] = base + sgn * math.pi * e
            P["hYaw"] += sgn * 0.55 * math.sin(math.pi * min(u * 1.6, 1)); P["nYaw"] += sgn * 0.2 * b; P["s2Yaw"] += sgn * 0.22 * b
            P["py"] -= 0.035 * b; P["aLa"] -= 0.2 * b; P["aRa"] -= 0.2 * b; P["fRy"] += 0.04 * b; P["s2Pitch"] += 0.05 * b
    return P

def portrait_pose():
    """Standing contrapposto, glancing back over the right shoulder (hero still)."""
    P = idle_pose(1.1)
    P.update(hYaw=-0.62, nYaw=-0.42, s2Yaw=-0.30, s1Yaw=-0.12, hPitch=0.06, hRoll=0.05, aLf=0.14, aRf=-0.10, aLe=0.22, aRe=0.30)
    return P

# ---------------------------------------------------------------------------------------
# 6. PHYSICS: per-zone spring-mass-dampers + Verlet ponytail, simulated at 120 Hz and baked
#    F = -k x - c v - m a_bone + F_heel + F_gravity_sag
# ---------------------------------------------------------------------------------------
from mathutils import noise as mnoise
H = 1.0 / 120.0
ZONE_PARAMS = [dict(mx=0.030, inr=0.62), dict(mx=0.030, inr=0.62), dict(k=1.3, mx=0.022, inr=0.22), dict(k=1.3, mx=0.022, inr=0.22),
               dict(k=1.5, c=1.15, mx=0.016, inr=0.40), dict(k=1.5, c=1.15, mx=0.016, inr=0.40), dict(k=1.7, c=1.2, mx=0.012, inr=0.35),
               dict(k=2.0, c=1.6, mx=0.012, sag=0.0, inr=0.15), dict(k=2.0, c=1.6, mx=0.012, sag=0.0, inr=0.15)]

class SoftZone:
    def __init__(self, bone, anchor, axis, k=1.0, c=1.0, mx=0.03, sag=0.08, inr=1.0):
        self.bone, self.anchor, self.axis = bone, Vector(anchor) - JV[bone], Vector(axis).normalized()
        self.kM, self.cM, self.max, self.sag, self.inr = k, c, mx, sag, inr
        self.x, self.v, self.acc, self.gl, self.drive = Vector(), Vector(), Vector(), Vector(), Vector()
        self.pw, self.pv = None, Vector()
    def kinematics(self, pos, rot, dt):               # bone-anchor acceleration by finite differences, in bone space
        cw = rot[self.bone] @ self.anchor + pos[self.bone]
        if self.pw is None: self.pw = cw.copy()
        v = (cw - self.pw) / dt; a = (v - self.pv) / dt
        if a.length > 32: a *= 32 / a.length
        self.pw, self.pv = cw, v
        qi = rot[self.bone].inverted()
        self.acc = self.acc.lerp((qi @ a) * self.inr, 0.6); self.gl = qi @ Vector((0, -9.81 * self.sag, 0))
    def step(self, k, c):
        r = self.x.length / self.max; ks = k * self.kM * (1 + 2.5 * r * r)       # progressive stiffening = tissue envelope
        self.v += H * (-ks * (self.x - self.drive) - c * self.cM * self.v - self.acc + self.gl)
        self.x += self.v * H
        l = self.x.length
        if l > self.max * 1.6: self.x *= self.max * 1.6 / l; self.v *= 0.5

COLLIDERS = [  # (bone, a, b, radius or ellipsoid radii) in bind space
    (4, (0, 1.612, 0.008), None, (0.0825, 0.1015, 0.1015)),              # cranium incl. scalp hair
    (4, (0, 1.575, 0.024), None, 0.081),                                # jaw / face
    (3, (0, 1.440, -0.014), (0, 1.550, 0.000), 0.052),                  # neck
    (2, (0.165, 1.385, -0.012), None, 0.080), (2, (-0.165, 1.385, -0.012), None, 0.080),   # shoulders
    (2, (-0.105, 1.365, -0.030), (0.105, 1.365, -0.030), 0.088),        # trapezius / shoulder blades
    (2, (0, 1.180, -0.012), (0, 1.400, -0.030), 0.098)]                 # upper back

class HairChain:
    """14-node Verlet chain: nodes 0-1 follow the skull, the rest lag, whip and collide."""
    def __init__(self, rad=0.013, drag=2.6):
        self.rest = [Vector(p) for p in pony_rest_nodes()]; self.rad, self.drag = rad, drag
        self.p = None
    def anchor(self, pos, rot):
        w = lambda i: rot[4] @ (self.rest[i] - JV[4]) + pos[4]
        self.pr = (self.r0, self.r1) if self.p else (w(0), w(1))
        self.r0, self.r1 = w(0), w(1)
        if self.p is None:
            self.p = [w(i) for i in range(PONY_N)]; self.q = [v.copy() for v in self.p]
        self.coll = []
        for bone, a, b, r in COLLIDERS:
            A = rot[bone] @ (Vector(a) - JV[bone]) + pos[bone]
            B = rot[bone] @ (Vector(b) - JV[bone]) + pos[bone] if b else None
            self.coll.append((A, B, r, rot[bone]))
    def step(self, f, theta, air, wind):
        p, q = self.p, self.q
        p[0] = self.pr[0].lerp(self.r0, f); q[0] = p[0].copy(); p[1] = self.pr[1].lerp(self.r1, f); q[1] = p[1].copy()
        loop = Vector((math.cos(theta), math.sin(theta), 0)) * 1.3      # time on a circle -> seamlessly looping turbulence
        for i in range(2, PONY_N):
            x = p[i]; v = (x - q[i]) / H
            g = 0.55 + 0.45 * mnoise.noise(loop * 0.6 + Vector((0, 1.7, x.x * 0.3)))
            w = air + wind * Vector((0.85 * g + 0.6 * mnoise.noise(x * 1.7 + loop), 0.30 * mnoise.noise(x * 1.7 + loop + Vector((0, 0, 31.4))),
                                     0.35 * g + 0.6 * mnoise.noise(x * 1.7 + loop + Vector((17.2, 0, 0)))))
            v += H * ((w - v) * self.drag * (0.7 + 0.6 * i / PONY_N) + Vector((0, -9.81, 0)))
            q[i] = x.copy(); p[i] = x + v * H
        for _ in range(3):
            for i in range(2, PONY_N):                                  # distance constraints (parent heavier)
                d = p[i] - p[i - 1]; l = d.length or 1e-6; e = (l - PONY_SEG) / l; wp = 0.28 if i > 2 else 0.0
                p[i - 1] += d * e * wp; p[i] -= d * e * (1 - wp)
            for i in range(2, PONY_N):                                  # bend limit keeps a smooth S-curve
                d = p[i] - p[i - 2]; l = d.length or 1e-6; lim = PONY_SEG * (1.90 if i < 5 else 1.72)
                if l < lim: p[i] += d * ((lim - l) / l * 0.5)
            for i in range(2, PONY_N):                                  # push every node out of the body colliders
                for A, B, r, R in self.coll:
                    if isinstance(r, tuple):
                        loc = R.inverted() @ (p[i] - A); n = math.sqrt(sum((loc[k] / (r[k] + self.rad)) ** 2 for k in range(3)))
                        if n < 1: new = A + R @ (loc / max(n, 1e-4)); q[i] += (new - q[i]) * 0.12; p[i] = new
                        continue
                    c = A
                    if B is not None:
                        ab = B - A; c = A + ab * min(max((p[i] - A).dot(ab) / ab.length_squared, 0), 1)
                    d = p[i] - c; l = d.length or 1e-6
                    if l < r + self.rad: new = c + d * ((r + self.rad) / l); q[i] += (new - q[i]) * 0.12; p[i] = new

def simulate(pose_fn, n_frames, warm_frames, loop_frames=None):
    """Run pose + physics at 60 Hz ticks (2 substeps each) and record one sample per frame."""
    zones = [SoftZone(par, anc, axis, **zp) for (_, par, anc, axis), zp in zip(JIGGLE, ZONE_PARAMS)]
    chain = HairChain(); pending = []; recs = []; prev_ph = None; tick_dt = 1.0 / 60.0; per = 60 // FPS
    for tick in range((warm_frames + n_frames) * per):
        frame = tick / per - warm_frames; t = frame / FPS
        P = pose_fn(t); pos, rot, flex = solve_skeleton(P)
        ph = P.get("phase")
        if ph is not None and prev_ph is not None:                      # heel-strike shockwave up the planted leg
            for side, off in ((0, 0.0), (1, 0.5)):
                if math.floor(ph + off) != math.floor(prev_ph + off):
                    Jm = 0.21 * P["heel"] * PHYS["bounce"]; sx = -1 if side else 1; s, o = side, 1 - side
                    pending += [[0.020, zones[2 + s], Vector((0.05 * sx, 0.85, -0.30)), Jm * 0.8], [0.045, zones[s], Vector((0.06 * sx, 1.0, -0.38)), Jm],
                                [0.070, zones[o], Vector((0, 1, -0.2)), Jm * 0.22], [0.090, zones[6], Vector((0, 1, 0)), Jm * 0.30],
                                [0.110, zones[4], Vector((0, 1, 0.1)), Jm * 0.30], [0.110, zones[5], Vector((0, 1, 0.1)), Jm * 0.30]]
        prev_ph = ph
        for z in zones: z.kinematics(pos, rot, tick_dt)
        zones[7].drive = Vector((0.007 * P["aLf"] + 0.004 * P["s2Yaw"], 0.004 * P["aLf"], 0.006 * P["aLf"]))     # scapular glide
        zones[8].drive = Vector((-0.007 * P["aRf"] + 0.004 * P["s2Yaw"], 0.004 * P["aRf"], 0.006 * P["aRf"]))
        chain.anchor(pos, rot)
        air = Quaternion(AY, P["yaw"]) @ Vector((0, 0, -P["speed"] * 0.55))
        theta = math.tau * frame / (loop_frames or 240)
        for s in (1, 2):
            for it in pending: it[0] -= H
            for it in [it for it in pending if it[0] <= 0]: it[1].v += it[2] * it[3]; pending.remove(it)
            for z in zones: z.step(PHYS["k"], PHYS["c"])
            chain.step(s / 2.0, theta, air, PHYS["wind"] * 1.7)
        if tick % per == 0 and frame >= 0:
            recs.append(dict(pos=pos, rot=rot, zones=[(z.x.copy(), z.x.dot(z.axis)) for z in zones], nodes=[v.copy() for v in chain.p]))
    if loop_frames: recs[loop_frames] = recs[0]                          # closing frame == first frame: seamless loop
    return recs

def bake_action(rig, name, recs):
    """Write the recorded motion as keyframes on deform, jiggle and ponytail bones."""
    act = bpy.data.actions.new(name); act.use_fake_user = True
    rig.animation_data_create(); rig.animation_data.action = act
    rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}; pb = rig.pose.bones; last = {}
    def key(nm, basis, loc=False, frame=1):
        l, q, _ = basis.decompose()
        if nm in last and last[nm].dot(q) < 0: q.negate()               # keep quaternions on one hemisphere
        last[nm] = q.copy(); pb[nm].rotation_quaternion = q; pb[nm].keyframe_insert("rotation_quaternion", frame=frame)
        if loc: pb[nm].location = l; pb[nm].keyframe_insert("location", frame=frame)
    for fi, r in enumerate(recs):
        fr = 1 + fi; M = {}
        for i, nm in enumerate(BONES):                                  # skin transform of each joint, in Blender axes
            R = (AXES @ r["rot"][i].to_matrix() @ AXES.transposed()).to_4x4()
            M[nm] = Matrix.Translation(AXES @ r["pos"][i]) @ R @ Matrix.Translation(-(AXES @ JV[i])) @ rest[nm]
        for i, nm in enumerate(BONES):
            pn = BONES[PARENT[i]] if PARENT[i] >= 0 else None
            key(nm, (M[pn] @ rest[pn].inverted() @ rest[nm]).inverted() @ M[nm] if pn else rest[nm].inverted() @ M[nm], loc=pn is None, frame=fr)
        for (nm, _, _, _), (x, comp) in zip(JIGGLE, r["zones"]):          # lag displacement + squash & stretch (volume preservation)
            pb[nm].location = rest[nm].to_3x3().inverted() @ (AXES @ x)
            c = comp / 0.10; pb[nm].scale = (1 - 0.45 * c, 1 + c, 1 - 0.45 * c)
            pb[nm].keyframe_insert("location", frame=fr); pb[nm].keyframe_insert("scale", frame=fr)
        Rh = AXES @ r["rot"][4].to_matrix() @ AXES.transposed(); nb = [AXES @ v for v in r["nodes"]]
        prevM, prevN = M["head"], "head"
        for i in range(PONY_N - 1):
            nm = f"pony.{i:02d}"; rr = rest[nm].to_3x3()
            d0 = (Rh @ rr.col[1]).normalized(); d1 = (nb[i + 1] - nb[i]).normalized()
            Mi = Matrix.Translation(nb[i]) @ (d0.rotation_difference(d1).to_matrix() @ Rh @ rr).to_4x4()
            key(nm, (prevM @ rest[prevN].inverted() @ rest[nm]).inverted() @ Mi, frame=fr)
            # the chain is re-built from rotations only, so carry the FK position forward for the next link
            prevM = prevM @ rest[prevN].inverted() @ rest[nm] @ pb[nm].rotation_quaternion.to_matrix().to_4x4(); prevN = nm
    return act

# ---------------------------------------------------------------------------------------
# 7. HAIR: thousands of real strands (polylines skinned to the rig, turned into curves by
#    a Geometry Nodes modifier so Cycles/EEVEE render them as hair)
# ---------------------------------------------------------------------------------------
def build_hair_strands(cap_V, n_pony, n_scalp, seed=7):
    rng = np.random.default_rng(seed); verts, edges, wts = [], [], []     # wts: per-vertex {bone name: weight}
    def add(points, weights):
        b = len(verts); verts.extend(points); wts.extend(weights)
        edges.extend((b + i, b + i + 1) for i in range(len(points) - 1))
    # --- ponytail: wavy clumps around the guide chain ---
    nodes = pony_rest_nodes(); tang = np.gradient(nodes, axis=0); tang /= np.linalg.norm(tang, axis=1)[:, None]
    e1 = np.cross(tang, [1.0, 0, 0]); e1 /= np.linalg.norm(e1, axis=1)[:, None]; e2 = np.cross(tang, e1)
    s = np.arange(PONY_N) / (PONY_N - 1)
    spread = 0.004 + 0.034 * np.sin(np.pi * s ** 0.62) ** 0.8 * (1 - 0.45 * s)
    n_clump = 46; cphi = rng.uniform(0, math.tau, n_clump); cr = 0.25 + 0.75 * np.sqrt(rng.uniform(0, 1, n_clump))
    com = rng.choice([-1, 1], n_clump) * rng.uniform(6, 13, n_clump); cwave = rng.uniform(0.004, 0.011, n_clump)
    for k in range(n_pony):
        c = rng.integers(n_clump); phi = rng.uniform(0, math.tau); rr = math.sqrt(rng.uniform()) * 0.0065
        ang = cphi[c] + s * com[c]; wav = cwave[c] * sstep(0.05, 0.3, s)
        loose = rr * (0.35 + 1.2 * np.sin(np.pi * np.minimum(s * 1.15, 1)))          # strands fan out inside a clump, pinch at tie and tip
        u = np.cos(cphi[c]) * spread * cr[c] + np.cos(ang) * wav + math.cos(phi) * loose
        w = np.sin(cphi[c]) * spread * cr[c] + np.sin(ang) * wav + math.sin(phi) * loose
        pts = nodes + e1 * u[:, None] + e2 * w[:, None]
        m = PONY_N - int(rng.integers(0, 4))                                         # uneven lengths -> tapered tip
        add(pts[:m].tolist(), [{"pony.00": 1.0} if j == 0 else {f"pony.{min(j - 1, 12):02d}": 0.5, f"pony.{min(j, 12):02d}": 0.5} for j in range(m)])
    # --- scalp: strands combed from the hairline back into the tie ---
    cand = cap_V[hair_mask(*cap_V.T) > 0.003]; roots = cand[rng.integers(0, len(cand), n_scalp)] + rng.normal(0, 0.002, (n_scalp, 3))
    K = 11; u = np.linspace(0, 1, K)[None, :, None]; tie = PONY_ROOT + np.array([0, -0.004, 0.012])
    P = (roots[:, None, :] * (1 - u) + tie[None, None, :] * u).reshape(-1, 3)
    lift = np.repeat(rng.uniform(0.0008, 0.0045, n_scalp), K) * np.tile(np.sin(np.pi * np.linspace(0.08, 1, K)) ** 0.5, n_scalp)
    for _ in range(6):                                                               # push the chords out onto the scalp shell
        g = gradient(f_hair, P); P = P - ((f_hair(*P.T) - lift) / np.maximum((g * g).sum(1), 1e-9))[:, None] * g
    P = P.reshape(n_scalp, K, 3); P[:, -1] = tie + rng.normal(0, 0.004, (n_scalp, 3))
    for k in range(n_scalp): add(P[k].tolist(), [{"head": 1.0}] * K)
    # --- two loose face-framing locks ---
    t = np.linspace(0, 1, 12)
    for sx in (1, -1):
        for k in range(26):
            j = rng.normal(0, 1, 3) * 0.0022; ph = rng.uniform(0, math.tau); ln = rng.uniform(0.78, 1.0)
            tt = t * ln
            x = sx * (0.047 + 0.036 * sstep(0, 0.32, tt) + 0.004 * np.sin(tt * 14 + ph)) + j[0]
            y = 1.681 - 0.165 * tt + j[1] * 0.5
            z = 0.033 + 0.036 * sstep(0, 0.4, tt) + 0.005 * np.cos(tt * 14 + ph) + j[2]
            add(np.stack([x, y, z], 1).tolist(), [{"head": 1.0}] * len(t))
    return np.array(verts), edges, wts

def hair_nodes(material, guides):
    """Geometry Nodes on a Curves object: read the skinned guide polylines, output smooth tapered hair curves."""
    ng = bpy.data.node_groups.new("StrandsToHair", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N = lambda t: ng.nodes.new(t)
    gin, gout, src = N("NodeGroupInput"), N("NodeGroupOutput"), N("GeometryNodeObjectInfo")
    src.transform_space = "RELATIVE"; src.inputs["Object"].default_value = guides
    m2c, spl, rad, mat = N("GeometryNodeMeshToCurve"), N("GeometryNodeCurveSplineType"), N("GeometryNodeSetCurveRadius"), N("GeometryNodeSetMaterial")
    par, m1, m2, m3 = N("GeometryNodeSplineParameter"), N("ShaderNodeMath"), N("ShaderNodeMath"), N("ShaderNodeMath")
    spl.spline_type = "CATMULL_ROM"; mat.inputs["Material"].default_value = material
    m1.operation = "POWER"; m1.inputs[1].default_value = 2.2                         # radius = R * (1 - 0.8 * t^2.2): tapered tips
    m2.operation = "MULTIPLY_ADD"; m2.inputs[1].default_value = -0.8; m2.inputs[2].default_value = 1.0
    m3.operation = "MULTIPLY"; m3.inputs[1].default_value = 0.00045
    L = ng.links.new
    L(src.outputs["Geometry"], m2c.inputs["Mesh"]); L(m2c.outputs["Curve"], spl.inputs["Curve"]); L(spl.outputs["Curve"], rad.inputs["Curve"])
    L(par.outputs["Factor"], m1.inputs[0]); L(m1.outputs[0], m2.inputs[0]); L(m2.outputs[0], m3.inputs[0]); L(m3.outputs[0], rad.inputs["Radius"])
    L(rad.outputs["Curve"], mat.inputs["Geometry"]); L(mat.outputs["Geometry"], gout.inputs[0])
    return ng

def make_hair(coll, rig, cap_V, material):
    V, E, W = build_hair_strands(cap_V, 700 if FAST else 2600, 900 if FAST else 3600)
    me = bpy.data.meshes.new("HairStrands"); me.from_pydata(to_b(V).tolist(), E, []); me.update()
    ob = bpy.data.objects.new("HairGuides", me); coll.objects.link(ob)
    groups = {}
    for i, d in enumerate(W):
        for nm, w in d.items(): groups.setdefault((nm, w), []).append(i)
    for (nm, w), idx in groups.items():
        (ob.vertex_groups.get(nm) or ob.vertex_groups.new(name=nm)).add(idx, w, "REPLACE")
    bind(ob, rig, subsurf=0); ob.hide_render = True; ob.display_type = "BOUNDS"
    # a real Curves object renders as hair; its geometry comes from the skinned guides every frame
    hair = bpy.data.objects.new("Hair", bpy.data.hair_curves.new("Hair")); coll.objects.link(hair); hair.parent = rig
    hair.modifiers.new("Strands", "NODES").node_group = hair_nodes(material, ob)
    log(f"Hair: {len(V)} points in {len(V) - len(E)} strands")
    return hair

# ---------------------------------------------------------------------------------------
# 8. MATERIALS (Principled BSDF; work in Cycles and EEVEE)
# ---------------------------------------------------------------------------------------
def new_mat(name):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True                     # Blender < 5: node trees are opt-in
    nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.nodes.new("ShaderNodeOutputMaterial")
def node(nt, kind, props=None, inputs=None):
    n = nt.nodes.new(kind)
    for k, v in (props or {}).items(): setattr(n, k, v)
    for k, v in (inputs or {}).items():
        if k in n.inputs: n.inputs[k].default_value = v
    return n
def mth(nt, op, a, b=None, c=None):
    """Math node with sockets or constants as operands; returns its output socket."""
    n = nt.nodes.new("ShaderNodeMath"); n.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: nt.links.new(v, n.inputs[i])
    return n.outputs[0]
def mixc(nt, fac, a, b):
    """Colour mix (factor / A / B may be sockets or constants); returns the result socket."""
    n = nt.nodes.new("ShaderNodeMix"); n.data_type = "RGBA"
    ins = {s.identifier: s for s in n.inputs}
    for key, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
        if isinstance(v, (int, float, tuple)): ins[key].default_value = v
        else: nt.links.new(v, ins[key])
    return next(s for s in n.outputs if s.identifier == "Result_Color")
def attr(nt, name): return node(nt, "ShaderNodeAttribute", dict(attribute_name=name))   # outputs: 0 colour, 1 vector, 2 factor

def face_texture(res=1024):
    """Painted facial detail (eyes, lashes, brows, lips) as an RGBA image, front-projected onto the head."""
    v, u = np.mgrid[0:res, 0:res]
    x = (u + 0.5) / res * 0.2 - 0.1; y = 1.5 + (v + 0.5) / res * 0.2; ax = np.abs(x)
    rgb = np.broadcast_to(np.array([0.72, 0.52, 0.42]), (res, res, 3)).copy(); alpha = np.zeros((res, res))
    def paint(color, a):
        nonlocal rgb, alpha
        a = sat(a); rgb = rgb * (1 - a[..., None]) + np.asarray(color, float) * a[..., None]; alpha = alpha + a * (1 - alpha)
    ex = ax - 0.031; ey = y - 1.619 - 0.07 * ex                                   # almond eye, outer corner lifted
    paint((0.45, 0.28, 0.22), 0.26 * sat(1.0 - np.hypot(ex / 0.020, (y - 1.6265) / 0.0115)) ** 0.7)            # eyeshadow
    d = np.hypot(ex / 0.0135, ey / np.where(ey > 0, 0.0064, 0.0050)) - 1.0
    eye = sat(-d / 0.10)
    paint(np.array([0.88, 0.85, 0.82]) * (1 - 0.30 * sat(1 + d * 1.6))[..., None], eye)                          # sclera
    di = np.hypot(ex + 0.0008, ey - 0.0004); th = np.arctan2(ey - 0.0004, ex + 0.0008)
    iris = np.array([0.20, 0.105, 0.05]) + np.array([0.20, 0.11, 0.05]) * (sat(1 - np.abs(di - 0.0036) / 0.0016) * (0.7 + 0.3 * np.sin(th * 46)))[..., None]
    paint(iris * (1 - 0.6 * sat((di - 0.0046) / 0.001))[..., None], eye * sat((0.0058 - di) / 0.0005))        # iris + limbal ring
    paint((0.01, 0.01, 0.01), eye * sat((0.0023 - di) / 0.0004))                                               # pupil
    paint((1.0, 1.0, 1.0), 0.9 * eye * sat((0.0008 - np.hypot(ex - 0.0016, ey - 0.0022)) / 0.0003))            # catch-light
    paint((0.035, 0.025, 0.02), 0.92 * sat((0.20 - np.abs(d + 0.02)) / 0.10) * (ey > -0.0006) * sat((0.0165 - np.abs(ex)) / 0.002))   # upper lash line
    paint((0.10, 0.06, 0.05), 0.35 * sat((0.10 - np.abs(d)) / 0.06) * (ey < 0))                                # lower lash line
    by = y - (1.6405 - 13.0 * (ax - 0.034) ** 2 + 0.09 * (ax - 0.034))
    thick = 0.0034 * (1 - 0.6 * sstep(0.034, 0.056, ax))
    paint((0.10, 0.065, 0.05), sat((thick - np.abs(by)) / 0.0012) * sstep(0.009, 0.015, ax) * (1 - sstep(0.052, 0.058, ax))
          * (0.86 + 0.14 * np.sin(ax * 5200 + y * 9000)))                                                      # brows
    seam = 1.5598 - 6.0 * ax ** 2
    yu = seam + 0.0086 * np.sqrt(sat(1 - (ax / 0.0245) ** 2)) - 0.0017 * np.exp(-(ax / 0.0042) ** 2)
    yl = seam - 0.0100 * np.sqrt(sat(1 - (ax / 0.0215) ** 2))
    lip = sat(np.minimum(yu - y, y - yl) / 0.0011) * (ax < 0.0245)
    shade = 0.88 + 0.22 * sat(1 - np.hypot(ax / 0.012, (y - 1.5545) / 0.0045))
    paint(np.array([0.64, 0.285, 0.29]) * shade[..., None], lip * 0.92)                                        # lips
    paint((0.22, 0.07, 0.08), 0.85 * sat((0.00055 - np.abs(y - seam)) / 0.0003) * (ax < 0.0232))               # mouth seam
    paint((0.20, 0.09, 0.07), 0.55 * sat(1 - np.hypot((ax - 0.0078) / 0.0042, (y - 1.5832) / 0.0021)) ** 0.6)  # nostrils
    paint((0.80, 0.42, 0.36), 0.15 * np.exp(-(((ax - 0.047) / 0.016) ** 2 + ((y - 1.588) / 0.014) ** 2)))     # blush
    img = bpy.data.images.new("FaceDetail", res, res, alpha=True)
    img.pixels.foreach_set(np.concatenate([rgb, alpha[..., None]], 2).astype(np.float32).ravel()); img.pack()
    return img

def make_materials():
    M = {}; link = lambda nt, a, b: nt.links.new(a, b)
    # ---- skin: warm olive, subsurface scattering, sweat-sheen coat, pore bump, painted face detail ----
    m, nt, out = new_mat("Skin"); rest = attr(nt, "rest")
    tone = node(nt, "ShaderNodeTexNoise", inputs={"Scale": 34.0, "Detail": 3.0}); link(nt, rest.outputs[1], tone.inputs["Vector"])
    base = mixc(nt, tone.outputs[0], (0.43, 0.240, 0.150, 1), (0.53, 0.305, 0.195, 1))
    img = node(nt, "ShaderNodeTexImage", dict(image=face_texture(), extension="CLIP"))
    link(nt, node(nt, "ShaderNodeUVMap", dict(uv_map="face_uv")).outputs[0], img.inputs["Vector"])
    col = mixc(nt, mth(nt, "MULTIPLY", img.outputs["Alpha"], attr(nt, "face").outputs[2]), base, img.outputs["Color"])
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", inputs={"Roughness": 0.43, "Subsurface Weight": 1.0, "Subsurface Radius": (1.0, 0.36, 0.18),
                "Subsurface Scale": 0.011, "Coat Weight": 0.06, "Coat Roughness": 0.28, "IOR": 1.40})
    pores = node(nt, "ShaderNodeTexNoise", inputs={"Scale": 1500.0, "Detail": 2.0}); link(nt, rest.outputs[1], pores.inputs["Vector"])
    bump = node(nt, "ShaderNodeBump", inputs={"Strength": 0.10, "Distance": 0.0004}); link(nt, pores.outputs[0], bump.inputs["Height"])
    link(nt, col, bsdf.inputs["Base Color"]); link(nt, bump.outputs[0], bsdf.inputs["Normal"]); link(nt, bsdf.outputs[0], out.inputs["Surface"])
    M["skin"] = m
    # ---- dress: rose-pink rib-knit (164 wales around the body), fabric sheen, pattern cut by alpha ----
    m, nt, out = new_mat("RibKnit"); rest = attr(nt, "rest")
    xyz = node(nt, "ShaderNodeSeparateXYZ"); link(nt, rest.outputs[1], xyz.inputs[0])
    ang = mth(nt, "ARCTAN2", xyz.outputs[0], mth(nt, "ADD", xyz.outputs[2], 0.012))
    rib = mth(nt, "SQRT", mth(nt, "MULTIPLY_ADD", mth(nt, "COSINE", mth(nt, "MULTIPLY", ang, 26.101 * math.tau)), 0.5, 0.5))
    wr = node(nt, "ShaderNodeTexNoise", inputs={"Scale": 9.0, "Detail": 2.0}); link(nt, rest.outputs[1], wr.inputs["Vector"])
    height = mth(nt, "ADD", rib, mth(nt, "MULTIPLY", wr.outputs[0], 1.6))                 # ribs + soft stretch wrinkles
    bump = node(nt, "ShaderNodeBump", inputs={"Strength": 0.55, "Distance": 0.0007}); link(nt, height, bump.inputs["Height"])
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", inputs={"Roughness": 0.72, "Sheen Weight": 0.55, "Sheen Roughness": 0.45,
                "Sheen Tint": (1.0, 0.62, 0.74, 1), "Specular IOR Level": 0.3})
    link(nt, mixc(nt, rib, (0.50, 0.095, 0.215, 1), (0.72, 0.155, 0.325, 1)), bsdf.inputs["Base Color"])
    link(nt, bump.outputs[0], bsdf.inputs["Normal"])
    link(nt, mth(nt, "GREATER_THAN", attr(nt, "dress_mask").outputs[2], 0.0), bsdf.inputs["Alpha"])
    link(nt, bsdf.outputs[0], out.inputs["Surface"]); M["dress"] = m
    # ---- scalp shell under the strands ----
    m, nt, out = new_mat("ScalpHair")
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", inputs={"Base Color": (0.014, 0.009, 0.007, 1), "Roughness": 0.85, "Specular IOR Level": 0.15})
    link(nt, mth(nt, "GREATER_THAN", attr(nt, "hair_mask").outputs[2], 0.0), bsdf.inputs["Alpha"])
    link(nt, bsdf.outputs[0], out.inputs["Surface"]); M["cap"] = m
    # ---- strands ----
    m, nt, out = new_mat("HairStrand")
    hb = node(nt, "ShaderNodeBsdfHairPrincipled", dict(parametrization="MELANIN"), {"Melanin": 0.93, "Melanin Redness": 0.55, "Roughness": 0.27,
              "Radial Roughness": 0.42, "Coat": 0.15, "Random Color": 0.18, "Random Roughness": 0.25})
    link(nt, hb.outputs[0], out.inputs["Surface"]); M["hair"] = m
    # ---- physics heatmap (diagnostic collection) ----
    m, nt, out = new_mat("PhysicsHeatmap")
    em = node(nt, "ShaderNodeEmission", inputs={"Strength": 1.0}); link(nt, attr(nt, "jiggle_heat").outputs[0], em.inputs["Color"])
    link(nt, em.outputs[0], out.inputs["Surface"]); m.use_fake_user = True; M["heat"] = m
    return M

def flat_mat(name, color, rough=0.8, emit=0.0, metal=0.0):
    m, nt, out = new_mat(name)
    b = node(nt, "ShaderNodeBsdfPrincipled", inputs={"Base Color": (*color, 1), "Roughness": rough, "Metallic": metal,
             "Emission Color": (*color, 1), "Emission Strength": emit})
    nt.links.new(b.outputs[0], out.inputs["Surface"]); return m

# ---------------------------------------------------------------------------------------
# 9. GOLDEN-HOUR SET, CAMERAS, RENDER SETTINGS
# ---------------------------------------------------------------------------------------
def box(coll, name, size, loc, mat):
    sx, sy, sz = (v / 2 for v in size)
    V = [(x, y, z) for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)]
    F = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new(name, me); ob.location = loc; me.materials.append(mat); coll.objects.link(ob); return ob

def look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()

def build_set(scene):
    env = new_collection("Set"); rng = np.random.default_rng(3)
    SUN = Vector((0.80, 0.34, 0.17)).normalized()                       # low sun over the motel roofline, behind her left shoulder
    # --- world: physical sunset sky as ambient light; the key light is an explicit sun lamp ---
    world = bpy.data.worlds.new("GoldenHour"); scene.world = world
    if world.node_tree is None: world.use_nodes = True
    nt = world.node_tree; nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    for kind in ("MULTIPLE_SCATTERING", "NISHITA"):
        try: sky.sky_type = kind; break
        except TypeError: pass
    sky.sun_elevation = math.radians(4.0); sky.sun_rotation = math.atan2(SUN.x, SUN.y); sky.sun_disc = False
    for k, v in (("air_density", 1.4), ("aerosol_density", 3.0), ("dust_density", 3.0), ("ozone_density", 2.0)):
        if hasattr(sky, k): setattr(sky, k, v)
    bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 0.15
    nt.links.new(sky.outputs[0], bg.inputs["Color"]); nt.links.new(bg.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs["Surface"])
    def lamp(name, kind, loc, color, energy, **kw):
        d = bpy.data.lights.new(name, kind); d.color, d.energy = color, energy
        for k, v in kw.items(): setattr(d, k, v)
        ob = bpy.data.objects.new(name, d); ob.location = loc; env.objects.link(ob); return ob
    sun = lamp("Sun_GoldenHour", "SUN", SUN * 20 + Vector((0, 0, 1)), (1.0, 0.55, 0.26), 3.6, angle=math.radians(3.0)); look_at(sun, (0, 0, 1))
    look_at(lamp("Neon_Magenta", "AREA", (3.0, -1.8, 1.9), (1.0, 0.10, 0.45), 200, size=1.6), (0, 0, 1.1))
    look_at(lamp("Neon_Cyan", "AREA", (2.6, 2.3, 0.9), (0.06, 0.75, 1.0), 120, size=1.4), (0, 0, 1.0))
    look_at(lamp("Bounce_Warm", "AREA", (-2.6, -1.2, 1.9), (1.0, 0.74, 0.52), 140, size=2.6), (0, 0, 1.35))   # sunset bounce off the lot
    # --- ground: wet asphalt (puddle-like roughness breakup) with parking-bay lines ---
    m, gnt, out = new_mat("WetAsphalt")
    n1 = node(gnt, "ShaderNodeTexNoise", inputs={"Scale": 0.55, "Detail": 6.0}); n2 = node(gnt, "ShaderNodeTexNoise", inputs={"Scale": 90.0, "Detail": 2.0})
    b = node(gnt, "ShaderNodeBsdfPrincipled", inputs={"Specular IOR Level": 0.6})
    gnt.links.new(mixc(gnt, n2.outputs[0], (0.022, 0.019, 0.026, 1), (0.060, 0.052, 0.062, 1)), b.inputs["Base Color"])
    wet = mth(gnt, "MULTIPLY_ADD", n1.outputs[0], 5.0, -2.1); wet.node.use_clamp = True          # 0 = puddle, 1 = dry
    gnt.links.new(mth(gnt, "MULTIPLY_ADD", wet, 0.55, 0.10), b.inputs["Roughness"])
    bump = node(gnt, "ShaderNodeBump", inputs={"Strength": 0.25, "Distance": 0.003}); gnt.links.new(n2.outputs[0], bump.inputs["Height"])
    gnt.links.new(bump.outputs[0], b.inputs["Normal"]); gnt.links.new(b.outputs[0], out.inputs["Surface"])
    box(env, "Ground", (240, 240, 0.2), (0, 0, -0.1), m)
    line = flat_mat("ParkingLine", (0.62, 0.58, 0.52), 0.6)
    for k in range(-9, 10): box(env, f"Line.{k + 9:02d}", (4.6, 0.11, 0.004), (4.4, k * 2.7 + 0.9, 0.002), line)
    # --- motel with neon trim and extruded neon lettering ---
    wall, roof, door = flat_mat("MotelWall", (0.16, 0.36, 0.34), 0.85), flat_mat("MotelRoof", (0.03, 0.022, 0.035), 0.7), flat_mat("MotelDoor", (0.03, 0.20, 0.21), 0.5)
    glow = flat_mat("WindowGlow", (1.0, 0.62, 0.30), emit=4.0)
    neon_m, neon_c = flat_mat("NeonMagenta", (1.0, 0.07, 0.38), emit=22.0), flat_mat("NeonCyan", (0.05, 0.70, 1.0), emit=18.0)
    def motel(y0, length, text, sign_mat, wall_mat):
        X = 10.0
        box(env, f"{text}_Body", (6, length, 3.4), (X + 3, y0, 1.7), wall_mat); box(env, f"{text}_Roof", (6.9, length + 0.8, 0.22), (X + 2.75, y0, 3.51), roof)
        box(env, f"{text}_NeonA", (0.05, length + 0.8, 0.05), (X - 0.70, y0, 3.46), neon_m); box(env, f"{text}_NeonB", (0.05, length + 0.8, 0.05), (X - 0.70, y0, 3.24), neon_c)
        for k in range(int(length // 3.6)):
            y = y0 - length / 2 + 1.8 + k * 3.6
            box(env, f"{text}_Win.{k}", (0.05, 1.5, 1.1), (X - 0.03, y + 0.55, 1.75), glow); box(env, f"{text}_Door.{k}", (0.06, 0.95, 2.1), (X - 0.03, y - 1.0, 1.05), door)
        cu = bpy.data.curves.new(f"{text}_Sign", "FONT"); cu.body, cu.size, cu.extrude, cu.align_x, cu.align_y = text, 1.25, 0.04, "CENTER", "CENTER"
        cu.materials.append(sign_mat); ob = bpy.data.objects.new(f"{text}_Sign", cu); env.objects.link(ob)
        ob.matrix_world = Matrix.Translation((X - 0.75, y0, 4.55)) @ Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0))).to_4x4()
        box(env, f"{text}_SignBack", (0.06, len(text) * 0.95 + 0.6, 1.7), (X - 0.66, y0, 4.55), roof)
    motel(-7.0, 22, "MOTEL", neon_m, wall)
    motel(22.0, 15, "OPEN 24H", neon_c, flat_mat("DinerWall", (0.42, 0.14, 0.24), 0.85))
    # --- palms and a distant skyline as silhouettes against the sky ---
    trunk, leaf, dark = flat_mat("PalmTrunk", (0.035, 0.024, 0.018), 1.0), flat_mat("PalmLeaf", (0.012, 0.035, 0.018), 0.7), flat_mat("Skyline", (0.012, 0.008, 0.014), 1.0)
    for i, (x, y) in enumerate([(-4.6, 34), (-5.4, 17), (-4.2, 2.5), (-5.0, -14), (-4.4, -30), (6.6, 27), (7.2, 9), (6.4, -9), (7.0, -25), (-11, 25), (-12, -5), (-10.5, -36)]):
        Hh, lean = rng.uniform(6.2, 8.8), rng.uniform(-0.9, 0.9)
        cu = bpy.data.curves.new(f"PalmTrunk.{i:02d}", "CURVE"); cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", 0.15, 2
        sp = cu.splines.new("NURBS"); sp.points.add(3); sp.use_endpoint_u = True
        for p, co in zip(sp.points, [(0, 0, 0), (lean * 0.2, 0.1, Hh * 0.4), (lean * 0.65, 0, Hh * 0.75), (lean, 0, Hh)]): p.co = (*co, 1)
        cu.materials.append(trunk); ob = bpy.data.objects.new(cu.name, cu); ob.location = (x, y, 0); env.objects.link(ob)
        V, F = [], []
        for f in range(13):
            a, ln, up = f / 13 * math.tau + rng.uniform(0, 0.5), rng.uniform(2.3, 3.4), rng.uniform(0.25, 0.75)
            for k in range(8):
                t = k / 7; r = ln * t; z = ln * (up * t - 0.75 * t * t); w = 0.36 * math.sin(math.pi * (0.08 + 0.92 * t)); o = len(V)
                V += [(math.cos(a) * r - math.sin(a) * w, math.sin(a) * r + math.cos(a) * w, z - w * 0.25), (math.cos(a) * r + math.sin(a) * w, math.sin(a) * r - math.cos(a) * w, z - w * 0.25)]
                if k < 7: F.append((o, o + 1, o + 3, o + 2))
        me = bpy.data.meshes.new(f"PalmCrown.{i:02d}"); me.from_pydata(V, [], F); me.update(); me.materials.append(leaf)
        ob = bpy.data.objects.new(me.name, me); ob.location = (x + lean, y, Hh); env.objects.link(ob)
    for i in range(70):
        a = i / 70 * math.tau + rng.uniform(-0.03, 0.03); r = rng.uniform(95, 115); hgt = rng.uniform(4, 22) * (1.0 if rng.uniform() > 0.4 else 0.35)
        box(env, f"Skyline.{i:02d}", (rng.uniform(6, 14), rng.uniform(6, 14), hgt), (math.cos(a) * r, math.sin(a) * r, hgt / 2), dark)
    return env

def build_cameras(scene, rig):
    cams = new_collection("Cameras"); out = {}
    focus = bpy.data.objects.new("Focus_Head", None); focus.empty_display_size = 0.05; cams.objects.link(focus)
    focus.parent, focus.parent_type, focus.parent_bone = rig, "BONE", "head"
    def cam(name, loc, target, lens=50, ortho=None, fstop=None):
        d = bpy.data.cameras.new(name); d.lens = lens; d.clip_start, d.clip_end = 0.05, 600
        if ortho: d.type, d.ortho_scale = "ORTHO", ortho
        if fstop: d.dof.use_dof, d.dof.focus_object, d.dof.aperture_fstop = True, focus, fstop
        ob = bpy.data.objects.new(name, d); ob.location = loc; cams.objects.link(ob); look_at(ob, target); out[name] = ob
    cam("Cam_Portrait", (-1.95, 0.91, 1.36), (0.0, 0.0, 1.23), lens=85, fstop=2.2)         # hero still: 3/4 back, glance over the shoulder
    cam("Cam_Follow", (0.0, 3.60, 1.50), (0, 0, 0.98), lens=40, fstop=4.0)
    cam("Cam_Hip_ThreeQuarter", (-1.55, 1.95, 1.05), (0, 0, 0.92), lens=50, fstop=4.0)
    cam("Cam_Side_Profile", (4.4, 0.0, 1.0), (0, 0, 0.9), lens=50)
    cam("Cam_Hair_UpperBody", (-0.80, 1.20, 1.64), (0, 0.03, 1.43), lens=60, fstop=2.8)
    cam("Cam_Ortho_Front", (0, -6, 0.87), (0, 0, 0.87), ortho=2.05); cam("Cam_Ortho_Left", (6, 0, 0.87), (0, 0, 0.87), ortho=2.05)
    cam("Cam_Ortho_Back", (0, 6, 0.87), (0, 0, 0.87), ortho=2.05)
    return out

def setup_render(scene):
    r = scene.render; r.engine = "CYCLES"; r.resolution_x, r.resolution_y = (540, 675) if FAST else (1080, 1350); r.fps = FPS
    c = scene.cycles; c.samples = SAMPLES; c.use_denoising = True; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.03 if FAST else 0.015
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try: scene.view_settings.view_transform = "AgX"; scene.view_settings.look = look; break
        except TypeError: pass
    scene.view_settings.exposure = 0.0

# ---------------------------------------------------------------------------------------
# 10. BUILD
# ---------------------------------------------------------------------------------------
def set_action(rig, act):
    ad = rig.animation_data; ad.action = act
    if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])): ad.action_slot = act.slots[0]

def bake_all(rig):
    def gait(name, n, heel):
        def fn(t):
            ph = t * FPS / n; P = gait_pose(GAITS[name], ph, PHYS["sway"]); P["phase"], P["heel"] = ph, heel; return P
        return fn, n
    acts = {}
    for name, (fn, n) in (("Strut_Walk", gait("walk", 28, 1.0)), ("Athletic_Jog", gait("jog", 20, 1.5)), ("Idle_HipSway", (idle_pose, 132))):
        acts[name] = bake_action(rig, name, simulate(fn, n + 1, n * 3, n)); log(f"baked {name}: {n}-frame loop")
    acts["Quick_Turn_HairWhip"] = bake_action(rig, "Quick_Turn_HairWhip", simulate(turn_pose, 160, 45)); log("baked Quick_Turn_HairWhip: 160 frames")
    acts["Pose_Portrait"] = bake_action(rig, "Pose_Portrait", simulate(lambda t: portrait_pose(), 1, 120))
    return acts

def main():
    scene = bpy.context.scene
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)          # start from an empty file (also makes re-runs clean)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for block in (bpy.data.actions, bpy.data.node_groups, bpy.data.materials, bpy.data.images):
        for item in list(block): block.remove(item)
    try: bpy.data.orphans_purge(do_recursive=True)
    except Exception: pass
    scene.unit_settings.system = "METRIC"; scene.render.fps = FPS
    log(f"building at {VOXEL * 1000:.1f} mm voxels" + (" (fast mode)" if FAST else ""))
    layers = build_layers()
    char = new_collection("Character"); rig = make_armature(char); mats = make_materials()
    obs = {}
    for name, mat, sub in (("Body", "skin", 1), ("Dress", "dress", 1), ("HairCap", "cap", 0)):
        obs[name] = make_mesh(name, layers[name], char); obs[name].data.materials.append(mats[mat]); bind(obs[name], rig, sub)
    obs["Hair"] = make_hair(char, rig, layers["HairCap"]["V"], mats["hair"])
    # diagnostic twins: same meshes, heatmap material + wireframe overlay (hidden until needed)
    diag = new_collection("Diagnostic_PhysicsHeatmap")
    for name in ("Body", "Dress"):
        tw = bpy.data.objects.new(name + "_Heatmap", obs[name].data); diag.objects.link(tw); bind(tw, rig, 0)
        tw.material_slots[0].link = "OBJECT"; tw.material_slots[0].material = mats["heat"]; tw.show_wire = tw.show_all_edges = True
    diag.hide_viewport = diag.hide_render = True
    acts = bake_all(rig)
    build_set(scene); cams = build_cameras(scene, rig); setup_render(scene)
    if RENDER_TO:                                                    # hero still: portrait pose, 85 mm, shallow depth of field
        set_action(rig, acts["Pose_Portrait"]); scene.frame_set(1); scene.camera = cams["Cam_Portrait"]
        scene.render.filepath = RENDER_TO; log("rendering still..."); bpy.ops.render.render(write_still=True); log(f"wrote {RENDER_TO}")
    set_action(rig, acts["Strut_Walk"]); scene.frame_start, scene.frame_end = 1, 28; scene.frame_set(1)
    scene.camera = cams["Cam_Hip_ThreeQuarter"]
    if SAVE_TO:
        bpy.ops.wm.save_as_mainfile(filepath=SAVE_TO, compress=True); log(f"saved {SAVE_TO}")
    log("done")

if __name__ == "__main__":
    main()
