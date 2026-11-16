// Small things placed in the world by the game rather than the level: journal pages and wards.
import * as THREE from 'three';
import { MATERIALS } from '../art/materials';
import type { SealDef } from './level';

function shaftTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let shaftTex: THREE.Texture | null = null;

export interface JournalProp {
  root: THREE.Group;
  setRead(read: boolean): void;
  /** `distance` is how far away the player is: the shaft thins out as you come close. */
  update(time: number, distance: number): void;
}

/** A journal page: a small book under a thin shaft of light, so it can be seen from a distance. */
export function journalProp(): JournalProp {
  const root = new THREE.Group();
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.25), MATERIALS.leather);
  book.rotation.y = 0.5;
  book.castShadow = true;
  root.add(book);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0xd8ccae, roughness: 0.9 }));
  pages.rotation.y = 0.5;
  pages.position.y = 0.012;
  pages.scale.set(1.02, 1, 0.98);
  root.add(pages);

  shaftTex ??= shaftTexture();
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: new THREE.Color(0xffd98a).multiplyScalar(1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 7, 12, 1, true), shaftMat);
  shaft.position.y = 3.5;
  root.add(shaft);
  const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd98a).multiplyScalar(3) }));
  mote.position.y = 0.55;
  root.add(mote);
  root.traverse((o) => { o.userData.noCollide = true; });

  let read = false;
  return {
    root,
    setRead(r) {
      read = r;
      shaft.visible = !r;
      mote.visible = !r;
    },
    update(time, distance) {
      if (read) return;
      mote.position.y = 0.55 + Math.sin(time * 2) * 0.06;
      mote.rotation.y = time * 1.5;
      // a beacon from far off, a faint thread once you are standing over it
      const far = Math.min(1, Math.max(0, (distance - 2.5) / 9));
      shaftMat.opacity = (0.12 + 0.6 * far) * (0.85 + Math.sin(time * 1.7) * 0.15);
    },
  };
}

function wardTexture(): THREE.Texture {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'square';
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      const x = col * 64 + 32, y = row * 64 + 32;
      ctx.globalAlpha = 0.35 + r() * 0.65;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        ctx.moveTo(x + (r() - 0.5) * 36, y + (r() - 0.5) * 40);
        ctx.lineTo(x + (r() - 0.5) * 36, y + (r() - 0.5) * 40);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  for (let col = 0; col <= 8; col++) { ctx.beginPath(); ctx.moveTo(col * 64, 0); ctx.lineTo(col * 64, H); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let wardTex: THREE.Texture | null = null;

export interface SealProp {
  mesh: THREE.Mesh;
  /** World-space box to collide with while the ward stands. */
  collision: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
}

/** A ward across the path: a wall of slowly falling script. */
export function sealProp(def: SealDef): SealProp {
  wardTex ??= wardTexture();
  const tex = wardTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(def.width / 5, def.height / 5);
  const material = new THREE.MeshBasicMaterial({
    map: tex, color: new THREE.Color(0x9db8ff).multiplyScalar(1.5), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(def.width, def.height), material);
  mesh.position.copy(def.at).setY(def.at.y + def.height / 2 - 1);
  mesh.rotation.y = def.facing;
  mesh.userData.noCollide = true;
  mesh.visible = false;

  const collision = new THREE.BoxGeometry(def.width, def.height + 30, 0.8).toNonIndexed();
  collision.rotateY(def.facing);
  collision.translate(def.at.x, def.at.y + def.height / 2 + 14, def.at.z);
  return { mesh, collision, material };
}
