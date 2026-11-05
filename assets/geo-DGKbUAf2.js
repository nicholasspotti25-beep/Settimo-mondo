import{g as ve,L as E,M as K,T as _e}from"./content-yjFLUdIn.js";import{A as _}from"./atmosphere-TFGCByHh.js";import{a2 as Me,a3 as Se,H as Ae,T as ce,a5 as le,h as U,am as Fe,d as ae,G as te,e as oe,q as I,m as Q,C as V,an as Y,a8 as Z,g as J,z as Pe,A as ze,a7 as ee,E as We,Q as Ce,V as be,M as we,y as Ge,af as He,ao as Be,o as Te,p as Ne,c as De,aa as Re,j as Ee,ab as Le,a as Ie,ae as $e,i as Oe}from"./three-CLajbzfP.js";const ue={grass:{a:"#4f6a34",b:"#7d8a46"},meadow:{a:"#5d7a3a",b:"#a49a52"},dry_grass:{a:"#8a8048",b:"#b8a462"},moss:{a:"#2f4426",b:"#4c5f2e"},forest_floor:{a:"#2a2a1e",b:"#3f3a26"},rock:{a:"#6e6a66",b:"#8f8a80"},dark_rock:{a:"#3a3838",b:"#55504c"},cliff:{a:"#5e5a58",b:"#7c7670"},snow:{a:"#dfe6f0",b:"#f6f8fc"},ash:{a:"#3e3a3a",b:"#5a5452",speck:["#ff7a2a",.35]},embers:{a:"#2a1c1a",b:"#46302a",speck:["#ff6a1a",.9]},sand:{a:"#b6a07a",b:"#cdbb94"},marble:{a:"#e6e2da",b:"#f6f3ee",vein:["#a8a2b4",.6],pave:.6},black_marble:{a:"#1a181e",b:"#2c2832",vein:["#7a6a8a",.5],pave:.6},mud:{a:"#3a3224",b:"#4e4430"},ice:{a:"#9cc4e0",b:"#cfe6f6",vein:["#ffffff",.5]},obsidian:{a:"#141218",b:"#2a2430",vein:["#ff5a2a",.35]},bone:{a:"#c8bca0",b:"#e2d8c0"},soil:{a:"#4a3c2c",b:"#6a5638"},bark:{a:"#4a3a2a",b:"#6a5236"},void:{a:"#0c0a14",b:"#1c1630",speck:["#c8b8ff",.6]},cloud:{a:"#e8e4f0",b:"#ffffff"},stone:{a:"#8c8478",b:"#a89e90",pave:1},pale_stone:{a:"#b8b0a2",b:"#d0c8ba",pave:1},wood:{a:"#5a4430",b:"#7a5c3c",pave:.4},basalt:{a:"#262428",b:"#3a3638",speck:["#ff4a1a",.12]},pine:{a:"#3a3226",b:"#4e4430"},path:{a:"#6a5a44",b:"#857258"},wet:{a:"#2a2a20",b:"#34342a"},flowers:{a:"#4c7a3a",b:"#8a9a4a"},red_rock:{a:"#5a2a24",b:"#7a3a2c",speck:["#ff5a1a",.08]}},qe={type:"meadow",density:.9,height:[.35,.8],base:"#3c5426",tip:"#b8b066"},de={castle:{layers:{base:"pale_stone",alt:"stone",steep:"rock",high:"pale_stone",path:"pale_stone"},alt:.3,pathWidth:4,atmos:{cloud:.3,rays:1,wind:.2,fogMult:.6,cover:["#5a6a40",.25]},particles:["dust"],backdrop:"none"},summit:{layers:{base:"rock",alt:"snow",steep:"cliff",high:"snow",path:"stone"},high:[10,22],steep:[.28,.5],alt:.3,pathWidth:6,cover:{type:"short",density:.38,height:[.15,.4],base:"#5a5a38",tip:"#d2c088",maxSlope:.28},atmos:{cloud:.55,rays:1,wind:1.6,cover:["#e8eef6",.25]},particles:["dust"],backdrop:"drop",backdropHeight:260,dressing:[{kind:"pebbles",count:90,scale:[.6,1.4],avoid_path:4}]},plains:{layers:{base:"meadow",alt:"dry_grass",steep:"rock",high:"grass",path:"path"},steep:[.3,.55],alt:.6,pathWidth:3.2,cover:{...qe,density:1,height:[.5,1.15],inArenas:!0},atmos:{cloud:.6,rays:.8,wind:1.4,cover:["#6a7a3a",.35]},particles:["pollen","fireflies"],backdrop:"hills",backdropHeight:40,rim:[{kind:"twilight_tree",count:70,scale:[1,1.8]},{kind:"cliff_rock",count:30,scale:[3,7]}],dressing:[{kind:"flower_glow",count:120,scale:[.6,1.1],avoid_path:2},{kind:"pebbles",count:60,scale:[.6,1.2],avoid_path:3}]},dark_forest:{layers:{base:"forest_floor",alt:"moss",steep:"dark_rock",high:"moss",path:"soil"},steep:[.3,.6],alt:.7,pathWidth:3,cover:{type:"moss",density:.7,height:[.2,.55],base:"#1c2a16",tip:"#4e6a34",maxSlope:.45},atmos:{cloud:.4,rays:.6,wind:.35,heightFog:[.012,0,.12],canopy:.55,cover:["#3e5a2a",.65]},particles:["fireflies","mist","spores"],backdrop:"hills",backdropHeight:30,rim:[{kind:"giant_tree",count:60,scale:[.9,1.6]}],dressing:[{kind:"mushroom_glow",count:160,scale:[.5,1.2],avoid_path:2},{kind:"fern",count:220,scale:[.7,1.4],avoid_path:2.5}]},swamp:{layers:{base:"mud",alt:"moss",steep:"dark_rock",high:"grass",path:"wood",wet:"wet"},steep:[.3,.6],alt:.5,pathWidth:3,cover:{type:"reeds",density:.6,height:[.6,1.6],base:"#2c3420",tip:"#8a8a52",maxSlope:.4},atmos:{cloud:.7,rays:.4,wind:.6,heightFog:[.05,-.6,.22],cover:["#4a5a30",.5]},particles:["fireflies","mist"],water:"swamp",backdrop:"water",rim:[{kind:"dead_tree",count:50,scale:[1,1.8]},{kind:"willow_tree",count:40,scale:[1,1.6]}],dressing:[{kind:"lily_pad",count:160,scale:[.6,1.4]},{kind:"reeds",count:200,scale:[.8,1.4]}]},river_souls:{layers:{base:"dark_rock",alt:"mud",steep:"dark_rock",high:"rock",path:"wood",wet:"wet"},steep:[.3,.6],alt:.4,pathWidth:3,cover:{type:"short",density:.25,height:[.2,.5],base:"#1e2420",tip:"#4a5a52",maxSlope:.4},atmos:{cloud:.5,rays:.5,wind:.5,heightFog:[.04,-.6,.2],cover:["#2a3a3a",.3]},particles:["souls","mist"],water:"souls",backdrop:"water",rim:[{kind:"dead_tree",count:40,scale:[1,1.6]},{kind:"cliff_rock",count:30,scale:[3,8]}],dressing:[{kind:"soul_light",count:60,scale:[.6,1.2]},{kind:"reeds",count:120,scale:[.8,1.3]}]},hell_gate:{layers:{base:"basalt",alt:"bone",steep:"dark_rock",high:"red_rock",path:"bone"},alt:.35,pathWidth:4,atmos:{cloud:.7,rays:.3,wind:.6,cover:["#3a2a2a",.3]},particles:["embers","ash"],backdrop:"cliffs",backdropHeight:90,rim:[{kind:"cliff_rock",count:60,scale:[4,10]}],dressing:[{kind:"bones",count:80,scale:[.6,1.3],avoid_path:3},{kind:"pebbles",count:60,scale:[.8,1.4],avoid_path:3}]},pyres:{layers:{base:"embers",alt:"ash",steep:"basalt",high:"red_rock",path:"ash"},alt:.5,pathWidth:4,atmos:{cloud:.8,rays:.4,wind:.8,cover:["#2a2020",.3]},particles:["embers","ash"],backdrop:"hills",backdropHeight:50,rim:[{kind:"obsidian_rock",count:50,scale:[3,8]}],dressing:[{kind:"ember_vent",count:40,scale:[.8,1.6],avoid_path:4}]},tempest:{layers:{base:"dark_rock",alt:"basalt",steep:"cliff",high:"rock",path:"stone"},alt:.5,pathWidth:4,atmos:{cloud:1,rays:.1,wind:2.2,cover:["#2a2a34",.2]},particles:["rain","lightning"],backdrop:"cliffs",backdropHeight:70,rim:[{kind:"cliff_rock",count:50,scale:[4,9]}],dressing:[{kind:"pebbles",count:80,scale:[.6,1.6],avoid_path:3}]},cocytus:{layers:{base:"ice",alt:"snow",steep:"dark_rock",high:"snow",path:"ice"},alt:.4,pathWidth:4,atmos:{cloud:.5,rays:.5,wind:.8,cover:["#e0eef8",.6]},particles:["snow"],water:"ice",backdrop:"cliffs",backdropHeight:60,rim:[{kind:"ice_spike",count:60,scale:[3,8]}],dressing:[{kind:"pebbles",count:60,scale:[.6,1.4],avoid_path:3}]},forges:{layers:{base:"basalt",alt:"obsidian",steep:"dark_rock",high:"red_rock",path:"stone"},alt:.4,pathWidth:4,atmos:{cloud:.2,rays:.2,wind:.3,fogMult:1.2,cover:["#2a1a18",.2]},particles:["embers"],water:"lava",backdrop:"cliffs",backdropHeight:80,rim:[{kind:"obsidian_rock",count:50,scale:[4,9]}],dressing:[{kind:"ember_vent",count:30,scale:[.8,1.4],avoid_path:4},{kind:"pebbles",count:60,scale:[.6,1.4],avoid_path:3}]},cathedral:{layers:{base:"black_marble",alt:"obsidian",steep:"dark_rock",high:"black_marble",path:"black_marble"},alt:.3,pathWidth:5,atmos:{cloud:.4,rays:.6,wind:.2,cover:["#2a2430",.2]},particles:["ash","embers"],water:"lava",backdrop:"cliffs",backdropHeight:80,dressing:[{kind:"sword_grave",count:60,scale:[.6,1],avoid_path:4}]},volcano:{layers:{base:"basalt",alt:"snow",steep:"red_rock",high:"snow",path:"ash"},high:[20,40],alt:.35,pathWidth:4,atmos:{cloud:.7,rays:.6,wind:1.4,cover:["#e8eef6",.4]},particles:["embers","snow"],backdrop:"peaks",backdropHeight:160,dressing:[{kind:"ember_vent",count:30,scale:[.8,1.6],avoid_path:4},{kind:"pebbles",count:60,scale:[.8,1.6],avoid_path:3}]},snow_peaks:{layers:{base:"snow",alt:"rock",steep:"cliff",high:"snow",path:"snow"},alt:.25,pathWidth:3.5,cover:{type:"snowgrass",density:.25,height:[.15,.35],base:"#6a7a6a",tip:"#cfd8d0",maxSlope:.3},atmos:{cloud:.6,rays:1,wind:1.8,cover:["#f4f8ff",.85]},particles:["snow"],backdrop:"peaks",backdropHeight:200,rim:[{kind:"fir",count:60,scale:[1.2,2]}],dressing:[{kind:"pebbles",count:80,scale:[.8,1.6],avoid_path:3}]},ice_castle:{layers:{base:"ice",alt:"snow",steep:"ice",high:"snow",path:"ice"},alt:.5,pathWidth:5,atmos:{cloud:.5,rays:.8,wind:1,cover:["#f4f8ff",.85]},particles:["snow"],backdrop:"peaks",backdropHeight:160,dressing:[{kind:"pebbles",count:50,scale:[.6,1.4],avoid_path:3}]},taiga:{layers:{base:"pine",alt:"snow",steep:"rock",high:"snow",path:"soil"},alt:.45,pathWidth:3,cover:{type:"short",density:.4,height:[.2,.5],base:"#2a3424",tip:"#6a7a52",maxSlope:.4},atmos:{cloud:.5,rays:.7,wind:.6,canopy:.25,cover:["#eef4fa",.55]},particles:["snow"],backdrop:"hills",backdropHeight:50,rim:[{kind:"pine",count:120,scale:[1.2,2.2]}],dressing:[{kind:"fern",count:100,scale:[.7,1.2],avoid_path:3}]},ship_river:{layers:{base:"wood",alt:"wood",steep:"wood",high:"wood",path:"wood"},atmos:{cloud:.5,rays:.7,wind:1.2},particles:["snow"],water:"river",backdrop:"none"},river_port:{layers:{base:"stone",alt:"snow",steep:"rock",high:"snow",path:"wood"},alt:.4,pathWidth:4,atmos:{cloud:.5,rays:.7,wind:1,cover:["#eef4fa",.5]},particles:["snow"],water:"river",backdrop:"hills",backdropHeight:40,rim:[{kind:"pine",count:60,scale:[1.2,2]}]},ship_sea:{layers:{base:"wood",alt:"wood",steep:"wood",high:"wood",path:"wood"},atmos:{cloud:.6,rays:.4,wind:1.6},particles:["rain"],water:"sea",backdrop:"none"},giant_garden:{layers:{base:"flowers",alt:"grass",steep:"soil",high:"grass",path:"soil"},alt:.6,pathWidth:3,cover:{type:"flowers",density:.9,height:[.6,1.6],base:"#2e6a2a",tip:"#a8e05a",inArenas:!1},atmos:{cloud:.4,rays:1,wind:.5,cover:["#5aa03a",.4]},particles:["pollen"],backdrop:"hills",backdropHeight:60,rim:[{kind:"giant_grass",count:80,scale:[1,2]},{kind:"giant_flower",count:30,scale:[1,2]}],dressing:[{kind:"flower_glow",count:120,scale:[.6,1.2],avoid_path:3}]},greenhouse:{layers:{base:"soil",alt:"flowers",steep:"rock",high:"grass",path:"stone"},alt:.5,pathWidth:4,cover:{type:"flowers",density:.7,height:[.4,1.2],base:"#2e6a2a",tip:"#ff9ad0"},atmos:{cloud:.2,rays:1,wind:.2,fogMult:.7,cover:["#5aa03a",.5]},particles:["pollen"],backdrop:"none"},bone_plateau:{layers:{base:"sand",alt:"bone",steep:"rock",high:"rock",path:"bone"},alt:.4,pathWidth:4,cover:{type:"short",density:.3,height:[.2,.5],base:"#7a6a42",tip:"#d8c88a",maxSlope:.3},atmos:{cloud:.5,rays:1,wind:1.4,cover:["#e0d8c0",.2]},particles:["dust"],backdrop:"hills",backdropHeight:60,rim:[{kind:"cliff_rock",count:40,scale:[4,9]}],dressing:[{kind:"bones",count:40,scale:[.8,1.6],avoid_path:4}]},nests:{layers:{base:"rock",alt:"bone",steep:"cliff",high:"rock",path:"stone"},alt:.3,pathWidth:3,atmos:{cloud:.6,rays:1,wind:1.8,cover:["#c8c0a8",.3]},particles:["dust"],backdrop:"cliffs",backdropHeight:120,rim:[{kind:"cliff_rock",count:60,scale:[5,12]}]},observatory:{layers:{base:"marble",alt:"grass",steep:"rock",high:"marble",path:"marble"},alt:.4,pathWidth:4,atmos:{cloud:.3,rays:.8,wind:.8},particles:["stars"],backdrop:"peaks",backdropHeight:120},mirror_lake:{layers:{base:"grass",alt:"rock",steep:"cliff",high:"rock",path:"stone"},alt:.4,pathWidth:3,cover:{type:"short",density:.4,height:[.2,.5],base:"#2e4a3a",tip:"#8ab0a0",maxSlope:.35},atmos:{cloud:.4,rays:.8,wind:.3,heightFog:[.03,-.6,.15]},particles:["mist","fireflies"],water:"mirror",backdrop:"peaks",backdropHeight:140},wind_cliffs:{layers:{base:"rock",alt:"grass",steep:"cliff",high:"rock",path:"stone"},alt:.4,pathWidth:3,cover:{type:"short",density:.5,height:[.2,.5],base:"#4a5a3a",tip:"#c0c08a",maxSlope:.3},atmos:{cloud:.7,rays:1,wind:2.4},particles:["dust"],backdrop:"drop"},world_tree:{layers:{base:"bark",alt:"moss",steep:"bark",high:"moss",path:"bark"},alt:.5,pathWidth:4,atmos:{cloud:.8,rays:1,wind:1,cover:["#4a6a3a",.6]},particles:["pollen"],water:"cloud",backdrop:"drop"},hollow_root:{layers:{base:"bark",alt:"moss",steep:"bark",high:"bark",path:"bark"},alt:.4,pathWidth:4,atmos:{cloud:.2,rays:.3,wind:.2,fogMult:1.4,cover:["#3a5a2a",.5]},particles:["spores","fireflies"],backdrop:"none"},upturned_plain:{layers:{base:"void",alt:"meadow",steep:"dark_rock",high:"void",path:"ash"},alt:.5,pathWidth:4,atmos:{cloud:.6,rays:.3,wind:.6},particles:["ash","stars"],backdrop:"hills",backdropHeight:-60},ash_desert:{layers:{base:"ash",alt:"sand",steep:"dark_rock",high:"ash",path:"ash"},alt:.4,pathWidth:4,atmos:{cloud:.6,rays:.4,wind:1.6},particles:["ash"],backdrop:"hills",backdropHeight:40,dressing:[{kind:"void_shard",count:40,scale:[.6,1.6],avoid_path:5}]},upturned_palace:{layers:{base:"black_marble",alt:"void",steep:"dark_rock",high:"black_marble",path:"black_marble"},alt:.3,pathWidth:5,atmos:{cloud:.3,rays:.3,wind:.2},particles:["stars","ash"],backdrop:"none"},celestial:{layers:{base:"marble",alt:"grass",steep:"marble",high:"cloud",path:"marble"},alt:.35,pathWidth:5,cover:{type:"flowers",density:.4,height:[.2,.5],base:"#4a8a4a",tip:"#fff0c0",maxSlope:.3},atmos:{cloud:.3,rays:1.2,wind:.6,fogMult:.7},particles:["pollen"],water:"cloud",backdrop:"none",dressing:[{kind:"cloud_puff",count:30,scale:[1,2.4],avoid_path:6}]},collapse:{layers:{base:"void",alt:"marble",steep:"dark_rock",high:"void",path:"marble"},alt:.4,pathWidth:5,atmos:{cloud:.2,rays:.2,wind:.4},particles:["stars"],backdrop:"none",dressing:[{kind:"void_shard",count:60,scale:[1,3]}]},cloud_sea:{layers:{base:"cloud",alt:"marble",steep:"rock",high:"cloud",path:"marble"},alt:.3,pathWidth:4,atmos:{cloud:.5,rays:1.3,wind:.5,fogMult:.5},particles:["pollen"],water:"cloud",backdrop:"none"}};function Ue(a){return de[a]??de.plains}const se=`
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
`,re=`
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
`,ne=`
#ifdef USE_FOG
{
  vec3 smRay = vAtmWorld - cameraPosition;
  float smDist = length(smRay);
  vec3 smDir = smRay / max(smDist, 1e-3);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, smFogColor(smDir), smFogAmount(smRay, smDist));
}
#endif
`,ie=`
#ifdef USE_FOG
vAtmWorld = (mvPosition.xyz * mat3(viewMatrix)) + cameraPosition;
#endif
`,da=`
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
  // broad glow + a band hugging the horizon under the glow (no focused core: the sun never shows before the ending)
  float dv = e - uGlowDir.y * 0.55;
  col += uGlow * (pow(g, 6.0) * 0.30 + exp(-(1.0 - s) * 16.0 - dv * dv * 70.0) * 0.12);
  return col * uSkyBright;
}
`;function Ve(a,e,o){const[s,t]=a.size,r=e.quality,i=r==="low"?2.6:r==="medium"?1.9:1.5,u=r==="low"?160:288,p=Math.max(i,Math.max(s,t)/u),n=Math.max(2,Math.ceil(s/p)+1),m=Math.max(2,Math.ceil(t/p)+1),y=s/(n-1),h=t/(m-1),d=-s/2,l=-t/2,c=new Float32Array(n*m),M=new Float32Array(n*m),z=new Float32Array(n*m),B=new Float32Array(n*m),D=e.content.altarsInZone(a.id).map(v=>v.pos),R=ve(a,D),W=a.arenas.map(v=>e.content.arena(v).gate.pos);for(let v=0;v<m;v++){const g=l+v*h;for(let S=0;S<n;S++){const C=d+S*y,P=v*n+S;c[P]=o.heightAt(C,g),M[P]=a.path.length>1?o.distToPath(C,g):99;let A=0;for(const x of R){const F=Math.hypot(C-x.x,g-x.z);A=Math.max(A,1-E(x.r*.5,x.r,F))}for(const x of W)A=Math.max(A,1-E(2.5,6,Math.hypot(C-x[0],g-x[2])));z[P]=A,B[P]=o.arenaAt(C,g)?1:0}}const b=new Float32Array(n*m*3);for(let v=0;v<m;v++)for(let g=0;g<n;g++){const S=c[v*n+Math.max(0,g-1)],C=c[v*n+Math.min(n-1,g+1)],P=c[Math.max(0,v-1)*n+g],A=c[Math.min(m-1,v+1)*n+g],x=(C-S)/((Math.min(n-1,g+1)-Math.max(0,g-1))*y),F=(A-P)/((Math.min(m-1,v+1)-Math.max(0,v-1))*h),G=Math.hypot(x,1,F),T=(v*n+g)*3;b[T]=-x/G,b[T+1]=1/G,b[T+2]=-F/G}const f=new Uint16Array(n*m*4),k=Fe.toHalfFloat;for(let v=0;v<n*m;v++)f[v*4]=k(c[v]),f[v*4+1]=k(Math.min(64,M[v])),f[v*4+2]=k(z[v]),f[v*4+3]=k(B[v]);const w=new Me(f,n,m,Se,Ae);return w.magFilter=ce,w.minFilter=ce,w.wrapS=le,w.wrapT=le,w.needsUpdate=!0,{def:a,terrain:o,x0:d,z0:l,step:y,nx:n,nz:m,h:c,nrm:b,pathD:M,tex:w,uniforms:{uField:{value:w},uFieldMin:{value:new U(d,l)},uFieldSize:{value:new U(s,t)}},water:o.waterLevel(),height(v,g){const S=Math.min(n-1.001,Math.max(0,(v-d)/y)),C=Math.min(m-1.001,Math.max(0,(g-l)/h)),P=Math.floor(S),A=Math.floor(C),x=S-P,F=C-A,G=c[A*n+P],T=c[A*n+P+1],j=c[(A+1)*n+P],q=c[(A+1)*n+P+1];return(G*(1-x)+T*x)*(1-F)+(j*(1-x)+q*x)*F},dispose(){w.dispose()}}}const je=`
uniform sampler2D uField;
uniform vec2 uFieldMin;
uniform vec2 uFieldSize;
vec4 smField(vec2 xz) {
  vec2 uv = (xz - uFieldMin) / uFieldSize;
  return texture2D(uField, clamp(uv, 0.0, 1.0));
}
float smInField(vec2 xz) {
  vec2 uv = (xz - uFieldMin) / uFieldSize;
  return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
}
`;function N(a){return{value:new V(a)}}function Ze(a,e,o){const s=a.layers,t=c=>ue[c]??ue.rock,r=t(s.base),i=t(s.alt),u=t(s.steep),p=t(s.high),n=t(s.path),m=t(s.wet??"wet"),y=[r,i,u,p,n].find(c=>c.speck)?.speck,h=[r,i,p,n].find(c=>c.vein)?.vein,d={uBaseA:N(r.a),uBaseB:N(r.b),uAltA:N(i.a),uAltB:N(i.b),uSteepA:N(u.a),uSteepB:N(u.b),uHighA:N(p.a),uHighB:N(p.b),uPathA:N(n.a),uPathB:N(n.b),uWetA:N(m.a),uHigh:{value:new U(...a.high??[1e4,10010])},uSteep:{value:new U(...a.steep??[.28,.5])},uAltAmt:{value:a.alt??.5},uPathW:{value:a.pathWidth??3},uPave:{value:new Q(r.pave??0,n.pave??0,i.pave??0,0)},uWater:{value:e.water??-1e4},uSpeck:{value:new Q(...y?[...new V(y[0]).toArray(),y[1]]:[0,0,0,0])},uVein:{value:new Q(...h?[...new V(h[0]).toArray(),h[1]]:[0,0,0,0])},uFogScale:{value:1}},l=new Y({color:16777215});return l.name="world-terrain",l.onBeforeCompile=c=>{Object.assign(c.uniforms,d,e.uniforms,{uTime:_.uTime,uFogColor:_.uFogColor,uFogGlow:_.uFogGlow,uGlowDir:_.uGlowDir,uFogParams:_.uFogParams,uFogMax:_.uFogMax,uGlowBoost:_.uGlowBoost,uCoverColor:_.uCoverColor}),c.vertexShader=c.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vTWPos;
varying vec3 vTWNrm;
varying vec3 vAtmWorld;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vTWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTWNrm = normalize(mat3(modelMatrix) * objectNormal);`).replace("#include <fog_vertex>",`#include <fog_vertex>
${ie}`),c.fragmentShader=c.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vTWPos;
varying vec3 vTWNrm;
varying vec3 vAtmWorld;
uniform float uTime;
uniform vec3 uBaseA; uniform vec3 uBaseB; uniform vec3 uAltA; uniform vec3 uAltB;
uniform vec3 uSteepA; uniform vec3 uSteepB; uniform vec3 uHighA; uniform vec3 uHighB;
uniform vec3 uPathA; uniform vec3 uPathB; uniform vec3 uWetA;
uniform vec2 uHigh; uniform vec2 uSteep; uniform float uAltAmt; uniform float uPathW; uniform vec4 uPave;
uniform float uWater; uniform vec4 uSpeck; uniform vec4 uVein; uniform float uGlowBoost; uniform vec3 uCoverColor;
${se}
${je}
${re}
float smPave(vec2 p, float sc) {
  vec2 q = p / sc;
  q.x += floor(q.y) * 0.5;
  vec2 f = fract(q);
  vec2 id = floor(q);
  float edge = min(min(f.x, 1.0 - f.x) * 1.4, min(f.y, 1.0 - f.y));
  return smoothstep(0.0, 0.07, edge) * (0.82 + smHash12(id) * 0.3);
}
`).replace("#include <color_fragment>",`#include <color_fragment>
vec3 tEmis = vec3(0.0);
{
  vec3 P = vTWPos;
  vec3 N = normalize(vTWNrm);
  float n1 = smFbm2x3(P.xz * 0.035);
  float n2 = smNoise2(P.xz * 0.31);
  float n3 = smNoise2(P.xz * 1.9);
  float slope = 1.0 - N.y;
  vec3 base = mix(uBaseA, uBaseB, smoothstep(0.2, 0.8, n2 * 0.55 + n1 * 0.45));
  base *= mix(1.0, smPave(P.xz, 1.6), uPave.x);
  vec3 alt = mix(uAltA, uAltB, n3);
  alt *= mix(1.0, smPave(P.xz, 1.2), uPave.z);
  float wAlt = smoothstep(0.42, 0.68, n1 + (n2 - 0.5) * 0.35) * uAltAmt;
  vec3 col = mix(base, alt, wAlt);
  float wSteep = smoothstep(uSteep.x, uSteep.y, slope + (n2 - 0.5) * 0.12);
  float strata = smNoise2(vec2(P.y * 1.3, (P.x + P.z) * 0.12));
  vec3 rock = mix(uSteepA, uSteepB, smoothstep(0.25, 0.75, n3 * 0.45 + strata * 0.55));
  col = mix(col, rock, wSteep);
  float wHigh = smoothstep(uHigh.x, uHigh.y, P.y + (n1 - 0.5) * 6.0) * (1.0 - wSteep * 0.65);
  col = mix(col, mix(uHighA, uHighB, n3), wHigh);
  vec4 fld = smField(P.xz);
  float inF = smInField(P.xz);
  float pd = mix(64.0, fld.g, inF);
  float wPath = 1.0 - smoothstep(uPathW * 0.4, uPathW, pd + (n2 - 0.5) * uPathW * 0.7);
  vec3 pathC = mix(uPathA, uPathB, n3) * mix(1.0, smPave(P.xz, 1.1), uPave.y);
  col = mix(col, pathC, wPath * (1.0 - wSteep * 0.6));
  float wWet = 1.0 - smoothstep(0.0, 0.9, P.y - uWater);
  col = mix(col, uWetA, wWet * 0.8);
  if (uVein.w > 0.0) {
    float v = abs(smNoise2(P.xz * 0.25 + vec2(smNoise2(P.xz * 0.9) * 2.0)) - 0.5);
    col = mix(col, uVein.rgb, smoothstep(0.035, 0.0, v) * uVein.w * (1.0 - wSteep));
  }
  col *= 0.86 + n3 * 0.22 + n2 * 0.06;
  diffuseColor.rgb = col;
  if (uSpeck.w > 0.0) {
    vec2 cell = floor(P.xz * 2.5);
    float h = smHash12(cell);
    float pulse = 0.55 + 0.45 * sin(uTime * (1.0 + h * 2.0) + h * 40.0);
    tEmis = uSpeck.rgb * step(1.0 - uSpeck.w * 0.035, h) * pulse * uGlowBoost * (1.0 - wSteep);
  }
}
`).replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
totalEmissiveRadiance += tEmis;`).replace("#include <fog_fragment>",ne),o!=="low"&&(c.fragmentShader=c.fragmentShader.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
{
  vec2 pp = vTWPos.xz * 0.9;
  float a0 = smNoise2(pp), ax = smNoise2(pp + vec2(0.35, 0.0)), az = smNoise2(pp + vec2(0.0, 0.35));
  vec3 gw = vec3(a0 - ax, 0.0, a0 - az) * 0.9;
  normal = normalize(normal + mat3(viewMatrix) * gw);
}`))},l.customProgramCacheKey=()=>`sm-terrain-${o==="low"?0:1}`,l}function Xe(a,e,o,s,t,r,i){const u=[];for(let b=e;b<s;b+=r)u.push(b);u.push(s);const p=[];for(let b=o;b<t;b+=r)p.push(b);p.push(t);const n=u.length,m=p.length,y=n*m+2*(n+m),h=a.def.size[1]/(a.nz-1),d=new Float32Array(y*3),l=new Float32Array(y*3),c=[];let M=0;const z=(b,f,k)=>{const w=f*a.nx+b;return d[M*3]=a.x0+b*a.step,d[M*3+1]=a.h[w]+k,d[M*3+2]=a.z0+f*h,l[M*3]=a.nrm[w*3],l[M*3+1]=a.nrm[w*3+1],l[M*3+2]=a.nrm[w*3+2],M++};for(let b=0;b<m;b++)for(let f=0;f<n;f++)z(u[f],p[b],0);for(let b=0;b<m-1;b++)for(let f=0;f<n-1;f++){const k=b*n+f,w=k+1,H=k+n,v=H+1;c.push(k,H,w,w,H,v)}const B=(b,f)=>{const k=b.map(([w,H])=>z(w,H,-6));for(let w=0;w<f.length-1;w++)c.push(f[w],k[w],f[w+1],f[w+1],k[w],k[w+1]),c.push(f[w],f[w+1],k[w],f[w+1],k[w+1],k[w])},D=b=>B(u.map(f=>[f,p[b]]),u.map((f,k)=>b*n+k)),R=b=>B(p.map(f=>[u[b],f]),p.map((f,k)=>k*n+b));D(0),D(m-1),R(0),R(n-1);const W=new oe;return W.setAttribute("position",new I(d.subarray(0,M*3),3)),W.setAttribute("normal",new I(l.subarray(0,M*3),3)),W.setIndex(c),W.computeBoundingSphere(),W.computeBoundingBox(),W}class pa{constructor(e,o,s){this.field=e,this.ctx=s,this.group.name="terrain",this.material=Ze(o,e,s.quality);const t=s.quality==="low"?72:s.quality==="medium"?64:56,r=e,i=s.quality==="low"?[1,2,4]:[1,2,4];this.lodDist=s.quality==="low"?[60,140]:s.quality==="medium"?[90,200]:[120,260];for(let u=0;u<r.nz-1;u+=t)for(let p=0;p<r.nx-1;p+=t){const n=Math.min(r.nx-1,p+t),m=Math.min(r.nz-1,u+t),y=i.map(c=>Xe(r,p,u,n,m,c)),h=new ae(y[0],this.material);h.receiveShadow=!0,h.castShadow=!1,h.matrixAutoUpdate=!1;const d=y[0].boundingBox,l={mesh:h,lods:y,cx:(d.min.x+d.max.x)/2,cz:(d.min.z+d.max.z)/2,half:Math.max(d.max.x-d.min.x,d.max.z-d.min.z)/2,lod:0};this.chunks.push(l),this.group.add(h)}}field;ctx;group=new te;chunks=[];material;lodDist;update(e){const o=e.position;for(const s of this.chunks){const t=Math.max(0,Math.abs(o.x-s.cx)-s.half),r=Math.max(0,Math.abs(o.z-s.cz)-s.half),i=Math.hypot(t,r),u=i<this.lodDist[0]?0:i<this.lodDist[1]?1:2;u!==s.lod&&(s.lod=u,s.mesh.geometry=s.lods[u])}}dispose(){for(const e of this.chunks)for(const o of e.lods)o.dispose();this.material.dispose(),this.group.clear()}}function ye(a,e,o,s,t,r){const i=K(s/180,t/180,4,99);switch(a){case"hills":return e*E(0,260,o)*(.65+.7*i);case"cliffs":{const u=1-Math.abs(K(s/90,t/90,3,41));return e*E(0,70,o)*(.6+.6*u)+e*.6*E(120,500,o)*i}case"peaks":{const u=1-Math.abs(K(s/220,t/220,4,17));return e*E(30,520,o)*(.3+u*u*1.4)}case"drop":return-e*E(0,140,o)*(.85+.3*i);case"water":return r!==null?-2.5*E(0,30,o)-2*E(30,200,o):0;default:return 0}}function ma(a,e,o,s,t){const r=new te;if(r.name="backdrop",e==="none")return r;const[i,u]=a.def.size,p=t==="low"?420:640,n=t==="low"?20:13,m=-i/2-p,y=-u/2-p,h=Math.ceil((i+2*p)/n)+1,d=Math.ceil((u+2*p)/n)+1,l=a.terrain,c=a.water,M=new Float32Array(h*d),z=new Uint8Array(h*d);for(let W=0;W<d;W++)for(let b=0;b<h;b++){const f=m+b*n,k=y+W*n,w=l.edgeDistance(f,k),H=W*h+b;if(w>n*1.5){z[H]=1,M[H]=a.height(f,k)-1.5;continue}const v=w>=0?a.height(f,k):l.heightAt(f,k),g=Math.max(0,-w);let S=v+ye(e,o,g,f,k,c);w>0&&(S-=.6+n*.22),e==="water"&&c!==null&&g>10&&(S=Math.min(S,c-1.2-g*.004)),M[H]=S}const B=t==="low"?2:3,D=Math.ceil((h-1)/B),R=Math.ceil((d-1)/B);for(let W=0;W<B;W++)for(let b=0;b<B;b++){const f=b*D,k=W*R,w=Math.min(h-1,f+D),H=Math.min(d-1,k+R);if(w<=f||H<=k)continue;const v=w-f+1,g=H-k+1,S=new Float32Array(v*g*3);for(let x=0;x<g;x++)for(let F=0;F<v;F++){const G=(k+x)*h+(f+F),T=(x*v+F)*3;S[T]=m+(f+F)*n,S[T+1]=M[G],S[T+2]=y+(k+x)*n}const C=[];for(let x=0;x<g-1;x++)for(let F=0;F<v-1;F++){const G=(k+x)*h+(f+F);if(z[G]&&z[G+1]&&z[G+h]&&z[G+h+1])continue;const T=x*v+F,j=T+1,q=T+v,xe=q+1;C.push(T,q,j,j,q,xe)}if(!C.length)continue;const P=new oe;P.setAttribute("position",new I(S,3)),P.setIndex(C),P.computeVertexNormals(),P.computeBoundingSphere();const A=new ae(P,s);A.receiveShadow=!1,A.matrixAutoUpdate=!1,r.add(A)}return r}function Ye(a,e,o,s,t){const r=a.terrain,i=r.edgeDistance(s,t);return i>=0?a.height(s,t):r.heightAt(s,t)+ye(e,o,-i,s,t,a.water)}let L=null;function Ke(a,e){if(L&&L.def.id===a.id&&L.ctx.quality===e.quality)return L;L?.field.dispose();const o=a.arenas.map(y=>e.content.arena(y)),s=new _e(a,o),t=Ve(a,e,s),r=Ue(a.biome),i=e.content.altarsInZone(a.id).map(y=>y.pos),u=a.terrain.type??"heightfield",p=u==="interior"||u==="deck"||u==="void"?"none":r.backdrop??"hills",n=r.backdropHeight??40,m={def:a,ctx:e,terrain:s,field:t,biome:r,avoid:ve(a,i),backdrop:p,backdropHeight:n,heightAt:(y,h)=>Ye(t,p,n,y,h),density:e.quality==="low"?.45:e.quality==="medium"?.75:1};return L=m,m}function ha(a,e){return Ke(a,e)}function fa(){L?.field.dispose(),L=null}const Qe=`
attribute vec4 aParams;
varying vec4 vParams;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vAtmWorld;
uniform float uTime;
uniform vec4 uWind;
${se}
`,Je=`
vParams = aParams;
{
  float wk = aParams.x;
  if (wk > 0.0) {
    vec3 org = vec3(0.0);
    #ifdef USE_INSTANCING
      org = instanceMatrix[3].xyz;
    #endif
    org = (modelMatrix * vec4(org, 1.0)).xyz;
    float ph = dot(org.xz, vec2(0.13, 0.17));
    float gust = 0.6 + 0.8 * smNoise2(org.xz * 0.02 - uWind.xy * uTime * 0.35) * (0.5 + uWind.w);
    float sway = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * gust * uWind.z;
    vec3 wl = vec3(uWind.x, 0.0, uWind.y) * (sway + gust * 0.6 * uWind.z);
    #ifdef USE_INSTANCING
      wl = (vec4(wl, 0.0) * instanceMatrix).xyz / max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 1e-4);
    #endif
    float flutter = sin(uTime * 7.0 + position.x * 3.0 + position.y * 2.0 + ph) * 0.03 * step(0.5, wk);
    transformed += (wl * 0.06 + vec3(flutter)) * wk * wk;
  }
}
`,ea=`
{
  vec4 wp = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3(instanceMatrix) * wn;
  #endif
  wp = modelMatrix * wp;
  vWPos = wp.xyz;
  vWNrm = normalize(mat3(modelMatrix) * wn);
}
`,aa=`
varying vec4 vParams;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vAtmWorld;
uniform float uTime;
uniform float uDetail;
uniform float uBreakup;
uniform float uRim;
uniform float uCoverMul;
uniform vec3 uCoverColor;
uniform float uCoverAmount;
uniform float uGlowBoost;
uniform vec3 uLightColor;
${se}
${re}
`,ta=`
{
  vec3 q = vWPos * uDetail;
  float n1 = smNoise3(q);
  float n2 = smNoise3(q * 3.7 + 11.0);
  float br = (n1 * 0.65 + n2 * 0.35) - 0.5;
  diffuseColor.rgb *= 1.0 + br * uBreakup;
  diffuseColor.rgb *= mix(1.0, vParams.w, 1.0);
  float up = clamp(vWNrm.y, 0.0, 1.0);
  float cov = smoothstep(0.55, 0.85, up + (n1 - 0.5) * 0.5) * vParams.z * uCoverMul * uCoverAmount;
  diffuseColor.rgb = mix(diffuseColor.rgb, uCoverColor * (0.85 + n2 * 0.3), clamp(cov, 0.0, 1.0));
}
`,oa=`
{
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    vec3 ec = vColor.rgb;
  #else
    vec3 ec = diffuse;
  #endif
  totalEmissiveRadiance += ec * vParams.y * uGlowBoost * 2.2;
}
`,sa=`
{
  vec3 vd = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.0);
  vec3 wv = normalize(vWPos - cameraPosition);
  float facing = 0.35 + 0.65 * max(dot(wv, uGlowDir), 0.0);
  outgoingLight += fres * facing * uRim * uLightColor * (diffuseColor.rgb * 0.6 + 0.08);
}
`,pe=new Map;function O(a,e,o){const s={uDetail:{value:e.detail??.35},uBreakup:{value:e.breakup??.35},uRim:{value:e.rim??.35},uCoverMul:{value:e.cover??1},uFogScale:{value:e.fogScale??1}};a.onBeforeCompile=t=>{Object.assign(t.uniforms,{uTime:_.uTime,uWind:_.uWind,uFogColor:_.uFogColor,uFogGlow:_.uFogGlow,uGlowDir:_.uGlowDir,uFogParams:_.uFogParams,uFogMax:_.uFogMax,uCoverColor:_.uCoverColor,uCoverAmount:_.uCoverAmount,uGlowBoost:_.uGlowBoost,uLightColor:_.uLightColor,...s}),t.vertexShader=t.vertexShader.replace("#include <common>",`#include <common>
${Qe}`).replace("#include <begin_vertex>",`#include <begin_vertex>
${Je}
${ea}`).replace("#include <fog_vertex>",`#include <fog_vertex>
${ie}`),t.fragmentShader=t.fragmentShader.replace("#include <common>",`#include <common>
${aa}`).replace("#include <color_fragment>",`#include <color_fragment>
${ta}`).replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
${oa}`).replace("#include <fog_fragment>",ne),o&&(t.fragmentShader=t.fragmentShader.replace("#include <opaque_fragment>",`${sa}
#include <opaque_fragment>`))},a.customProgramCacheKey=()=>`sm-world-${o?1:0}`}function ra(a,e={}){const o=`${a}:${JSON.stringify(e)}`,s=pe.get(o);if(s)return s;let t;switch(a){case"gloss":t=new ee({vertexColors:!0,roughness:.32,metalness:.05,side:e.side??Z,flatShading:e.flat??!1}),O(t,{breakup:.18,...e},!0);break;case"metal":t=new ee({vertexColors:!0,roughness:.42,metalness:.75,side:e.side??Z,flatShading:e.flat??!1}),O(t,{breakup:.25,...e},!0);break;case"glass":t=new ee({vertexColors:!0,roughness:.08,metalness:.1,transparent:!0,opacity:e.opacity??.35,depthWrite:!1,side:e.side??J}),O(t,{breakup:.05,...e},!0);break;case"glow":{const r=new Pe({vertexColors:!0,transparent:!0,opacity:e.opacity??1,blending:ze,depthWrite:!1,side:e.side??J,toneMapped:!1});r.fog=!1,t=r;break}case"foliage":t=new Y({vertexColors:!0,side:e.side??J,flatShading:e.flat??!1}),O(t,{breakup:.3,detail:.6,...e},!0);break;case"impostor":t=new Y({vertexColors:!0,side:e.side??Z,flatShading:e.flat??!1}),O(t,{breakup:.25,detail:.02,fogScale:.22,rim:.2,...e},!1);break;default:t=new Y({vertexColors:!0,side:e.side??Z,flatShading:e.flat??!1}),O(t,e,!0);break}return t.name=`world-${a}`,pe.set(o,t),t}function ga(a,e=1){const o=a.onBeforeCompile,s={value:e};a.onBeforeCompile=(r,i)=>{o.call(a,r,i),Object.assign(r.uniforms,{uFogColor:_.uFogColor,uFogGlow:_.uFogGlow,uGlowDir:_.uGlowDir,uFogParams:_.uFogParams,uFogMax:_.uFogMax,uFogScale:s}),r.vertexShader.includes("vAtmWorld")||(r.vertexShader=r.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vAtmWorld;`).replace("#include <fog_vertex>",`#include <fog_vertex>
${ie}`),r.fragmentShader=r.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vAtmWorld;
${re}`).replace("#include <fog_fragment>",ne))};const t=a.customProgramCacheKey.bind(a);return a.customProgramCacheKey=()=>`${t()}-smfog`,a.needsUpdate=!0,a}function va(a=1){return{uTime:_.uTime,uFogColor:_.uFogColor,uFogGlow:_.uFogGlow,uGlowDir:_.uGlowDir,uFogParams:_.uFogParams,uFogMax:_.uFogMax,uFogScale:{value:a}}}const $=new V,X=new V;new we;const me=new Ce,he=new We,na=new be,fe=new be;function ba(a=[0,0,0],e=[0,0,0],o=1){he.set(e[0],e[1],e[2],"YXZ"),me.setFromEuler(he);const s=typeof o=="number"?fe.set(o,o,o):fe.set(o[0],o[1],o[2]);return new we().compose(na.set(a[0],a[1],a[2]),me,s)}function ke(a,e,o,s){let t=Math.imul(Math.floor(a*73.1)|0,374761393)^Math.imul(Math.floor(e*91.7)|0,668265263)^Math.imul(Math.floor(o*57.3)|0,2147483647)^Math.imul(s|0,1274126177);return t=Math.imul(t^t>>>13,1274126177),((t^t>>>16)>>>0)/4294967295}function ge(a,e,o,s){const t=Math.floor(a),r=Math.floor(e),i=Math.floor(o),u=a-t,p=e-r,n=o-i,m=u*u*(3-2*u),y=p*p*(3-2*p),h=n*n*(3-2*n),d=(c,M,z)=>ke(t+c+.5,r+M+.5,i+z+.5,s),l=(c,M,z)=>c+(M-c)*z;return l(l(l(d(0,0,0),d(1,0,0),m),l(d(0,1,0),d(1,1,0),m),y),l(l(d(0,0,1),d(1,0,1),m),l(d(0,1,1),d(1,1,1),m),y),h)*2-1}function ia(a,e,o=1.3,s=1,t=0){const r=a.attributes.position;for(let i=0;i<r.count;i++){const u=r.getX(i),p=r.getY(i),n=r.getZ(i),m=ge(u*o,p*o,n*o,s)*.7+ge(u*o*2.3,p*o*2.3,n*o*2.3,s+7)*.3,y=Math.hypot(u,p,n)||1,h=1+m*e;let d=p*h;t>0&&d<0&&(d*=1-t),r.setXYZ(i,u/y*y*h,d,n/y*y*h)}return r.needsUpdate=!0,a.computeVertexNormals(),a}function wa(a,e=1,o=.28,s=1,t=0){const r=new Ge(a,e);return ia(r,o,1.4/Math.max(.2,a),s,t)}function ya(a,e,o){return new Ee(a,e,o)}function ka(a,e,o,s=8,t=!1){const r=new Te(a,e,o,s,1,t);return r.translate(0,o/2,0),r}function xa(a,e,o=8){const s=new Ne(a,e,o);return s.translate(0,e/2,0),s}function _a(a,e=10,o=8){return new De(a,e,o)}function Ma(a,e=12){return new Re(a.map(([o,s])=>new U(o,s)),e)}function Sa(a,e,o=6,s=16,t=Math.PI*2){return new Le(a,e,o,s,t)}function Aa(a,e){return new Ie(a,e)}function Fa(a,e,o=0,s=8){const t=new $e(a,{depth:e,bevelEnabled:o>0,bevelSize:o,bevelThickness:o,bevelSegments:1,curveSegments:s});return t.translate(0,0,-e/2),t.deleteAttribute("uv"),t}function Pa(a,e,o,s,t=!1){const r=new Oe;r.moveTo(-a/2,0),r.lineTo(-o/2,0);const i=s-o/2;return r.lineTo(-o/2,i),t?(r.quadraticCurveTo(-o/2,s,0,s+o*.15),r.quadraticCurveTo(o/2,s,o/2,i)):r.absarc(0,i,o/2,Math.PI,0,!0),r.lineTo(o/2,0),r.lineTo(a/2,0),r.lineTo(a/2,e),r.lineTo(-a/2,e),r.lineTo(-a/2,0),r}function za(a,e,o=6,s,t){const r=new He(a),i=s??Math.max(2,a.length*3),u=new Be(r,i,e,o,!1);if(t!==void 0&&t!==e){const p=u.attributes.position,n=o+1;for(let m=0;m<=i;m++){const y=m/i,h=r.getPointAt(y),d=(e+(t-e)*y)/e;for(let l=0;l<n;l++){const c=m*n+l;p.setXYZ(c,h.x+(p.getX(c)-h.x)*d,h.y+(p.getY(c)-h.y)*d,h.z+(p.getZ(c)-h.z)*d)}}u.computeVertexNormals()}return u}class Wa{slots=new Map;seed=1;constructor(e=1){this.seed=e}add(e,o,s,t){t&&e.applyMatrix4(t);const r=this.slots.get(o)??[];return r.push({geo:e,o:s}),this.slots.set(o,r),this}merge(e,o){for(const[s,t]of e.slots)for(const r of t)this.add(o?r.geo.clone().applyMatrix4(o):r.geo.clone(),s,r.o);return this}get empty(){return this.slots.size===0}geometries(){const e=new Map;for(const[o,s]of this.slots){let t=0,r=0;for(const l of s)t+=l.geo.attributes.position.count,r+=l.geo.index?l.geo.index.count:l.geo.attributes.position.count;const i=new Float32Array(t*3),u=new Float32Array(t*3),p=new Float32Array(t*3),n=new Float32Array(t*4),m=t>65535?new Uint32Array(r):new Uint16Array(r);let y=0,h=0;for(const l of s){const c=l.geo;c.attributes.normal||c.computeVertexNormals();const M=c.attributes.position,z=c.attributes.normal;c.computeBoundingBox();const B=c.boundingBox,D=l.o.yRange?l.o.yRange[0]:B.min.y,R=l.o.yRange?l.o.yRange[1]:B.max.y,W=Math.max(1e-4,R-D),b=Array.isArray(l.o.color);$.set(b?l.o.color[0]:l.o.color),X.set(b?l.o.color[1]:l.o.color);const f=l.o.wind??0,k=l.o.emissive??0,w=l.o.cover??(o==="matte"||o==="foliage"?1:0),H=l.o.aoBottom??1,v=l.o.jitter??.06;for(let g=0;g<M.count;g++){const S=M.getX(g),C=M.getY(g),P=M.getZ(g),A=Math.min(1,Math.max(0,(C-D)/W)),x=(y+g)*3;i[x]=S,i[x+1]=C,i[x+2]=P,u[x]=z.getX(g),u[x+1]=z.getY(g),u[x+2]=z.getZ(g);const F=1+(ke(S,C,P,this.seed)-.5)*2*v;p[x]=($.r+(X.r-$.r)*A)*F,p[x+1]=($.g+(X.g-$.g)*A)*F,p[x+2]=($.b+(X.b-$.b)*A)*F;const G=(y+g)*4;n[G]=l.o.windByHeight?f*A:f,n[G+1]=k,n[G+2]=w,n[G+3]=H+(1-H)*Math.min(1,A*1.6)}if(c.index){const g=c.index;for(let S=0;S<g.count;S++)m[h+S]=g.getX(S)+y;h+=g.count}else{for(let g=0;g<M.count;g++)m[h+g]=y+g;h+=M.count}y+=M.count,c.dispose()}const d=new oe;d.setAttribute("position",new I(i,3)),d.setAttribute("normal",new I(u,3)),d.setAttribute("color",new I(p,3)),d.setAttribute("aParams",new I(n,4)),d.setIndex(new I(m,1)),d.computeBoundingSphere(),d.computeBoundingBox(),e.set(o,d)}return this.slots.clear(),e}build(e={},o=!0){const s=new te;for(const[t,r]of this.geometries()){const i=new ae(r,ra(t,e[t]??{}));i.castShadow=o&&t!=="glow"&&t!=="glass",i.receiveShadow=t!=="glow",i.name=t,(t==="glow"||t==="glass")&&(i.renderOrder=2),s.add(i)}return s}}function Ca(a){a.traverse(e=>{const o=e;o.geometry&&o.geometry.dispose()})}class Ga{s;constructor(e){this.s=e>>>0||1}next(){let e=this.s=this.s+1831565813>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,o){return e+(o-e)*this.next()}int(e,o){return e+Math.floor(this.next()*(o-e+1))}pick(e){return e[Math.floor(this.next()*e.length)]}sign(){return this.next()<.5?-1:1}}export{se as G,Wa as P,Ga as R,pa as T,re as a,da as b,ka as c,ia as d,ya as e,Fa as f,wa as g,za as h,Pa as i,Ca as j,xa as k,Ma as l,ba as m,je as n,Ue as o,Ke as p,va as q,fa as r,_a as s,Sa as t,ga as u,ne as v,ra as w,ma as x,Aa as y,ha as z};
