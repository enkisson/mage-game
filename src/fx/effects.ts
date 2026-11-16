// Visual effects: two pooled particle clouds (glowing and dusty), a small pool of lights,
// and a few short-lived meshes such as shock rings. Everything is built from these.
import * as THREE from 'three';

export interface Emit {
  count: number;
  /** One colour, or two to pick between at random. */
  color: number | [number, number];
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  gravity?: number;
  drag?: number;
  /** Emit within this half-angle of `dir`; omit for all directions. */
  spread?: number;
  dir?: THREE.Vector3;
  /** Spawn anywhere within this distance of the origin. */
  radius?: number;
  /** Squash the spawn volume vertically (0 = a flat disc). */
  flat?: number;
  /** Extra upward speed. */
  rise?: number;
  /** Size multiplier reached by the end of life (default: shrink to 0.2). */
  grow?: number;
  brightness?: number;
}

const MAX = 6000;
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

class Cloud {
  readonly points: THREE.Points;
  private n = 0;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private sa = new Float32Array(MAX * 2);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size0 = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private gravity = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  readonly material: THREE.ShaderMaterial;

  constructor(additive: boolean) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('sa', new THREE.BufferAttribute(this.sa, 2).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `
        attribute vec2 sa; varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main(){
          vColor = color; vAlpha = sa.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(sa.x * uScale / max(-mv.z, 0.1), 900.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive
        ? `varying vec3 vColor; varying float vAlpha;
           void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 1.6) * vAlpha; gl_FragColor = vec4(vColor * a, a); }`
        : `varying vec3 vColor; varying float vAlpha;
           void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.35, d) * vAlpha; gl_FragColor = vec4(vColor, a); }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      ...(additive ? { premultipliedAlpha: true } : {}),
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    geo.setDrawRange(0, 0);
  }

  emit(origin: THREE.Vector3, e: Emit) {
    const two = Array.isArray(e.color);
    _c1.set(two ? (e.color as number[])[0] : (e.color as number));
    if (two) _c2.set((e.color as number[])[1]);
    const bright = e.brightness ?? 1;
    if (e.dir && e.spread !== undefined) {
      _axis.copy(e.dir).normalize();
      _q.setFromUnitVectors(UP, _axis);
    }
    for (let k = 0; k < e.count; k++) {
      if (this.n >= MAX) return;
      const i = this.n++;
      // direction
      if (e.dir && e.spread !== undefined) {
        const a = Math.random() * Math.PI * 2;
        const t = Math.random() * e.spread;
        _v.set(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)).applyQuaternion(_q);
      } else {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        _v.set(s * Math.cos(a), u, s * Math.sin(a));
      }
      const sp = e.speed[0] + Math.random() * (e.speed[1] - e.speed[0]);
      this.vel[i * 3] = _v.x * sp;
      this.vel[i * 3 + 1] = _v.y * sp + (e.rise ?? 0);
      this.vel[i * 3 + 2] = _v.z * sp;
      // position
      let ox = 0, oy = 0, oz = 0;
      if (e.radius) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * e.radius;
        ox = Math.cos(a) * rr;
        oz = Math.sin(a) * rr;
        oy = (Math.random() - 0.5) * e.radius * (e.flat ?? 1);
      }
      this.pos[i * 3] = origin.x + ox;
      this.pos[i * 3 + 1] = origin.y + oy;
      this.pos[i * 3 + 2] = origin.z + oz;
      const mix = two ? Math.random() : 0;
      this.col[i * 3] = (_c1.r + (_c2.r - _c1.r) * mix) * bright;
      this.col[i * 3 + 1] = (_c1.g + (_c2.g - _c1.g) * mix) * bright;
      this.col[i * 3 + 2] = (_c1.b + (_c2.b - _c1.b) * mix) * bright;
      this.life[i] = this.maxLife[i] = e.life[0] + Math.random() * (e.life[1] - e.life[0]);
      this.size0[i] = e.size[0] + Math.random() * (e.size[1] - e.size[0]);
      this.grow[i] = e.grow ?? 0.2;
      this.gravity[i] = e.gravity ?? 0;
      this.drag[i] = e.drag ?? 0;
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap the last live particle into this slot
        const l = --this.n;
        if (l !== i) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[l * 3 + k];
            this.col[i * 3 + k] = this.col[l * 3 + k];
            this.vel[i * 3 + k] = this.vel[l * 3 + k];
          }
          this.life[i] = this.life[l];
          this.maxLife[i] = this.maxLife[l];
          this.size0[i] = this.size0[l];
          this.grow[i] = this.grow[l];
          this.gravity[i] = this.gravity[l];
          this.drag[i] = this.drag[l];
        }
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.sa[i * 2] = this.size0[i] * (1 + (this.grow[i] - 1) * t);
      this.sa[i * 2 + 1] = Math.min(1, t * 8) * (1 - t * t);
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.sa.needsUpdate = true;
  }
}

