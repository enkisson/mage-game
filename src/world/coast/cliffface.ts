// The cliffs of the bay: one face of basalt traced along the foot of the cliffs, about 85 m tall.
//
// It is built the way such cliffs form. The face is a stack of old lava flows, each 8–15 m
// thick. A flow cools from below into a colonnade of big regular columns, and above that into
// an entablature of thinner, fanning ones. Between flows there is a ledge where moss and turf
// hold on, and an undercut where the softer contact has weathered out. The face swings out in
// buttresses and back in bays, is cut by gullies, and is carved into an alcove behind every
// waterfall. Scree is banked at its foot, and a turf lip overhangs at its top.
//
// The geometry carries the big shapes, down to each column standing proud of its neighbours.
// The shader draws the column faces, the joints and cracks, and the weathering.
import * as THREE from 'three';
import { fbm, smoothstep } from '../../core/math';
import { fogUniforms } from './atmosphere';
import type { TextureSet } from './terrain';
import { FALLS, OUTLINE, groundHeight, plateauAt } from './layout';

/** Rows of turf behind the edge, spaced wider as they go back, reaching about 70 m. */
const CAP_ROWS = 22;

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Heights where one lava flow ends and the next begins, before warping. */
const TIERS: number[] = (() => {
  const out = [-20];
  for (let k = 0; out[out.length - 1] < 200; k++) out.push(out[out.length - 1] + 7.5 + hash(k, 3) * 7.5);
  return out;
})();

interface Column { colW: number; amt: number; tilt: number; tier: number; tf: number }

/** Which flow a point is in, and what kind of columns it has there. */
function columnsAt(s: number, y: number): Column {
  const warp = fbm(s * 0.006, 4.4, 3) * 7 + fbm(s * 0.03, 8.1, 2) * 1.6;
  const yy = y + warp;
  let k = 0;
  while (k < TIERS.length - 2 && yy >= TIERS[k + 1]) k++;
  const tf = (yy - TIERS[k]) / (TIERS[k + 1] - TIERS[k]);
  const colonnade = 0.42 + hash(k, 5) * 0.28;
  if (tf < colonnade) return { colW: 1.05 + hash(k, 6) * 0.9, amt: 1, tilt: (hash(k, 7) - 0.5) * 0.06, tier: k, tf };
  // the entablature: thin columns, fanning one way then the other along the face
  return { colW: 0.5 + hash(k, 8) * 0.3, amt: 0.55, tilt: Math.sin(s * 0.045 + k * 1.7) * 0.14, tier: k, tf };
}

