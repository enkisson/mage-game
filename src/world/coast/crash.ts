// Storm waves breaking on the rock. Spots along the headland's sea face, on the sea stacks and
// on the bigger skerries each fire a burst every few seconds: a wave hits, white spray is thrown
// up the face fast, slows, spreads and drifts inland on the wind, thinning to mist. A low band
// of grey mist breathes along every rock foot between the bursts.
import * as THREE from 'three';
import { mistTexture } from './airfx';
import { BAY, OUTLINE, groundHeight } from './layout';
import { SEA_ROCKS } from './searocks-data';

const WIND = new THREE.Vector3(0.35, 0, -0.2);

function rng(seed: number) {
  let s = (Math.floor(seed * 9973) % 2147483647) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

interface Puff { s: THREE.Sprite; m: THREE.SpriteMaterial; f: number; delay: number; jx: number; jz: number; size: number; op: number; spin: number; out: number }
interface Spot { x: number; z: number; nx: number; nz: number; H: number; period: number; off: number; dur: number; puffs: Puff[]; on: boolean }
interface Mist { s: THREE.Sprite; m: THREE.SpriteMaterial; x: number; y: number; z: number; w: number; h: number; op: number; period: number; phase: number }

export function buildCrash(): { group: THREE.Group; update(time: number): void } {
  const group = new THREE.Group();
  group.name = 'crash';
  const tex = mistTexture();
  const spots: Spot[] = [];
  const mists: Mist[] = [];
  const r = rng(4242);

  const addMist = (x: number, z: number, w: number, h: number, op: number, grey: number) => {
    const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(grey, grey * 1.03, grey * 1.06), transparent: true, depthWrite: false, fog: true, opacity: op });
    m.rotation = r() * 6.28;
    const s = new THREE.Sprite(m);
    s.renderOrder = 6;
    group.add(s);
    mists.push({ s, m, x, y: h * 0.45 + 0.2, z, w, h, op, period: 5 + r() * 5, phase: r() * 6.28 });
  };

  const addSpot = (x: number, z: number, nx: number, nz: number, H: number, count: number) => {
    const period = 5 + r() * 6;
    const spot: Spot = { x, z, nx, nz, H, period, off: r() * period, dur: 3 + H * 0.08 + r(), puffs: [], on: false };
    for (let i = 0; i < count; i++) {
      const f = Math.pow(r(), 0.7);
      const white = 0.92 - f * 0.22 - r() * 0.04;
      const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(white * 0.97, white, white * 1.03), transparent: true, depthWrite: false, fog: true, opacity: 0 });
      m.rotation = r() * 6.28;
      const s = new THREE.Sprite(m);
      s.renderOrder = 8;
      s.visible = false;
      group.add(s);
      const size = (2.2 + H * 0.16) * (0.45 + f * f * 1.3) * (0.7 + r() * 0.6);
      spot.puffs.push({ s, m, f, delay: r() * 0.18 * (0.4 + f), jx: (r() - 0.5) * (2 + H * 0.35), jz: (r() - 0.5) * (2 + H * 0.35), size, op: Math.min(0.95, (1.0 - f * 0.45) * (0.75 + r() * 0.25)), spin: (r() - 0.5) * 0.6, out: 0.3 + r() * 0.7 });
    }
    spots.push(spot);
  };

  // 1. the cliff foot standing in the sea
  let carry = 0;
  for (let i = 0; i < OUTLINE.length - 1; i++) {
    const a = OUTLINE[i], b = OUTLINE[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
    const nx = -tz, nz = tx;
    for (let t = carry; t < len; t += 5) {
      const x = a[0] + tx * t, z = a[1] + tz * t;
      if (groundHeight(x + nx * 3, z + nz * 3) > 0.3) continue;
      // a low band of mist hugging the waterline
      addMist(x + nx * 2.5 + (r() - 0.5) * 2, z + nz * 2.5 + (r() - 0.5) * 2, 10 + r() * 6, 3.5 + r() * 4, 0.5 + r() * 0.15, 0.66 + r() * 0.1);
      if (r() < 0.45) addMist(x + nx * 4, z + nz * 4, 12 + r() * 6, 3 + r() * 2.5, 0.35, 0.68);
      if (Math.floor(t / 5) % 2 === 0 && r() < 0.95) addSpot(x + nx * 1.2, z + nz * 1.2, nx, nz, 6 + Math.pow(r(), 1.3) * 16, 26);
    }
    carry = 0;
  }

  // 2. stacks and big sea rocks: a spot or two on the seaward-and-sides, mist all round
  const rocks = [...BAY.stacks.map((s) => ({ x: s.x, z: s.z, r: s.r, h: s.h, stack: true })), ...SEA_ROCKS.filter((s) => s.r > 2.5).map((s) => ({ ...s, stack: false }))];
  for (const k of rocks) {
    const n = k.r > 8 ? 3 : k.r > 4 ? 2 : 1;
    const base = r() * 6.28;
    for (let j = 0; j < n; j++) {
      const ang = base + j * (6.28 / n);
      const nx = Math.cos(ang), nz = Math.sin(ang);
      const H = k.stack ? Math.min(6 + k.r * 1.2 + r() * 5, 15) : Math.min(4 + k.r * 1.6 + r() * 5, 25);
      addSpot(k.x + nx * k.r * 0.95, k.z + nz * k.r * 0.95, nx, nz, H, 38);
    }
    const nm = Math.min(7, 3 + Math.round(k.r * 0.5));
    for (let j = 0; j < nm; j++) {
      const ang = (j / nm) * 6.28 + r();
      const rr = k.r * (1 + r() * 0.3);
      addMist(k.x + Math.cos(ang) * rr, k.z + Math.sin(ang) * rr, 7 + k.r * 1.2, 3 + r() * 3.5, 0.5, 0.66 + r() * 0.1);
    }
  }

  const ease = (q: number) => 1 - Math.pow(1 - q, 2.6);

  function update(time: number) {
    for (const sp of spots) {
      const t = (time + sp.off) % sp.period;
      const on = t < sp.dur;
      if (!on) {
        if (sp.on) { for (const p of sp.puffs) p.s.visible = false; sp.on = false; }
        continue;
      }
      sp.on = true;
      const u = t / sp.dur;
      for (const p of sp.puffs) {
        const q = (u - p.delay) / (1 - p.delay);
        if (q <= 0) { p.s.visible = false; continue; }
        p.s.visible = true;
        const e = ease(q);
        const rise = sp.H * (0.12 + 0.88 * p.f) * e - sp.H * 0.1 * p.f * q * q * q;
        const away = (0.8 + p.f * sp.H * 0.12 * p.out) * e + q * sp.H * 0.12 * p.out;
        const drift = q * (1.5 + sp.H * 0.7) * (0.4 + p.f);
        const side = (1 - 0.3 * q) * 0.5;
        p.s.position.set(
          sp.x + sp.nx * away + p.jx * side * (0.4 + q) + WIND.x * drift,
          0.4 + rise,
          sp.z + sp.nz * away + p.jz * side * (0.4 + q) + WIND.z * drift,
        );
        const grow = 0.5 + q * 1.1 + e * 0.4;
        const tall = 1.5 - Math.min(1, q * 1.6) * 0.5;
        p.s.scale.set(p.size * grow * 0.9, p.size * grow * tall, 1);
        p.m.opacity = p.op * Math.min(1, q * 9) * Math.pow(1 - q, 1.4);
        p.m.rotation += p.spin * 0.016;
      }
    }
    for (const m of mists) {
      const b = 0.85 + 0.15 * Math.sin(time / m.period * 6.28 + m.phase);
      m.s.position.set(m.x + Math.sin(time * 0.1 + m.phase) * 0.6, m.y * (0.9 + 0.2 * b), m.z);
      m.s.scale.set(m.w * (0.95 + 0.1 * b), m.h * (0.9 + 0.2 * b), 1);
      m.m.opacity = m.op * b;
    }
  }
  update(0);
  return { group, update };
}
