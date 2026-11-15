// Small modelling kit: everything in Gloamtide is built from a handful of
// flat-shaded primitives so the look stays consistent and cheap to render.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Deterministic RNG (mulberry32) so every render of a model is identical. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lit, faceted surface. */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts });
}

/** Unlit HDR colour. Anything above 1.0 is picked up by the bloom pass. */
export function glowMat(color, intensity = 3, opts = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), fog: false, ...opts });
}

/** Push vertices around; coincident vertices move together so faces stay closed. */
export function jitter(geo, amount, seed = 1, filter = null) {
  const pos = geo.attributes.position;
  const r = rng(seed);
  const moved = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (filter && !filter(x, y, z)) continue;
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let d = moved.get(key);
    if (!d) {
      d = [(r() - 0.5) * 2 * amount, (r() - 0.5) * 2 * amount, (r() - 0.5) * 2 * amount];
      moved.set(key, d);
    }
    pos.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Lumpy faceted ellipsoid. */
export function blob(radius, detail = 1, scale = [1, 1, 1], rough = 0, seed = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  geo.scale(scale[0], scale[1], scale[2]);
  if (rough) jitter(geo, rough, seed);
  return geo;
}

export function part(geo, material, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}

/** Chain of tapered segments through points, with faceted joints. */
export function limb(points, radii, material, seg = 5) {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]);
    const b = new THREE.Vector3(...points[i + 1]);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radii[i + 1], radii[i], len, seg, 1), material);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    g.add(m);
    if (i > 0) {
      const j = new THREE.Mesh(new THREE.IcosahedronGeometry(radii[i] * 1.08, 0), material);
      j.position.copy(a);
      g.add(j);
    }
  }
  return g;
}

/** Cone with its base at `base`, pointing along `dir`. */
export function spike(base, dir, length, radius, material, seg = 4) {
  const geo = new THREE.ConeGeometry(radius, length, seg);
  geo.translate(0, length / 2, 0);
  const m = new THREE.Mesh(geo, material);
  m.position.set(base[0], base[1], base[2]);
  m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
  return m;
}

/** Surface of revolution from [radius, y] pairs. */
export function lathe(profile, segments, material, seed = 0, rough = 0, filter = null) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const flat = geo.toNonIndexed();
  if (rough) jitter(flat, rough, seed, filter);
  flat.computeVertexNormals();
  return new THREE.Mesh(flat, material);
}

/** Orient an object from three basis vectors (columns of its rotation). */
export function setBasis(obj, x, y, z) {
  const X = new THREE.Vector3(...x).normalize();
  const Zraw = new THREE.Vector3(...z);
  const Y = new THREE.Vector3().crossVectors(Zraw, X).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  return obj;
}

export function shadows(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh && !o.material.isMeshBasicMaterial && !o.userData.noShadow) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}

const spriteTextures = new Map();
function radialTexture(power) {
  if (spriteTextures.has(power)) return spriteTextures.get(power);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const d = Math.min(1, Math.hypot(dx, dy));
      const v = Math.pow(1 - d, power) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteTextures.set(power, tex);
  return tex;
}

/** Soft additive halo that always faces the camera. */
export function halo(color, size, intensity = 1, power = 2.2) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(power),
    color: new THREE.Color(color).multiplyScalar(intensity),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  }));
  s.scale.setScalar(size);
  return s;
}

/** Jagged bolt between two points, built from glowing segments. */
export function bolt(from, to, material, { segments = 9, sway = 0.25, radius = 0.02, seed = 1 } = {}) {
  const r = rng(seed);
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = a.clone().lerp(b, t);
    const k = Math.sin(t * Math.PI) * sway;
    if (i > 0 && i < segments) p.add(new THREE.Vector3((r() - 0.5) * 2 * k, (r() - 0.5) * 2 * k, (r() - 0.5) * 2 * k));
    pts.push([p.x, p.y, p.z]);
  }
  return limb(pts, pts.map(() => radius), material, 4);
}