export function cliffFace(hstep = 0.45, vstep = 0.6): THREE.BufferGeometry {
  // resample the outline evenly
  const pts: { x: number; z: number; s: number }[] = [{ x: OUTLINE[0][0], z: OUTLINE[0][1], s: 0 }];
  let s = 0;
  for (let i = 1; i < OUTLINE.length; i++) {
    const a = OUTLINE[i - 1], b = OUTLINE[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = hstep - (s % hstep);
    while (t <= len) { pts.push({ x: a[0] + ((b[0] - a[0]) * t) / len, z: a[1] + ((b[1] - a[1]) * t) / len, s: s + t }); t += hstep; }
    s += len;
  }
  const n = pts.length;
  const pos: number[] = [], A: number[] = [], B: number[] = [], C: number[] = [];
  const colStart: number[] = [], rows: number[] = [];
  const gullies: { s: number; w: number; d: number }[] = [];
  for (let gs = 20; gs < s; gs += 38 + hash(gs, 1) * 40) gullies.push({ s: gs, w: 2.5 + hash(gs, 2) * 4, d: 2 + hash(gs, 3) * 5 });
  let vi = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 3)], b = pts[Math.min(n - 1, i + 3)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    const ground = groundHeight(p.x + nx * 4, p.z + nz * 4);
    const top = plateauAt(p.x - nx * 5, p.z - nz * 5) + 0.6;
    const foot = Math.min(ground - 4, top - 6);
    const canyon = p.z < -57 ? 0.4 : 1;
    // the falls: an alcove carved behind each one, deepest at the bottom
    let alcove = 0, alcoveFoot = 0, fallNear = 0;
    for (const f of FALLS) {
      const df = Math.hypot(p.x - f.x, p.z - f.z);
      const k = Math.exp(-Math.pow(df / (f.width * 1.1 + 3), 2));
      alcove = Math.max(alcove, k * (3 + f.width * 0.55));
      alcoveFoot = Math.max(alcoveFoot, k * f.width * 0.5);
      fallNear = Math.max(fallNear, k);
    }
    const count = Math.max(2, Math.ceil((top - foot) / vstep));
    colStart.push(vi);
    rows.push(count);
    for (let j = 0; j <= count; j++) {
      const y = foot + ((top - foot) * j) / count;
      const fromTop = top - y, fromFoot = y - ground, h01 = (y - foot) / (top - foot);
      // buttresses and bays
      const steady = canyon * (1 - fallNear * 0.85);
      let d = (fbm(p.s * 0.009, 1.3, 4) * 16 + fbm(p.s * 0.03, y * 0.008 + 2, 3) * 6) * steady;
      // gullies: chimneys cut back into the face, deeper toward the top
      for (const g of gullies) {
        const dg = Math.abs(p.s - g.s - fbm(y * 0.02, g.s, 2) * 4);
        if (dg < g.w * 2.5) d -= Math.exp(-Math.pow(dg / g.w, 2)) * g.d * (0.25 + 0.75 * h01) * steady;
      }
      // the flows: each set back or forward as a whole, with a lip at its top and an
      // undercut at the contact below the next
      const c = columnsAt(p.s, y);
      const blk = p.s / 55, bi = Math.floor(blk), bf = smoothstep(0.2, 0.8, blk - bi);
      d += ((hash(c.tier, bi) - 0.5) * (1 - bf) + (hash(c.tier, bi + 1) - 0.5) * bf) * 4.5 * steady;
      // not every contact shows: some flows merge into the next with barely a line
      const contactK = 0.25 + 0.75 * ((hash(c.tier, bi + 40) * (1 - bf) + hash(c.tier, bi + 41) * bf));
      d += (smoothstep(0.86, 0.97, c.tf) * 0.45 - (1 - smoothstep(0.0, 0.07, c.tf)) * 0.9) * contactK;
      // the columns: each one stands a little proud of or behind its neighbours, its
      // middle face out front and its two side faces turned away
      const sc = p.s + y * c.tilt, kc = Math.floor(sc / c.colW), f = sc / c.colW - kc;
      const proud = (hash(kc, c.tier + 17) - 0.5) * 1.1 * c.amt;
      const prism = c.colW * 0.3 * Math.min(1, Math.min(f, 1 - f) / 0.27) * c.amt;
      // here and there the top of a column has broken away down to a joint, leaving a
      // slot open to the flow above with its broken stump sloping out at the bottom
      const goneLen = 0.2 + hash(kc, c.tier + 31) * 0.55;
      const gone = hash(kc, c.tier * 13 + 5) > 0.96 ? -0.8 * c.amt * smoothstep(1 - goneLen, 1 - goneLen + 0.12, c.tf) : 0;
      // in the damp canyon the columns are worn and mossed over, and stand out less
      d += (proud + prism + gone) * (canyon < 1 ? 0.45 : 1);
      // the alcoves behind the falls, and the scoured bowl at their feet
      d -= alcove * (0.6 + 0.4 * (1 - h01)) + alcoveFoot * Math.exp(-Math.pow(fromFoot / 14, 2));
      // sea caves at the headland
      d -= Math.exp(-Math.pow((p.s - 132) / 7, 2)) * Math.exp(-Math.pow((y - 4) / 7, 2)) * 8;
      d -= Math.exp(-Math.pow((p.s - 168) / 4, 2)) * Math.exp(-Math.pow((y - 3) / 5, 2)) * 5;
      // grain
      d += fbm(p.s * 0.2, y * 0.2, 4) * 0.7 + fbm(p.s * 0.9, y * 0.9, 2) * 0.15;
      // scree banked at the foot, and the rounded lip with its turf overhanging
      d += (1 - smoothstep(-3, 14, fromFoot)) * (6 + fbm(p.s * 0.05, 3, 2) * 4) * (1 - fallNear * 0.7);
      d -= smoothstep(6, 0, fromTop) * 4 - smoothstep(1.4, 0.2, fromTop) * 1.6;
      pos.push(p.x + nx * d, y, p.z + nz * d);
      A.push(p.s, c.colW, c.amt, c.tilt);
      B.push(top, ground, c.tf, c.tier);
      C.push(nx, nz);
      vi++;
    }
    // the cap: the land on top, carried back from the edge until the ground takes over
    const ex = pos[pos.length - 3], ez = pos[pos.length - 1];
    for (let k = 1; k <= CAP_ROWS; k++) {
      const back = k * k * 0.12 + k * 0.35;
      const qx = ex - nx * back, qz = ez - nz * back;
      const y = plateauAt(qx, qz) + 0.05;
      pos.push(qx, y, qz);
      A.push(p.s, 1, 0, 0);
      B.push(y + 0.4, ground, 0.5, 0);
      C.push(nx, nz);
      vi++;
    }
    rows[rows.length - 1] = count + CAP_ROWS;
  }
  // stitch neighbouring columns of vertices, which may have different row counts
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const ca = colStart[i], cb = colStart[i + 1], ra = rows[i], rb = rows[i + 1];
    let ja = 0, jb = 0;
    while (ja < ra || jb < rb) {
      const ta = (ja + 1) / ra, tb = (jb + 1) / rb;
      if (jb >= rb || (ja < ra && ta <= tb)) { idx.push(ca + ja, cb + jb, ca + ja + 1); ja++; }
      else { idx.push(ca + ja, cb + jb, cb + jb + 1); jb++; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('cliffA', new THREE.Float32BufferAttribute(A, 4));
  geo.setAttribute('cliffB', new THREE.Float32BufferAttribute(B, 4));
  geo.setAttribute('cliffC', new THREE.Float32BufferAttribute(C, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Basalt as it looks on a storm coast, drawn column by column. */
export function cliffMaterial(rock: TextureSet): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }); // both sides: tight bends fold the strip over on itself
  const falls = FALLS.map((f) => new THREE.Vector4(f.x, f.z, f.width, 0));
  const u = { rMap: { value: rock.diff }, rNor: { value: rock.nor }, uFalls: { value: falls } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    fogUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 cliffA;
        attribute vec4 cliffB;
        attribute vec2 cliffC;
        varying vec2 vOut;
        varying vec4 vA;
        varying vec4 vB;
        varying vec3 vCW;
        varying vec3 vCN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vA = cliffA; vB = cliffB; vOut = cliffC;
        vCW = (modelMatrix * vec4(position, 1.0)).xyz;
        vCN = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D rMap, rNor;
        uniform vec4 uFalls[${falls.length}];
        varying vec4 vA;
        varying vec4 vB;
        varying vec3 vCW;
        varying vec3 vCN;
        varying vec2 vOut;
        float cRough, cAO, cMoss;
        vec3 cN;
        float ch(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 437.585); }
        float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
        float cf(vec2 p) { return cn(p) * 0.5 + cn(p * 2.03 + 7.1) * 0.27 + cn(p * 4.1 + 3.3) * 0.15 + cn(p * 8.3 + 1.7) * 0.08; }
        vec3 ctw;
        vec3 ctri(sampler2D t, float s) {
          return texture2D(t, vCW.zy * s).rgb * ctw.x + texture2D(t, vCW.xz * s).rgb * ctw.y + texture2D(t, vCW.xy * s).rgb * ctw.z;
        }`)
      .replace('#include <map_fragment>', `
        vec3 gn = normalize(vCN);
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 tg = normalize(cross(up, gn) + vec3(1e-4, 0.0, 0.0));
        ctw = pow(abs(gn), vec3(5.0)); ctw /= ctw.x + ctw.y + ctw.z;
        float sAlong = vA.x, colW = vA.y, amt = vA.z, tilt = vA.w;
        float top = vB.x, ground = vB.y, tf = vB.z, tier = floor(vB.w + 0.5);
        float y = vCW.y;
        // ---- the columns ----
        float sc = sAlong + y * tilt;
        float kc = floor(sc / colW), f = sc / colW - kc;
        float cid = ch(vec2(kc, tier));
        // which face of the prism we are on
        float side = f < 0.27 ? -1.0 : (f > 0.73 ? 1.0 : 0.0);
        vec3 faceN = normalize(gn + tg * side * 1.15 * amt);
        // joints: each column cracked across every half metre to metre and a half
        float jStep = 0.5 + ch(vec2(kc, tier + 3.0)) * 0.9;
        float jy = (y + cid * 7.0 + (cn(vec2(sc * 3.0, y * 0.5)) - 0.5) * 0.25) / jStep;
        float jf = fract(jy);
        // joints are not cut clean across: they wander, and not every column has one at each step
        float canyonK = vCW.z < -58.0 ? 0.45 : 1.0;
        float joint = (1.0 - smoothstep(0.0, 0.035, jf)) * amt * canyonK * step(0.35, ch(vec2(kc, floor(jy)))) ;
        float edge = (1.0 - smoothstep(0.0, 0.025, min(f, 1.0 - f))) * amt * canyonK;
        float facetEdge = (1.0 - smoothstep(0.0, 0.02, abs(f - 0.27))) + (1.0 - smoothstep(0.0, 0.02, abs(f - 0.73)));
        // ---- colour ----
        vec3 a = ctri(rMap, 0.09), b = ctri(rMap, 0.37);
        vec3 tex = mix(a, b, 0.5);
        float tl = dot(tex, vec3(0.3, 0.55, 0.15));
        // dark grey basalt; some flows a little browner with old oxidation
        vec3 base = mix(vec3(0.1, 0.1, 0.105), vec3(0.13, 0.11, 0.095), ch(vec2(tier, 9.0)) * 0.8);
        vec3 c = base * (0.55 + tl * 1.2);
        c *= 0.82 + cid * 0.32;                          // each column its own shade
        c *= side == 0.0 ? 1.0 : 0.9;
        c *= 1.0 - joint * 0.35 - edge * 0.4 - facetEdge * 0.1 * amt;
        // the contact between flows is rubbly and reddish
        float contact = 1.0 - smoothstep(0.0, 0.08, tf);
        c = mix(c, vec3(0.16, 0.1, 0.075) * (0.6 + tl), contact * 0.7);
        // water streaks below every ledge
        float streak = smoothstep(0.52, 0.85, cn(vec2(sAlong * 0.7, y * 0.02)) * 0.7 + cn(vec2(sAlong * 2.6, y * 0.05)) * 0.3);
        c *= 1.0 - streak * 0.35 * (1.0 - abs(gn.y));
        // pale salt and bird lime under the ledges high on the sea-facing walls
        // drips of it running down from the ledges, thin and broken
        float drip = smoothstep(0.7, 0.92, cn(vec2(sAlong * 4.0, y * 0.05))) * smoothstep(0.4, 0.75, cn(vec2(sAlong * 9.0, y * 0.4)));
        float lime = drip * smoothstep(0.55, 0.95, tf) * smoothstep(-30.0, 20.0, vCW.z) * smoothstep(top - 50.0, top - 15.0, y);
        c = mix(c, vec3(0.36, 0.36, 0.35), lime * 0.3);
        // yellow-green lichen in crusts
        float lichen = smoothstep(0.6, 0.78, cf(vCW.xy * 0.35 + vCW.zy * 0.2)) * (1.0 - joint);
        c = mix(c, vec3(0.2, 0.19, 0.09), lichen * 0.45);
        // ---- moss and turf ----
        // the spray of every fall keeps the rock near it wet, black and green
        float wetFall = 0.0;
        for (int i = 0; i < ${falls.length}; i++) {
          float d = length(vCW.xz - uFalls[i].xy);
          wetFall = max(wetFall, exp(-pow(d / (uFalls[i].z * 1.4 + 4.0), 2.0)));
        }
        float upish = gn.y;
        float ledge = smoothstep(0.35, 0.75, upish + (cf(vCW.xz * 0.4 + y * 0.1) - 0.5) * 0.5);
        float tongues = smoothstep(0.58, 0.8, cf(vec2(sAlong * 0.09, y * 0.04)) + (vCW.z < -58.0 ? 0.15 : 0.0) + wetFall * 0.3);
        float inJoint = joint * smoothstep(0.5, 0.75, cn(vec2(sAlong * 0.5, y * 0.3))) * (0.4 + wetFall);
        float moss = max(max(ledge, tongues * smoothstep(-0.5, 0.15, upish) * 0.9), inJoint);
        moss = max(moss, smoothstep(2.5, 0.4, top - y));                 // the turf at the top
        moss *= smoothstep(2.0, 6.0, y - ground + 2.0) ;                 // not where the sea scours
        vec3 mossC = mix(vec3(0.035, 0.05, 0.015), vec3(0.11, 0.15, 0.04), cn(vCW.xz * 0.5 + y * 0.2)) * (0.55 + cf(vec2(sAlong, y) * 3.5) * 0.5 + cn(vec2(sAlong, y) * 18.0) * 0.3);
        mossC = mix(mossC, vec3(0.13, 0.15, 0.06), smoothstep(2.0, 0.5, top - y) * 0.6);
        c = mix(c, mossC, clamp(moss, 0.0, 1.0));
        cMoss = clamp(moss, 0.0, 1.0);
        // wet: by the falls, and low down where the sea reaches
        float seaWet = 1.0 - smoothstep(0.5, 5.0, y + (cn(vCW.xz * 0.3) - 0.5) * 2.0);
        float wet = max(seaWet, wetFall * 0.85);
        c *= mix(1.0, 0.5, wet * (1.0 - moss * 0.5));
        // the side walls of columns standing proud, and of slots where one has fallen, face
        // along the cliff rather than out of it: they sit in each other's shadow and see
        // little sky, so they stay dark instead of catching the low sun in thin slivers
        // (the vertex normals are smoothed across those steps, so read the true facet)
        vec3 fN = normalize(cross(dFdx(vCW), dFdy(vCW)));
        float outDot = min(dot(normalize(gn.xz + vec2(1e-4)), normalize(vOut)), abs(dot(normalize(fN.xz + vec2(1e-4)), normalize(vOut))));
        float cavity = smoothstep(0.85, 0.45, outDot) * (1.0 - abs(fN.y)) * (1.0 - cMoss * 0.6)
          * mix(1.0, 0.35, smoothstep(50.0, 150.0, length(vViewPosition)));   // far off they blur into the face
        c *= 1.0 - cavity * 0.45;
        diffuseColor.rgb *= c;
        cRough = mix(0.86 - streak * 0.1, 0.22, wet);
        cRough = mix(cRough, 0.92, moss);
        cRough = mix(cRough, 0.95, cavity);
        cAO = (1.0 - cavity * 0.5) * (1.0 - joint * 0.4 * (1.0 - cMoss)) * (1.0 - edge * 0.5 * (1.0 - cMoss)) * (1.0 - contact * 0.3) * mix(1.0, 0.6, smoothstep(-0.1, -0.6, gn.y));
        // ---- normal ----
        vec3 tn = ctri(rNor, 0.09) * 2.0 - 1.0, tn2 = ctri(rNor, 0.37) * 2.0 - 1.0;
        vec3 tilt3 = (tn + tn2 * 0.7) * 0.35;
        vec3 nn = normalize(mix(gn, faceN, amt * 0.85 * (1.0 - cavity)) + vec3(tilt3.x, tilt3.y, tilt3.x) * (1.0 - moss * 0.5));
        // the lip of each joint catches the sky
        nn = normalize(nn + up * (smoothstep(0.0, 0.05, jf) * (1.0 - smoothstep(0.05, 0.12, jf))) * 0.8 * amt);
        cN = nn;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(cN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= cAO; reflectedLight.indirectSpecular *= cAO;');
  };
  m.customProgramCacheKey = () => 'cliffface';
  return m;
}
