// The magic as it sits in the hand: a flame in the cupped palm, stones turning round the
// fist, air coiling up the raised fingers, force beating off the flat of the palm. All of it
// lives in the same space as the hands, so it moves with them.
import * as THREE from 'three';
import { SIGILS, type SigilId } from '../magic/sigils';

const MAX = 700;
const PEBBLES = 7;

interface Mote {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; shrink: number;
  r: number; g: number; b: number; r2: number; g2: number; b2: number;
  lift: number; drag: number;
}

function softDisc(inner: number, ring = false): THREE.Texture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (ring) {
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,255,255,0)');
    g.addColorStop(0.8, 'rgba(255,255,255,1)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(inner, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** What a hand is doing this frame, as far as its magic is concerned. All in the hands' space. */
export interface HandState {
  id: SigilId | null;
  /** 0 to 1: how fully the word has formed. */
  amount: number;
  /** Just off the palm; the middle of the fist; and which way the palm and fingers face. */
  palmAt: THREE.Vector3;
  fistAt: THREE.Vector3;
  palm: THREE.Vector3;
  fingers: THREE.Vector3;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class HandMagic {
  readonly group = new THREE.Group();
  private motes: Mote[] = [];
  private points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private uniforms = { uPx: { value: 600 } };
  private pebbles: THREE.InstancedMesh;
  private pebbleSeed: { a: number; r: number; h: number; s: number; w: number; tilt: THREE.Vector3 }[] = [];
  private rings: THREE.Sprite[] = [];
  private embers: THREE.Sprite[] = [];
  private emit = [0, 0];
  /** World up, as the hands see it. */
  readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        uniform float uPx;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // sizes are in the hands' own units, so they shrink with the hands if those are scaled
          float unit = length(modelViewMatrix[0].xyz);
          gl_PointSize = aSize * unit * uPx / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vColor * a * a, 1.0);
        }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 40;
    this.group.add(this.points);

    const rock = new THREE.MeshStandardMaterial({ color: 0xa3927e, roughness: 0.9, flatShading: true });
    this.pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rock, PEBBLES * 2);
    this.pebbles.frustumCulled = false;
    this.pebbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.pebbles);
    for (let i = 0; i < PEBBLES * 2; i++) {
      const k = i % PEBBLES;
      this.pebbleSeed.push({
        a: (k / PEBBLES) * Math.PI * 2 + (i >= PEBBLES ? 0.6 : 0), r: 0.062 + (k % 3) * 0.012, h: (k % 2 ? 0.02 : -0.012) + k * 0.004,
        s: 0.0038 + ((k * 7) % 5) * 0.0011, w: 1.5 + (k % 3) * 0.45, tilt: new THREE.Vector3(Math.sin(k * 2.1), Math.cos(k * 1.3), Math.sin(k * 0.7 + 1)).normalize(),
      });
      this.pebbles.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }

    const ringTex = softDisc(0, true), glowTex = softDisc(0.25);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 }));
      s.renderOrder = 41;
      this.rings.push(s);
      this.group.add(s);
    }
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 }));
      s.renderOrder = 39;
      this.embers.push(s);
      this.group.add(s);
    }
    this.group.traverse((o) => { o.userData.noCollide = true; o.userData.noShade = true; });
  }

  /** Tell the sparks how many pixels a unit of height covers at a unit of distance. */
  setPixels(px: number) {
    this.uniforms.uPx.value = px;
  }

  private add(m: Mote) {
    if (this.motes.length < MAX) this.motes.push(m);
  }

  /** One hand's magic for this frame. `index` is 0 for the left hand, 1 for the right. */
  hold(index: number, h: HandState, dt: number, clock: number) {
    const ember = this.embers[index];
    const base = index * PEBBLES;
    const stone = h.id === 'stone' ? h.amount : 0;
    for (let k = 0; k < PEBBLES; k++) {
      const p = this.pebbleSeed[base + k];
      if (stone <= 0.001) {
        this.pebbles.setMatrixAt(base + k, _m.makeScale(0, 0, 0));
        continue;
      }
      // they come up from below and fall into a slow orbit round the fist
      const rise = 1 - stone;
      const a = p.a + clock * p.w * (index ? -1 : 1);
      _a.set(Math.cos(a) * (p.r + rise * 0.05), p.h + Math.sin(clock * 2.3 + k) * 0.006 - rise * rise * 0.3, Math.sin(a) * (p.r + rise * 0.05)).add(h.fistAt);
      _q.setFromAxisAngle(p.tilt, clock * (1.2 + k * 0.3));
      this.pebbles.setMatrixAt(base + k, _m.compose(_a, _q, _s.setScalar(p.s * Math.min(1, stone * 1.5))));
    }
    this.pebbles.instanceMatrix.needsUpdate = true;

    for (let k = 0; k < 3; k++) {
      const ring = this.rings[index * 3 + k];
      if (h.id !== 'push' || h.amount <= 0.001) { ring.material.opacity = 0; continue; }
      const t = (clock * 1.5 + k / 3) % 1;
      ring.position.copy(h.palmAt).addScaledVector(h.palm, 0.01 + t * 0.06);
      ring.scale.setScalar(0.1 + t * 0.2);
      ring.material.opacity = (1 - t) ** 1.6 * Math.min(1, t * 6) * h.amount * 0.6;
      ring.material.color.set(SIGILS.push.color);
    }

    if (!h.id || h.amount <= 0.001) {
      ember.material.opacity = 0;
      return;
    }
    _c.set(SIGILS[h.id].color);
    ember.position.copy(h.id === 'stone' ? h.fistAt : h.palmAt);
    const flick = h.id === 'fire' ? 0.8 + Math.sin(clock * 23 + index) * 0.1 + Math.sin(clock * 37) * 0.1 : 0.9 + Math.sin(clock * 4) * 0.1;
    ember.scale.setScalar((h.id === 'fire' ? 0.11 : h.id === 'push' ? 0.2 : 0.1) * (0.6 + h.amount * 0.4) * flick);
    ember.material.color.copy(_c);
    ember.material.opacity = h.amount * (h.id === 'fire' ? 0.3 : h.id === 'stone' ? 0.12 : 0.22);

    this.emit[index] += dt;
    if (h.id === 'fire') {
      // a tongue of flame standing on the palm, leaning with whatever way is up
      const every = 1 / 90;
      while (this.emit[index] > every) {
        this.emit[index] -= every;
        const hot = Math.random();
        // born in a small ring and drawn inward as they rise, so the flame comes to a point
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.016;
        this.add({
          x: h.palmAt.x + Math.cos(a) * r, y: h.palmAt.y - 0.012 + Math.random() * 0.006, z: h.palmAt.z + Math.sin(a) * r,
          vx: -Math.cos(a) * r * 2.4 + this.up.x * 0.12 + (Math.random() - 0.5) * 0.03, vy: this.up.y * 0.12, vz: -Math.sin(a) * r * 2.4 + this.up.z * 0.12 + (Math.random() - 0.5) * 0.03,
          age: 0, life: (0.24 + Math.random() * 0.22) * (0.5 + h.amount * 0.5), size: 0.02 + Math.random() * 0.014, shrink: 0.12,
          r: 0.55, g: 0.26 + hot * 0.12, b: 0.07 + hot * 0.06, r2: 0.3, g2: 0.03, b2: 0.0, lift: 0.9, drag: 1.2,
        });
      }
      // now and then a spark gets away
      if (Math.random() < dt * 5) {
        this.add({
          x: h.palmAt.x, y: h.palmAt.y + 0.02, z: h.palmAt.z, vx: (Math.random() - 0.5) * 0.35, vy: 0.3 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.35,
          age: 0, life: 0.5 + Math.random() * 0.5, size: 0.006, shrink: 0.5, r: 1.6, g: 0.8, b: 0.2, r2: 0.8, g2: 0.15, b2: 0, lift: 0.25, drag: 1.2,
        });
      }
    } else if (h.id === 'wind') {
      // three threads of air winding up the raised fingers
      const every = 1 / 400;
      _u.crossVectors(h.fingers, h.palm).normalize();
      _w.crossVectors(h.fingers, _u);
      let n = 0;
      while (this.emit[index] > every) {
        this.emit[index] -= every;
        const strand = n++ % 3;
        const t = (clock * 1.1 + strand / 3 + Math.random() * 0.02) % 1;
        const ang = clock * 11 + strand * 2.094 + t * 7;
        const r = 0.03 * (1.15 - t * 0.7);
        _a.copy(h.palmAt).addScaledVector(h.fingers, -0.02 + t * 0.13).addScaledVector(_u, Math.cos(ang) * r).addScaledVector(_w, Math.sin(ang) * r);
        this.add({
          x: _a.x, y: _a.y, z: _a.z, vx: h.fingers.x * 0.05, vy: h.fingers.y * 0.05, vz: h.fingers.z * 0.05,
          age: 0, life: 0.2 + Math.random() * 0.1, size: 0.009 * (1.2 - t * 0.6), shrink: 0.2,
          r: 0.3 * h.amount, g: 0.42 * h.amount, b: 0.5 * h.amount, r2: 0.06, g2: 0.12, b2: 0.18, lift: 0, drag: 0,
        });
      }
    } else if (h.id === 'stone') {
      // grit drawn up toward the fist
      if (this.emit[index] > 0.05) {
        this.emit[index] = 0;
        const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.05;
        this.add({
          x: h.fistAt.x + Math.cos(a) * r, y: h.fistAt.y - 0.12 - Math.random() * 0.05, z: h.fistAt.z + Math.sin(a) * r,
          vx: -Math.cos(a) * 0.12, vy: 0.3, vz: -Math.sin(a) * 0.12, age: 0, life: 0.4, size: 0.007, shrink: 0.6,
          r: 0.55, g: 0.42, b: 0.26, r2: 0.2, g2: 0.14, b2: 0.08, lift: 0, drag: 0.5,
        });
      }
    } else if (h.id === 'push') {
      // motes shoved off the palm
      if (this.emit[index] > 0.03) {
        this.emit[index] = 0;
        _a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.07);
        this.add({
          x: h.palmAt.x + _a.x, y: h.palmAt.y + _a.y, z: h.palmAt.z + _a.z, vx: h.palm.x * 0.5, vy: h.palm.y * 0.5, vz: h.palm.z * 0.5,
          age: 0, life: 0.22, size: 0.008, shrink: 0.4, r: _c.r * 0.9, g: _c.g * 0.9, b: _c.b * 0.9, r2: _c.r * 0.2, g2: _c.g * 0.2, b2: _c.b * 0.2, lift: 0, drag: 2,
        });
      }
    }
  }

  /** The word leaves the hand: everything it held goes with it, along `dir`. */
  burst(at: THREE.Vector3, id: SigilId, dir: THREE.Vector3, strength = 1) {
    _c.set(SIGILS[id].color);
    const n = Math.round(46 * strength);
    for (let i = 0; i < n; i++) {
      _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(id === 'push' || id === 'wind' ? 1.1 : 0.6).add(dir).normalize();
      const speed = 1.2 + Math.random() * 3.2;
      const hot = id === 'fire' ? 1.6 : 1;
      this.add({
        x: at.x, y: at.y, z: at.z, vx: _b.x * speed, vy: _b.y * speed, vz: _b.z * speed, age: 0, life: 0.12 + Math.random() * 0.2,
        size: 0.005 + Math.random() * 0.012, shrink: 0.1, r: _c.r * hot + 0.2, g: _c.g * hot + 0.1, b: _c.b * hot, r2: _c.r * 0.5, g2: _c.g * 0.25, b2: _c.b * 0.25,
        lift: id === 'fire' ? 0.6 : 0, drag: 5,
      });
    }
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.age += dt;
      if (m.age >= m.life) {
        this.motes[i] = this.motes[this.motes.length - 1];
        this.motes.pop();
        continue;
      }
      const k = Math.exp(-m.drag * dt);
      m.vx = m.vx * k + this.up.x * m.lift * dt;
      m.vy = m.vy * k + this.up.y * m.lift * dt;
      m.vz = m.vz * k + this.up.z * m.lift * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    }
    for (const m of this.motes) {
      const t = m.age / m.life;
      const fade = Math.min(1, t * 8) * (1 - t);
      this.pos[n * 3] = m.x; this.pos[n * 3 + 1] = m.y; this.pos[n * 3 + 2] = m.z;
      this.col[n * 3] = (m.r + (m.r2 - m.r) * t) * fade;
      this.col[n * 3 + 1] = (m.g + (m.g2 - m.g) * t) * fade;
      this.col[n * 3 + 2] = (m.b + (m.b2 - m.b) * t) * fade;
      this.size[n] = m.size * (1 - (1 - m.shrink) * t);
      n++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  clear() {
    this.motes.length = 0;
  }
}
