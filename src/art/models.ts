// Scanned models (Poly Haven, CC0), loaded once and cloned wherever the level needs them.
// Every model is optional: if a file is missing the level falls back to shapes built in code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export type ModelName = 'ship' | 'boulder' | 'slab' | 'crate' | 'barrels' | 'branches';

const FILES: Record<ModelName, string> = {
  ship: 'dutch_ship_medium',
  boulder: 'namaqualand_boulder_03',
  slab: 'rock_09',
  crate: 'wooden_crate_01',
  barrels: 'wooden_barrels_01',
  branches: 'dry_branches_medium_01',
};

export class Models {
  private scenes = new Map<ModelName, THREE.Object3D>();
  private hulls = new Map<string, THREE.BufferGeometry>();

  has(name: ModelName) {
    return this.scenes.has(name);
  }

  /** A copy of a whole model. Geometry and materials are shared, so copies are cheap. */
  clone(name: ModelName): THREE.Object3D | null {
    const s = this.scenes.get(name);
    return s ? s.clone(true) : null;
  }

  /** The separate meshes a model is made of (the two barrels and each broken stave, say). */
  pieces(name: ModelName): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.scenes.get(name)?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  }

  /** One named piece, copied and re-centred on its own base so it can be placed on the ground. */
  piece(name: ModelName, match: string): THREE.Mesh | null {
    const src = this.pieces(name).find((m) => m.name.includes(match));
    if (!src) return null;
    return centred(src);
  }

  /**
   * A simple closed shape that wraps a mesh, for collision: scanned rocks have tens of
   * thousands of triangles, and nobody needs to bump into each one.
   */
  hull(mesh: THREE.Mesh, key: string, points = 260): THREE.BufferGeometry {
    let geo = this.hulls.get(key);
    if (geo) return geo;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / points));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    geo = new ConvexGeometry(pts);
    this.hulls.set(key, geo);
    return geo;
  }

  set(name: ModelName, scene: THREE.Object3D) {
    this.scenes.set(name, scene);
  }
}

/** Copy a mesh so that its origin sits at the middle of its base. */
export function centred(src: THREE.Mesh): THREE.Mesh {
  const geo = src.geometry.clone();
  src.updateWorldMatrix(true, false);
  geo.applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, src.material);
  m.name = src.name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export async function loadModels(base: string, anisotropy: number, onProgress: (done: number, total: number) => void): Promise<Models> {
  const models = new Models();
  const loader = new GLTFLoader();
  const names = Object.keys(FILES) as ModelName[];
  let done = 0;
  await Promise.all(names.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`${base}${FILES[name]}.glb`);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.anisotropy = anisotropy;
        if (mat.transparent) {
          // sails and nets: cut out, not blended, so they sort correctly and cast shadows
          mat.transparent = false;
          mat.alphaTest = 0.4;
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
        }
      });
      models.set(name, gltf.scene);
    } catch {
      // leave it out; the level copes
    }
    onProgress(++done, names.length);
  }));
  return models;
}
