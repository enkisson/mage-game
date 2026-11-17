// Marram grass: the tough, pale grass that holds the dunes, in tufts of curved blades that lean
// with the wind. All the tufts are one mesh.
import * as THREE from 'three';
import { groundHeight } from './layout';

export function marram(spots: { x: number; z: number; size: number }[], seed = 7, colors: [number, number, number] = [0xc8b47e, 0x8a9658, 0x9a8464]): THREE.Mesh {
  const r = (() => { let q = seed * 7919; return () => ((q = (q * 16807) % 2147483647) / 2147483647); })();
  const pos: number[] = [], col: number[] = [], nor: number[] = [];
  const straw = new THREE.Color(colors[0]), green = new THREE.Color(colors[1]), dead = new THREE.Color(colors[2]);
  const wind = new THREE.Vector2(0.5, 0.86);
  for (const s of spots) {
    const gy = groundHeight(s.x, s.z);
    const n = Math.round(30 + s.size * 30);
    for (let b = 0; b < n; b++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.22 * s.size;
      const bx = s.x + Math.cos(a) * d, bz = s.z + Math.sin(a) * d;
      const h = (0.35 + r() * 0.55) * s.size;
      const lean = 0.25 + r() * 0.5;
      const dir = new THREE.Vector2(Math.cos(a) * 0.6 + wind.x * 0.8, Math.sin(a) * 0.6 + wind.y * 0.8).normalize();
      const w = 0.012 + r() * 0.01;
      const c = straw.clone().lerp(r() < 0.5 ? green : dead, r() * 0.7).multiplyScalar(0.8 + r() * 0.4);
      const side = new THREE.Vector2(-dir.y, dir.x);
      const segs = 4;
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs, t1 = (k + 1) / segs;
        const p = (t: number) => new THREE.Vector3(bx + dir.x * lean * h * t * t, gy + h * t - lean * h * 0.3 * t * t, bz + dir.y * lean * h * t * t);
        const w0 = w * (1 - t0), w1 = w * (1 - t1);
        const a0 = p(t0), a1 = p(t1);
        const q = [
          [a0.x - side.x * w0, a0.y, a0.z - side.y * w0], [a0.x + side.x * w0, a0.y, a0.z + side.y * w0],
          [a1.x + side.x * w1, a1.y, a1.z + side.y * w1], [a1.x - side.x * w1, a1.y, a1.z - side.y * w1],
        ];
        for (const idx of [0, 1, 2, 0, 2, 3]) {
          pos.push(...q[idx]);
          const shade = 0.55 + 0.45 * (idx < 2 ? t0 : t1);
          col.push(c.r * shade, c.g * shade, c.b * shade);
          nor.push(-dir.x * 0.4, 0.9, -dir.y * 0.4);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