interface Flash { light: THREE.PointLight; life: number; maxLife: number; peak: number }
interface Transient { mesh: THREE.Mesh; life: number; maxLife: number; tick: (t: number, mesh: THREE.Mesh) => void }

export const FX_COLORS = {
  fire: [0xff7a1a, 0xffc35a] as [number, number],
  ember: [0xff9a3a, 0xffe2a0] as [number, number],
  smoke: [0x2a2622, 0x4a4540] as [number, number],
  stone: [0x8a7f72, 0x5a524a] as [number, number],
  sand: [0xb89f78, 0x8c7a5e] as [number, number],
  wind: [0xcfe3ee, 0xffffff] as [number, number],
  force: [0xb69cff, 0xe6dcff] as [number, number],
  gloam: [0x8dff3a, 0xd9ffb0] as [number, number],
  ward: [0x9db8ff, 0xe6eeff] as [number, number],
  spray: [0xbfd0d8, 0xffffff] as [number, number],
};

export class Effects {
  readonly glow = new Cloud(true);
  readonly dust = new Cloud(false);
  private flashes: Flash[] = [];
  private transients: Transient[] = [];
  private ringGeo = new THREE.RingGeometry(0.86, 1, 48);

  constructor(private scene: THREE.Scene) {
    scene.add(this.glow.points, this.dust.points);
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 14, 1.8);
      scene.add(light);
      this.flashes.push({ light, life: 0, maxLife: 1, peak: 0 });
    }
  }

  resize(height: number, fovDeg: number) {
    const scale = height / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.glow.material.uniforms.uScale.value = scale;
    this.dust.material.uniforms.uScale.value = scale;
  }

  /** A brief coloured light. Reuses the pool's dimmest light. */
  flash(at: THREE.Vector3, color: number, intensity: number, distance = 14, life = 0.35) {
    let slot = this.flashes[0];
    for (const f of this.flashes) if (f.life < slot.life) slot = f;
    slot.light.position.copy(at);
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.life = slot.maxLife = life;
    slot.peak = intensity;
  }

  /** A flat ring that spreads over the ground and fades. */
  ring(at: THREE.Vector3, color: number, radius: number, life = 0.45, brightness = 1.6) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(brightness), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(at).setY(at.y + 0.12);
    this.addTransient(mesh, life, (t, m) => {
      const s = radius * (0.15 + 0.85 * (1 - (1 - t) * (1 - t)));
      m.scale.setScalar(s);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    });
  }

  addTransient(mesh: THREE.Mesh, life: number, tick: (t: number, mesh: THREE.Mesh) => void) {
    mesh.userData.noCollide = true;
    this.scene.add(mesh);
    tick(0, mesh);
    this.transients.push({ mesh, life, maxLife: life, tick });
  }

  // ---- presets ---------------------------------------------------------------------------

  explosion(at: THREE.Vector3, radius: number) {
    this.glow.emit(at, { count: Math.round(40 * radius), color: FX_COLORS.fire, speed: [radius * 1.2, radius * 4], life: [0.25, 0.7], size: [0.5, 1.4], drag: 3, gravity: -2, brightness: 1.6 });
    this.glow.emit(at, { count: Math.round(14 * radius), color: FX_COLORS.ember, speed: [radius * 2, radius * 6], life: [0.5, 1.3], size: [0.08, 0.2], drag: 1, gravity: 9, brightness: 2.5 });
    this.dust.emit(at, { count: Math.round(10 * radius), color: FX_COLORS.smoke, speed: [0.5, radius * 1.5], life: [0.8, 1.8], size: [1.2, 2.6], drag: 2, gravity: -1.2, grow: 2.2 });
    this.flash(at, 0xff8a3a, 60 * radius, 8 + radius * 4, 0.4);
    this.ring(at, 0xff9a4a, radius * 1.15, 0.4);
  }

  embers(at: THREE.Vector3, count = 3) {
    this.glow.emit(at, { count, color: FX_COLORS.fire, speed: [0.2, 1.2], life: [0.2, 0.5], size: [0.25, 0.6], drag: 2, gravity: -3, brightness: 1.4 });
  }

  flames(at: THREE.Vector3, radius: number, count: number) {
    this.glow.emit(at, { count, color: FX_COLORS.fire, speed: [0.2, 1], life: [0.35, 0.8], size: [0.5, 1.2], radius, flat: 0.1, rise: 2.2, drag: 1.5, gravity: -2, brightness: 1.2 });
  }

  rubble(at: THREE.Vector3, amount = 1, up = 5) {
    this.dust.emit(at, { count: Math.round(18 * amount), color: FX_COLORS.stone, speed: [1, 5], life: [0.5, 1.1], size: [0.12, 0.34], gravity: 16, rise: up, grow: 1 });
    this.dust.emit(at, { count: Math.round(10 * amount), color: FX_COLORS.sand, speed: [0.5, 2.5], life: [0.7, 1.5], size: [1, 2.2], drag: 2.5, gravity: -0.6, grow: 2.4 });
  }

  gust(at: THREE.Vector3, dir: THREE.Vector3, count = 30, speed = 22) {
    this.dust.emit(at, { count, color: FX_COLORS.wind, speed: [speed * 0.5, speed], life: [0.25, 0.6], size: [0.25, 0.7], dir, spread: 0.35, drag: 2.5, grow: 2 });
  }

  gloamPuff(at: THREE.Vector3, amount = 1) {
    this.glow.emit(at, { count: Math.round(26 * amount), color: FX_COLORS.gloam, speed: [0.6, 3.5], life: [0.4, 1.1], size: [0.2, 0.6], drag: 2, gravity: -1.5, radius: 0.4, brightness: 1.3 });
    this.dust.emit(at, { count: Math.round(10 * amount), color: [0x0c120c, 0x1c2a1c], speed: [0.4, 1.8], life: [0.6, 1.4], size: [0.8, 1.8], drag: 2, gravity: -0.8, radius: 0.4, grow: 2 });
  }

  spark(at: THREE.Vector3, color: [number, number], count = 10, speed = 5) {
    this.glow.emit(at, { count, color, speed: [speed * 0.3, speed], life: [0.15, 0.45], size: [0.1, 0.3], drag: 3, gravity: 4, brightness: 2 });
  }

  update(dt: number) {
    this.glow.update(dt);
    this.dust.update(dt);
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        const t = Math.max(0, f.life / f.maxLife);
        f.light.intensity = f.peak * t * t;
      } else {
        f.light.intensity = 0;
      }
    }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const tr = this.transients[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        const m = tr.mesh.material as THREE.Material;
        m.dispose();
        this.transients.splice(i, 1);
      } else {
        tr.tick(1 - tr.life / tr.maxLife, tr.mesh);
      }
    }
  }
}
