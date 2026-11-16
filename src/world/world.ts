// The physical world: static level geometry plus a few moving pieces (conjured pillars, wards),
// all queried through bounding volume hierarchies so cliffs, ramps and ledges behave like the
// shapes they are.
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface Hit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

export interface CapsuleResult {
  /** How far the capsule had to move to get out of the world. */
  push: THREE.Vector3;
  /** Steepest upward-facing contact (1 = flat floor, 0 = wall). */
  groundY: number;
  hit: boolean;
}

const _box = new THREE.Box3();
const _seg = new THREE.Line3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();

const colliderMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

export class World {
  readonly scene = new THREE.Scene();
  /** Invisible meshes carrying a BVH. Moving colliders may only translate. */
  readonly colliders: THREE.Mesh[] = [];
  waterLevel = 0;

  addCollider(geometry: THREE.BufferGeometry, position?: THREE.Vector3): THREE.Mesh {
    (geometry as any).boundsTree = new MeshBVH(geometry);
    const mesh = new THREE.Mesh(geometry, colliderMaterial);
    if (position) mesh.position.copy(position);
    mesh.updateMatrixWorld(true);
    this.colliders.push(mesh);
    return mesh;
  }

  removeCollider(mesh: THREE.Mesh) {
    const i = this.colliders.indexOf(mesh);
    if (i >= 0) this.colliders.splice(i, 1);
    mesh.geometry.dispose();
  }

  /** First thing hit along a ray. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, far = 200): Hit | null {
    _ray.set(origin, dir);
    _ray.far = far;
    (_ray as any).firstHitOnly = true;
    let best: THREE.Intersection | null = null;
    for (const c of this.colliders) {
      c.updateMatrixWorld();
      const hits = _ray.intersectObject(c, false);
      if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
    }
    if (!best) return null;
    const normal = best.face ? best.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    _normalMatrix.getNormalMatrix(best.object.matrixWorld);
    normal.applyMatrix3(_normalMatrix).normalize();
    if (normal.dot(dir) > 0) normal.negate();
    return { point: best.point.clone(), normal, distance: best.distance };
  }

  /** Height of the highest surface at (x, z), or null over the void. */
  groundAt(x: number, z: number, fromY = 120): number | null {
    const hit = this.raycast(_origin.set(x, fromY, z), _down, fromY + 80);
    return hit ? hit.point.y : null;
  }

  /** Surface directly below a point (within `reach`). */
  groundBelow(p: THREE.Vector3, reach = 60): Hit | null {
    return this.raycast(_origin.set(p.x, p.y + 0.6, p.z), _down, reach + 0.6);
  }

  /** True if nothing solid lies between two points. */
  clearLine(a: THREE.Vector3, b: THREE.Vector3): boolean {
    _dir.subVectors(b, a);
    const d = _dir.length();
    if (d < 1e-4) return true;
    _dir.multiplyScalar(1 / d);
    return this.raycast(a, _dir, d) === null;
  }

  /**
   * Push a capsule (segment a→b, given radius) out of everything it overlaps.
   * `a` and `b` are world-space sphere centres and are moved in place.
   */
  resolveCapsule(a: THREE.Vector3, b: THREE.Vector3, radius: number): CapsuleResult {
    const result: CapsuleResult = { push: new THREE.Vector3(), groundY: 0, hit: false };
    const startA = a.clone();
    for (const c of this.colliders) {
      const tree = (c.geometry as any).boundsTree as MeshBVH;
      // moving colliders only translate, so world → local is a subtraction
      const off = c.position;
      _seg.start.copy(a).sub(off);
      _seg.end.copy(b).sub(off);
      _box.makeEmpty();
      _box.expandByPoint(_seg.start);
      _box.expandByPoint(_seg.end);
      _box.min.addScalar(-radius);
      _box.max.addScalar(radius);
      tree.shapecast({
        intersectsBounds: (box) => box.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const distance = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
          if (distance < radius) {
            const depth = radius - distance;
            _dir.subVectors(_capPoint, _triPoint);
            if (_dir.lengthSq() < 1e-12) tri.getNormal(_dir);
            else _dir.normalize();
            _seg.start.addScaledVector(_dir, depth);
            _seg.end.addScaledVector(_dir, depth);
            if (_dir.y > result.groundY) result.groundY = _dir.y;
            result.hit = true;
          }
          return false;
        },
      });
      a.copy(_seg.start).add(off);
      b.copy(_seg.end).add(off);
    }
    result.push.subVectors(a, startA);
    return result;
  }
}

/** Merge world-space geometry from a tree of meshes into one position-only geometry for collision. */
export function mergeForCollision(roots: THREE.Object3D[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const v = new THREE.Vector3();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.noCollide) return;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const index = geo.index;
      const count = index ? index.count : pos.count;
      for (let i = 0; i < count; i++) {
        const vi = index ? index.getX(i) : i;
        v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
        positions.push(v.x, v.y, v.z);
      }
    });
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return out;
}
