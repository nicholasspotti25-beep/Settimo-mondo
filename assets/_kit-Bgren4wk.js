import{f as O,l as A,m as h,c as x,d as R,e as T,s as W,k as N,g as K}from"./geo-DGKbUAf2.js";import{P as zt,R as It}from"./geo-DGKbUAf2.js";import{A as P}from"./atmosphere-TFGCByHh.js";import{i as k,as as V,e as j,F as C,S as q,g as G,A as X,C as Z,d as J,V as Q,h as D}from"./three-CLajbzfP.js";import"./content-yjFLUdIn.js";const U=["#8f897e","#dcd4c3"],Y=["#93897a","#e2d6bf"],$=["#6a645a","#b9b1a0"],B=["#3e3a34","#6e675c"],tt=["#141218","#3a3640"],ct=["#2c2e3c","#4c5068"],rt=["#24221f","#4a4640"],lt=["#2e2219","#5a4432"],ht=["#1e1a14","#463a2a"],ut=["#3a2a18","#7a5a32"],ft=["#4a3e2a","#7a6a4a"];function dt(o){switch(o){case"stone":return $;case"dark":return B;case"marble":return["#b8b2aa","#f0ece4"];case"black":return tt;case"warm":return Y;default:return U}}function mt(o,e,i){const n=o.params?.[e];return typeof n=="number"?n:i}function vt(o,e,i){const n=o.params?.[e];return typeof n=="string"?n:i}function gt(o,e,i){const n=o.params?.[e];return typeof n=="boolean"?n:i}function xt(o,e,i,n){const a=e.yaw??0,r=e.scale??1,t=Math.cos(a),s=Math.sin(a),c=e.pos[0]+(i*t+n*s)*r,v=e.pos[2]+(-i*s+n*t)*r;return(o.heightAt(c,v)-e.pos[1])/r}function u(o,e){return o.clone().multiply(e)}function I(o,e,i,n=10){const a=[],r=o/2;if(!i){for(let s=0;s<=n*2;s++){const c=s/(n*2)*Math.PI;a.push(new D(-Math.cos(c)*r,Math.sin(c)*e))}return a}const t=e/(o*Math.sin(Math.PI/3));for(let s=0;s<=n;s++){const c=Math.PI-s/n*(Math.PI/3);a.push(new D(r+o*Math.cos(c),o*Math.sin(c)*t))}for(let s=n-1;s>=0;s--){const c=a[s];a.push(new D(-c.x,c.y))}return a}function _(o,e,i,n,a,r,t){const s=r?n*.75:n/2,c=i+Math.max(.1,a-s),v=I(n,s,r,6);t||o.moveTo(e-n/2,i),o.lineTo(e-n/2,c);for(const f of v)o.lineTo(e+f.x,c+f.y);o.lineTo(e+n/2,i),t||o.lineTo(e-n/2,i)}function Mt(o,e,i,n){const a=new k,r=i.filter(t=>t.sill<=.001&&!t.round).sort((t,s)=>t.x-s.x);a.moveTo(-o/2,0);for(const t of r)a.lineTo(t.x-t.w/2,0),_(a,t.x,0,t.w,t.h,!!t.pointed,!0);if(a.lineTo(o/2,0),n){const t=Math.max(4,Math.round(o/.9));for(let s=t;s>=0;s--){const c=-o/2+s/t*o;a.lineTo(c,Math.max(.4,n(c)))}}else a.lineTo(o/2,e),a.lineTo(-o/2,e);a.lineTo(-o/2,0);for(const t of i){if(t.sill<=.001&&!t.round)continue;const s=new V;t.round?s.absarc(t.x,t.sill,t.w/2,0,Math.PI*2,!1):_(s,t.x,t.sill,t.w,t.h,!!t.pointed,!1),a.holes.push(s)}return a}function yt(o,e){return O(o,e,0,6)}function pt(o,e,i,n,a){const r=I(o,e,a,8),t=I(o+i*2,e+i,a,8),s=new k;s.moveTo(t[0].x,t[0].y);for(const c of t)s.lineTo(c.x,c.y);for(let c=r.length-1;c>=0;c--)s.lineTo(r[c].x,r[c].y);return s.lineTo(t[0].x,t[0].y),O(s,n,0,8)}function wt(o,e,i,n,a,r,t,s,c,v=()=>!0){const f=I(i+a,n+a/2,t,7),g=f.length-1;for(let l=0;l<g;l++){if(!v(l,g))continue;const m=f[l],d=f[l+1],M=(m.x+d.x)/2,w=(m.y+d.y)/2,y=Math.atan2(d.y-m.y,d.x-m.x),p=Math.hypot(d.x-m.x,d.y-m.y),S=l===Math.floor(g/2)||g%2===0&&l===g/2-1,z=T(p*.96,a*(S?1.22:1),r*(S?1.06:1));o.add(z,"matte",{color:s,cover:.7,jitter:.08},u(e,h([M,w,0],[0,0,y+c.range(-.015,.015)])))}}function bt(o,e,i,n,a,r,t,s,c,v=0,f=12){const g=A([[0,0],[t*1.45,0],[t*1.45,t*.35],[t*1.25,t*.5],[t*1.12,t*.72],[0,t*.72]],f);o.add(g,"matte",{color:s,cover:.8,aoBottom:.55},u(e,h([i,n,a])));const l=v>0?r*(1-v):r-t*1.6,m=x(t*.88,t,Math.max(.3,l-t*.7),f);if(o.add(m,"matte",{color:s,cover:.6,aoBottom:.75,yRange:[n,n+r]},u(e,h([i,n+t*.7,a]))),v>0){const M=R(x(t*.86,t*.88,t*.9,f),.22,2.2,c.int(1,999));o.add(M,"matte",{color:s,cover:1},u(e,h([i,n+l-.1,a],[c.range(-.2,.2),c.range(0,6),c.range(-.2,.2)])));return}const d=A([[0,0],[t*.92,0],[t*1.05,t*.25],[t*1.35,t*.62],[t*1.5,t*.72],[t*1.5,t*.98],[0,t*.98]],f);o.add(d,"matte",{color:s,cover:.9},u(e,h([i,n+r-t*.98,a])))}function Tt(o,e,i,n){const a=n.col,r=n.plinth??1.2;o.add(T(2.2,r,2.2),"matte",{color:B,cover:.9,aoBottom:.5},u(e,h([0,r/2,0]))),o.add(T(2.5,.22,2.5),"matte",{color:B,cover:.9},u(e,h([0,.11,0]))),o.add(T(2.35,.18,2.35),"matte",{color:a,cover:1},u(e,h([0,r+.09,0])));const t=r+.18,s=n.broken>.35&&i.next()<.75,c=n.broken>.55,v=n.pose==="kneel";v?(o.add(x(.34,.38,.9,8),"matte",{color:a},u(e,h([.38,t,.25],[Math.PI/2-.2,0,0]))),o.add(x(.3,.34,.95,8),"matte",{color:a},u(e,h([-.38,t,-.1]))),o.add(A([[0,0],[.75,0],[.62,.7],[.5,1.1],[0,1.1]],9),"matte",{color:a,cover:.8},u(e,h([0,t+.55,-.05])))):o.add(A([[0,0],[.82,0],[.7,.6],[.52,1.5],[.48,1.75],[0,1.75]],10),"matte",{color:a,cover:.8,aoBottom:.7},u(e,h([0,t,0])));const f=t+(v?1.55:1.7);o.add(R(x(.5,.42,1.1,9),.05,2,i.int(1,99)),"matte",{color:a,cover:.7},u(e,h([0,f,0]))),o.add(W(.3,8,6),"matte",{color:a,cover:.9},u(e,h([.56,f+.95,0],[0,0,0],[1,.75,1]))),c||o.add(W(.3,8,6),"matte",{color:a,cover:.9},u(e,h([-.56,f+.95,0],[0,0,0],[1,.75,1]))),o.add(N(.82,2.1,9),"matte",{color:a,cover:.9},u(e,h([0,f-1.05+(v?.25:0),-.22],[.08,0,0],[1,1,.55]))),s?o.add(R(x(.18,.2,.2,7),.25,3,i.int(1,99)),"matte",{color:a},u(e,h([0,f+1.08,0]))):(o.add(x(.16,.2,.26,8),"matte",{color:a},u(e,h([0,f+1.08,.02]))),o.add(A([[0,0],[.27,0],[.3,.2],[.27,.42],[.14,.56],[0,.6]],9),"matte",{color:a,cover:1},u(e,h([0,f+1.28,.03]))),o.add(T(.06,.32,.5),"matte",{color:a,cover:1},u(e,h([0,f+1.78,0]))));const g=new Q(0,f+.35,.5);if(n.pose==="sword"||v){if(o.add(x(.13,.15,.9,6),"matte",{color:a},u(e,h([.38,f+.4,.28],[-.7,0,.25]))),c||o.add(x(.13,.15,.9,6),"matte",{color:a},u(e,h([-.38,f+.4,.28],[-.7,0,-.25]))),n.broken<.8){const l=v?1.5:1.9;o.add(T(.16,l,.05),"matte",{color:a,cover:.6},u(e,h([0,g.y-l/2-.15,g.z+.02]))),o.add(T(.7,.1,.12),"matte",{color:a},u(e,h([0,g.y-.08,g.z+.02]))),o.add(W(.09,6,4),"matte",{color:a},u(e,h([0,g.y+.18,g.z+.02])))}}else n.pose==="spear"?(o.add(x(.13,.15,1,6),"matte",{color:a},u(e,h([.6,f+.5,.15],[-.25,0,.12]))),n.broken<.7&&(o.add(x(.05,.06,4.4,6),"matte",{color:a},u(e,h([.78,t-.05,.35]))),o.add(N(.14,.6,6),"matte",{color:a},u(e,h([.78,t+4.35,.35],[0,0,0],[1,1,.35])))),c||o.add(x(.13,.15,.9,6),"matte",{color:a},u(e,h([-.5,f+.25,.1],[0,0,-.2])))):(o.add(x(.13,.15,.75,6),"matte",{color:a},u(e,h([.3,f+.55,.3],[-1.2,0,.6]))),o.add(x(.13,.15,.75,6),"matte",{color:a},u(e,h([-.3,f+.55,.3],[-1.2,0,-.6]))));if(n.broken>.3){for(let l=0;l<3;l++){const m=i.range(0,Math.PI*2);o.add(K(i.range(.15,.32),0,.35,i.int(1,999),.4),"matte",{color:a,cover:1},u(e,h([Math.sin(m)*i.range(1.4,2.2),.08,Math.cos(m)*i.range(1.4,2.2)])))}s&&o.add(A([[0,0],[.27,0],[.3,.2],[.27,.42],[.14,.56],[0,.6]],9),"matte",{color:a,cover:1},u(e,h([i.range(1.5,2),.25,i.range(-1,1)],[1.3,i.range(0,6),.4])))}}function St(o,e,i,n,a,r,t,s,c,v,f,g,l=.05){for(let m=0;m<t;m++){const d=m/t*Math.PI*2+l/Math.max(a,.5),M=(m+1)/t*Math.PI*2-l/Math.max(a,.5),w=(d+M)/2;if(g&&g(w))continue;const y=new k,p=Math.max(2,Math.ceil((M-d)*r/1.2));y.moveTo(Math.cos(d)*(a+l),Math.sin(d)*(a+l));for(let b=0;b<=p;b++){const L=d+(M-d)*b/p;y.lineTo(Math.cos(L)*(r-l),Math.sin(L)*(r-l))}for(let b=p;b>=0;b--){const L=d+(M-d)*b/p;y.lineTo(Math.cos(L)*(a+l),Math.sin(L)*(a+l))}const S=O(y,c,0,2);S.rotateX(-Math.PI/2);const z=(a+r)/2,F=Math.cos(w)*z,E=-Math.sin(w)*z;S.translate(-F,0,-E);const H=f.range(-.0035,.0035);o.add(S,"matte",{color:v,cover:.55,jitter:.12},u(e,h([i+F,s-c/2+f.range(-.006,.004),n+E],[H,0,-H])))}}const ot=`
attribute vec4 aShaft;   // x: 0 window / 1 floor end, y: across 0..1, z: 1 = floor pool, w: phase
attribute vec3 aIn;      // inward normal of the window (local)
uniform vec3 uLightDir;
uniform float uTime;
varying vec4 vS;
varying float vFace;
varying float vDist;
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 L = normalize(uLightDir);
  float floorW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y + 0.04;
  if (aShaft.x > 0.5) {
    float k = max(0.0, wp.y - floorW) / max(L.y, 0.2);
    wp.xyz -= L * k;
    wp.y = max(wp.y, floorW);
  }
  vec3 nW = normalize(mat3(modelMatrix) * aIn);
  vFace = smoothstep(0.04, 0.4, dot(nW, -L));
  vS = aShaft;
  vW = wp.xyz;
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,et=`
uniform vec3 uLightColor;
uniform float uHazeK;
uniform float uNight;
uniform float uTime;
uniform float uStrength;
uniform vec3 uTint;
varying vec4 vS;
varying float vFace;
varying float vDist;
varying vec3 vW;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  float across = smoothstep(0.0, 0.3, vS.y) * smoothstep(1.0, 0.7, vS.y);
  float a;
  if (vS.z > 0.5) {
    a = across * 0.55;
  } else {
    a = across * pow(1.0 - vS.x, 1.4) * (0.35 + 0.65 * smoothstep(0.0, 0.2, vS.x));
    // drifting dust in the light
    vec2 q = vW.xz * 1.7 + vec2(vW.y * 0.6, uTime * 0.07 + vS.w);
    float d = h21(floor(q * 6.0));
    a *= 0.8 + 0.4 * step(0.985, d);
  }
  a *= vFace * uStrength * smoothstep(1.2, 6.0, vDist) * (1.0 - smoothstep(70.0, 120.0, vDist));
  float lum = dot(uLightColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = mix(uLightColor / max(lum, 0.05), uTint, 0.45) * min(lum, 2.5) * mix(1.0, 0.55, uNight);
  gl_FragColor = vec4(c * a * uHazeK, 1.0);
}`;class At{pos=[];sh=[];inn=[];idx=[];mesh=null;mat=null;add(e,i,n,a,r=0){const t=[e.clone().sub(i).sub(n),e.clone().add(i).sub(n),e.clone().add(i).add(n),e.clone().sub(i).add(n)],s=(l,m,d,M)=>(this.pos.push(l.x,l.y,l.z),this.sh.push(m,d,M,r),this.inn.push(a.x,a.y,a.z),this.pos.length/3-1);for(let l=0;l<4;l++){const m=t[l],d=t[(l+1)%4],M=s(m,0,0,0),w=s(d,0,1,0),y=s(d,1,1,0),p=s(m,1,0,0);this.idx.push(M,w,y,M,y,p)}const c=s(t[0],1,0,1),v=s(t[1],1,1,1),f=s(t[2],1,1,1),g=s(t[3],1,0,1);this.idx.push(c,v,f,c,f,g)}finish(e=.08,i="#b49ae6"){if(!this.pos.length)return null;const n=new j;return n.setAttribute("position",new C(this.pos,3)),n.setAttribute("aShaft",new C(this.sh,4)),n.setAttribute("aIn",new C(this.inn,3)),n.setIndex(this.idx),n.computeBoundingSphere(),n.boundingSphere&&(n.boundingSphere.radius+=40),this.mat=new q({vertexShader:ot,fragmentShader:et,uniforms:{uLightDir:P.uLightDir,uLightColor:P.uLightColor,uHazeK:P.uHazeK,uNight:P.uNight,uTime:P.uTime,uStrength:{value:e},uTint:{value:new Z(i)}},transparent:!0,depthWrite:!1,blending:X,toneMapped:!1,side:G}),this.mesh=new J(n,this.mat),this.mesh.name="light-shafts",this.mesh.renderOrder=3,this.mesh.frustumCulled=!1,this.mesh}dispose(){this.mesh?.geometry.dispose(),this.mat?.dispose()}}export{ut as BRONZE,B as DARK,rt as IRON,At as LightShafts,tt as MARBLE_BLACK,U as PALE,Y as PALE_WARM,zt as Parts,It as R,ft as ROPE,ht as ROT_WOOD,ct as SLATE,$ as STONE,lt as WOOD,pt as archBand,I as archCurve,gt as bool,bt as column,yt as extrudeWall,xt as groundLocal,u as mul,mt as num,St as slabRing,Tt as statue,vt as str,dt as styleColor,wt as voussoirs,Mt as wallShape};
