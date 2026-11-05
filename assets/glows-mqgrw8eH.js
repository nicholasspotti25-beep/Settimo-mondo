import{A as c}from"./atmosphere-TFGCByHh.js";import{a as h}from"./geo-DGKbUAf2.js";import{k as v,a as d,S as p,g as m,A as f,d as g,C as u,N as w,I as n,D as y}from"./three-CLajbzfP.js";const x={orb:0,beam:1,pool:2,glint:3,flame:4},A=`
attribute vec3 aCenter;
attribute vec4 aGlow;   // x: width, y: height, z: mode, w: phase
attribute vec4 aColor;  // rgb display-space, a: intensity
attribute float aOn;
varying vec2 vUv;
varying vec4 vCol;
varying float vMode;
varying float vPhase;
varying vec3 vAtmWorld;
varying float vNear;
void main() {
  vUv = position.xy + 0.5;
  float mode = aGlow.z;
  // camera inside the glow (pool underfoot, orb around a lantern held close): fade instead of filling the screen
  vNear = smoothstep(0.3, 0.95, distance(cameraPosition, aCenter) / max(mode > 1.5 && mode < 2.5 ? aGlow.x * 0.5 : aGlow.x, 0.4));
  vec3 c = aCenter;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp;
  if (mode > 1.5 && mode < 2.5) {
    wp = c + vec3(position.x * aGlow.x, 0.0, position.y * aGlow.x);
  } else if (mode > 0.5 && mode < 1.5) {
    vec3 toC = c - cameraPosition;
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), toC) + vec3(1e-5, 0.0, 0.0));
    wp = c + r * position.x * aGlow.x + vec3(0.0, (position.y + 0.5) * aGlow.y, 0.0);
  } else {
    float h = mode > 3.5 ? aGlow.y : aGlow.x;
    wp = c + camR * position.x * aGlow.x + camU * position.y * h;
    // pull toward the camera a little so a glow inside a lantern cage is not clipped by the cage
    wp += normalize(cameraPosition - c) * min(aGlow.x * 0.35, 0.6);
  }
  vCol = vec4(aColor.rgb, aColor.a * aOn);
  vMode = mode;
  vPhase = aGlow.w;
  vAtmWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  if (aOn < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`,b=`
uniform float uTime;
uniform float uNight;
uniform float uHazeK;
varying vec2 vUv;
varying vec4 vCol;
varying float vMode;
varying float vPhase;
varying vec3 vAtmWorld;
varying float vNear;
${h}
void main() {
  vec2 p = vUv - 0.5;
  float a = 0.0;
  if (vMode < 0.5) {
    float r2 = dot(p, p) * 4.0;
    a = exp(-r2 * 3.2) * 0.55 + exp(-r2 * 16.0) * 0.7;
    a *= 0.92 + 0.08 * sin(uTime * 1.7 + vPhase);
  } else if (vMode < 1.5) {
    float x = p.x * 2.0;
    float y = vUv.y;
    a = exp(-x * x * 6.0) * pow(1.0 - y, 1.7) * smoothstep(0.0, 0.06, y);
    a *= 0.78 + 0.22 * sin(y * 11.0 - uTime * 1.1 + vPhase);
  } else if (vMode < 2.5) {
    float r2 = dot(p, p) * 4.0;
    a = exp(-r2 * 2.6) * (1.0 - smoothstep(0.75, 1.0, r2));
  } else if (vMode < 3.5) {
    vec2 q = abs(p) * 2.0;
    float star = exp(-q.x * 26.0) * exp(-q.y * 3.2) + exp(-q.y * 26.0) * exp(-q.x * 3.2);
    float core = exp(-dot(q, q) * 34.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 2.3 + vPhase);
    a = (star * 0.75 * (0.4 + 0.6 * pulse) + core * (0.7 + 0.3 * pulse) + exp(-dot(q, q) * 5.0) * 0.22 * pulse);
  } else {
    vec2 q = p * 2.0;
    q.y += 0.2;
    float fl = 0.8 + 0.12 * sin(uTime * 17.0 + vPhase) + 0.08 * sin(uTime * 29.0 + vPhase * 2.3);
    a = (exp(-(q.x * q.x * 10.0 + q.y * q.y * 4.0)) * 0.95 + exp(-dot(q, q) * 1.8) * 0.3) * fl;
  }
  vec3 ray = vAtmWorld - cameraPosition;
  float dist = length(ray);
  float fa = smFogAmount(ray, dist);
  float nb = mix(1.0, 1.65, uNight);
  vec3 col = vCol.rgb * (a * vCol.a * nb * uHazeK * vNear * (1.0 - fa * 0.85));
  if (max(col.r, max(col.g, col.b)) < 0.003) discard;
  gl_FragColor = vec4(min(col, vec3(1.6)), 1.0);
}
`,l=new u;class P{mesh;specs=[];geo=new v;mat;onAttr=null;target=new Float32Array(0);dirty=!1;constructor(e="glows"){const t=new d(1,1);this.geo.index=t.index,this.geo.setAttribute("position",t.attributes.position),this.mat=new p({vertexShader:A,fragmentShader:b,uniforms:{...c,uFogScale:{value:1}},transparent:!0,depthWrite:!1,blending:f,toneMapped:!1,side:m}),this.mesh=new g(this.geo,this.mat),this.mesh.name=e,this.mesh.frustumCulled=!1,this.mesh.renderOrder=3}add(e){return this.specs.push(e),this.specs.length-1}get count(){return this.specs.length}finish(){const e=this.specs.length,t=new Float32Array(e*3),s=new Float32Array(e*4),r=new Float32Array(e*4),a=new Float32Array(e);this.target=new Float32Array(e),this.specs.forEach((o,i)=>{t.set(o.pos,i*3),s.set([o.size,o.height??o.size,x[o.mode],o.phase??i*1.37],i*4),l.setStyle(o.color,w),r.set([l.r,l.g,l.b,o.intensity],i*4),a[i]=o.on??1,this.target[i]=a[i]}),this.geo.setAttribute("aCenter",new n(t,3)),this.geo.setAttribute("aGlow",new n(s,4)),this.geo.setAttribute("aColor",new n(r,4)),this.onAttr=new n(a,1),this.onAttr.setUsage(y),this.geo.setAttribute("aOn",this.onAttr),this.geo.instanceCount=e,this.mesh.visible=e>0}setOn(e,t,s=!1){e<0||e>=this.target.length||(this.target[e]!==t&&(this.target[e]=t,this.dirty=!0),s&&this.onAttr&&(this.onAttr.array[e]=t,this.onAttr.needsUpdate=!0))}update(e){if(!this.dirty||!this.onAttr)return;const t=this.onAttr.array,s=Math.min(1,e*1.4);let r=!1;for(let a=0;a<t.length;a++){const o=this.target[a]-t[a];o!==0&&(Math.abs(o)<.01?t[a]=this.target[a]:(t[a]+=Math.sign(o)*Math.max(Math.abs(o)*s*2,e*.5)*(Math.abs(o)>.001?1:0),(o>0&&t[a]>this.target[a]||o<0&&t[a]<this.target[a])&&(t[a]=this.target[a]),r=!0))}this.onAttr.needsUpdate=!0,this.dirty=r}dispose(){this.geo.dispose(),this.mat.dispose()}}export{P as G};
