// Shot list. Each shot builds a scene and returns the stage to render.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { createStage } from './stage.js';
import { mat, part, shadows, halo } from './kit.js';
import { BESTIARY, husk, spitter, brute, wraith, bloater, tidecaller, gloamBolt } from './gloam.js';
import { buildSanctum } from './arena.js';
import { viewmodel, emberBolt, frostLance, iceBurst, emberBurst, chainLightning, staff, wardenFigure, SCHOOLS } from './warden.js';
import { hud, draftScreen, titleScreen, labels, heading } from './overlays.js';

/** Neutral turntable: dark backdrop, cool key, hard rim, so silhouettes read. */
function studio(stage, { floor = true, radius = 3 } = {}) {
  const { scene } = stage;
  scene.background = new THREE.Color(0x0d0b20);
  scene.fog = new THREE.Fog(0x0d0b20, 30, 90);
  scene.add(new THREE.HemisphereLight(0x5a55a8, 0x1a1030, 1.1));

  const key = new THREE.DirectionalLight(0xbfd0ff, 2.6);
  key.position.set(-6, 9, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = 14;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 40 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9a7bff, 3.2);
  rim.position.set(7, 6, -9);
  scene.add(rim);
  const kick = new THREE.DirectionalLight(0x4fd0ff, 1.2);
  kick.position.set(-8, 3, -6);
  scene.add(kick);

  if (floor) {
    const disc = part(new THREE.CylinderGeometry(radius, radius * 1.04, 0.3, 10), mat(PAL.stone1), [0, -0.15, 0]);
    disc.receiveShadow = true;
    scene.add(disc);
    const ground = part(new THREE.CircleGeometry(80, 40), mat(0x100e24), [0, -0.3, 0], [-Math.PI / 2, 0, 0]);
    ground.receiveShadow = true;
    scene.add(ground);
  }
}

function creatureShot(entry) {
  return ({ width, height }) => {
    const stage = createStage(width, height);
    studio(stage, { radius: Math.max(1.4, entry.height * 0.55) });
    const model = entry.build();
    model.rotation.y = -0.45;
    model.position.y = entry.hover || 0;
    stage.scene.add(model);
    const h = entry.height + (entry.hover || 0);
    stage.camera.fov = 30;
    stage.camera.position.set(0, h * 0.62, h * 2.55);
    stage.camera.lookAt(0, h * 0.5, 0);
    stage.camera.updateProjectionMatrix();
    return stage;
  };
}

/** Place a creature at x,z facing a point. */
function put(scene, obj, x, z, faceX = 0, faceZ = 0, y = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = Math.atan2(faceX - x, faceZ - z);
  scene.add(obj);
  return obj;
}

/** Screen-space position (px) of a world point. */
function toScreen(camera, v, width, height) {
  const p = new THREE.Vector3(...v).project(camera);
  return [(p.x * 0.5 + 0.5) * width, (-p.y * 0.5 + 0.5) * height];
}

/** The wave mid-fight from the Warden's eyes. Shared by keyart (with HUD) and draft (blurred). */
function battle(stage) {
  const { scene, camera } = stage;
  const arena = buildSanctum(scene, { rifts: [0, 1, 3] });
  camera.fov = 70;
  camera.position.set(1.2, 1.7, -3.2);
  camera.lookAt(-0.4, 2.3, -26);
  camera.updateProjectionMatrix();
  const eye = [1.2, -3.2];

  // the pack pouring out of the north rift
  const pack = [
    [-1.4, -8.6, 0.35, 1], [2.4, -10.2, 0.25, -1], [-4.2, -12.0, 0.15, 1], [0.4, -13.4, 0.2, -1],
    [4.4, -15.5, 0.2, 1], [-2.4, -17.5, 0.15, -1], [1.8, -19.8, 0.1, 1], [-0.8, -22.4, 0.1, -1],
  ];
  pack.forEach(([x, z, reach, stride], i) => put(scene, husk(i + 1, { reach, stride }), x, z, eye[0], eye[1]));
  put(scene, brute(7), -5.8, -17.5, eye[0], eye[1]);
  put(scene, spitter(3), 8.0, -13.5, eye[0], eye[1]);
  put(scene, bloater(9), 5.4, -9.4, eye[0], eye[1]);
  const w = put(scene, wraith(5), -4.6, -10.5, eye[0], eye[1], 2.6);
  w.rotation.x = 0.25;

  // spells in flight
  const eb = emberBolt();
  eb.position.set(0.9, 1.45, -6.0);
  eb.lookAt(-1.4, 1.1, -8.6);
  scene.add(eb);
  const fl = frostLance();
  fl.position.set(-2.4, 2.6, -7.2);
  fl.lookAt(-4.6, 3.6, -10.5);
  scene.add(fl);
  const ice = iceBurst(8, 1.1);
  ice.position.set(-4.2, 0, -12.0);
  scene.add(ice);
  const burst = emberBurst(6, 0.9);
  burst.position.set(2.4, 1.0, -10.2);
  scene.add(burst);
  const gb = gloamBolt();
  gb.position.set(5.6, 2.8, -9.4);
  gb.lookAt(eye[0], 1.6, eye[1]);
  scene.add(gb);

  camera.add(viewmodel('ember', { casting: 'rime' }));
  return { arena, hits: { ember: [-1.4, 1.6, -8.6], burst: [2.4, 1.9, -10.2], ice: [-4.2, 1.7, -12.0], crit: [-4.6, 5.0, -10.5] } };
}

export const SHOTS = {};
for (const entry of BESTIARY) SHOTS[entry.id] = creatureShot(entry);

SHOTS.keyart = async ({ width, height, frame, params }) => {
  const stage = createStage(width, height, { exposure: 1.1, bloom: [0.65, 0.5, 1.0] });
  const { hits } = battle(stage);
  stage.render();
  if (params.get('hud') !== '0') {
    const pt = (v) => toScreen(stage.camera, v, width, height);
    await hud(frame, { width, numbers: [
      { at: pt(hits.ember), text: '48', kind: 'fire' },
      { at: pt(hits.burst), text: '112', kind: 'crit' },
      { at: pt(hits.ice), text: 'Chilled', kind: 'frost' },
      { at: pt(hits.crit), text: '37', kind: 'frost' },
    ] });
  }
  return stage;
};

SHOTS.vm = ({ width, height }) => {
  const stage = createStage(width, height);
  studio(stage, { floor: false });
  stage.camera.fov = 70;
  stage.camera.updateProjectionMatrix();
  stage.camera.add(viewmodel('ember', { casting: 'rime' }));
  return stage;
};

SHOTS.arena = ({ width, height, frame }) => {
  const stage = createStage(width, height, { exposure: 1.25, bloom: [0.6, 0.5, 1.0] });
  const { scene, camera } = stage;
  const { braziers } = buildSanctum(scene, { rifts: [0, 1, 3] });
  put(scene, wardenFigure('ember'), 4.5, 8.5, 0, -27);
  [[-2, -16], [1.5, -18], [-0.5, -20.5], [3, -21.5], [-3.5, -22]].forEach(([x, z], i) => put(scene, husk(i + 3, { reach: 0.1, stride: i % 2 ? 1 : -1 }), x, z, 0, 0));
  put(scene, brute(7), 17, -2, 0, 0);
  put(scene, spitter(3), 19.5, 3.5, 0, 0);
  put(scene, wraith(5), -18, 3, 0, 0, 3.2);
  put(scene, husk(9), -20, -2.5, 0, 0);
  camera.fov = 46;
  camera.position.set(21, 14.5, 26);
  camera.lookAt(-1, 0.5, -3);
  camera.updateProjectionMatrix();
  stage.render();
  const pt = (v) => toScreen(camera, v, width, height);
  // label the brazier that sits furthest left while still comfortably in frame
  const lit = braziers.map((b) => ({ b, s: pt([b.x, b.y + 2.6, b.z]) }))
    .filter(({ s }) => s[0] > width * 0.08 && s[0] < width * 0.92 && s[1] > height * 0.15 && s[1] < height * 0.9)
    .sort((a, b) => a.s[0] - b.s[0])[0];
  labels(frame, { width, cls: 'callouts', items: [
    { at: pt([0, 7.0, -27.5]), title: 'Rift', sub: 'Waves pour through' },
    { at: pt([-27.5, 7.0, 0]), title: 'Rift', sub: 'Opens on Night II' },
    { at: pt([0, 6.0, 0]), title: 'Wellspring', sub: 'Boons between waves' },
    { at: pt([4.5, 2.4, 8.5]), title: 'Warden', sub: 'You', kind: 'warden' },
    ...(lit ? [{ at: lit.s, title: 'Brazier', sub: 'Light in the dark', kind: 'fire' }] : []),
  ] });
  return stage;
};

SHOTS.lineup = ({ width, height, frame }) => {
  const stage = createStage(width, height, { exposure: 1.15 });
  const { scene, camera } = stage;
  studio(stage, { floor: false });
  const roster = [
    { x: 0, make: () => wardenFigure('ember'), title: 'Warden', sub: 'You', stat: '1.8 m · 120 HP + 60 Ward', kind: 'warden' },
    { x: 2.5, make: () => husk(1, { reach: 0.2 }), title: 'Husk', sub: 'Swarm', stat: '1.3 m · 30 HP · fast' },
    { x: 5.2, make: () => bloater(9), title: 'Bloater', sub: 'Bomb', stat: '1.6 m · 60 HP · bursts' },
    { x: 8.2, make: () => spitter(3), title: 'Spitter', sub: 'Ranged', stat: '2.4 m · 55 HP · 25 m lob' },
    { x: 11.3, make: () => wraith(5), y: 0.9, title: 'Wraith', sub: 'Flyer', stat: '2.5 m · 45 HP · dives' },
    { x: 15.0, make: () => brute(7), title: 'Brute', sub: 'Tank', stat: '3.2 m · 400 HP · charges' },
    { x: 21.0, make: () => tidecaller(11), title: 'The Tidecaller', sub: 'Boss · Night III', stat: '7.1 m · 4000 HP' },
  ];
  const plinth = part(new THREE.BoxGeometry(30, 0.4, 6), mat(PAL.stone1), [10.5, -0.2, 0]);
  plinth.receiveShadow = true;
  scene.add(plinth);
  for (const r of roster) {
    const m = r.make();
    m.position.set(r.x, r.y || 0, 0);
    m.rotation.y = -0.35;
    scene.add(m);
  }
  camera.fov = 20;
  camera.position.set(10.5, 4.2, 36);
  camera.lookAt(10.5, 3.0, 0);
  camera.updateProjectionMatrix();
  stage.render();
  labels(frame, { width, items: roster.map((r) => {
    const [x, y] = toScreen(camera, [r.x, -0.4, 3], width, height);
    return { at: [x, y + 10], title: r.title, sub: r.sub, stat: r.stat, kind: r.kind };
  }) });
  heading(frame, { width, title: 'The Gloam', sub: 'Bestiary · to scale' });
  return stage;
};

SHOTS.staves = ({ width, height, frame }) => {
  const stage = createStage(width, height, { exposure: 1.1 });
  const { scene, camera } = stage;
  studio(stage, { floor: false });
  const xs = { ember: -2.2, rime: 0, tempest: 2.2 };
  for (const [school, x] of Object.entries(xs)) {
    const st = staff(school);
    st.position.set(x - 0.35, 0, 0);
    st.rotation.set(0, 0.4, 0.06);
    scene.add(st);
    const plinth = part(new THREE.CylinderGeometry(0.42, 0.48, 0.18, 8), mat(PAL.stone2), [x - 0.35, -0.09, 0]);
    plinth.receiveShadow = true;
    scene.add(plinth);
  }
  const eb = emberBolt();
  eb.position.set(-1.35, 1.05, 0.3);
  eb.lookAt(-0.4, 1.25, 2);
  scene.add(eb);
  const fl = frostLance();
  fl.position.set(0.85, 1.1, 0.2);
  fl.lookAt(1.6, 1.3, 2.5);
  scene.add(fl);
  scene.add(chainLightning([[1.9, 1.6, 0.05], [2.55, 1.4, 0.35], [2.75, 1.0, 0.1], [3.05, 0.75, 0.35]]));
  for (const p of [[2.55, 1.4, 0.35], [2.75, 1.0, 0.1], [3.05, 0.75, 0.35]]) {
    const shard = part(new THREE.OctahedronGeometry(0.05, 0), mat(PAL.bone), p);
    scene.add(shard);
  }
  const floorDisc = part(new THREE.CircleGeometry(30, 40), mat(0x100e24), [0, -0.18, 0], [-Math.PI / 2, 0, 0]);
  floorDisc.receiveShadow = true;
  scene.add(floorDisc);
  camera.fov = 30;
  camera.position.set(0, 1.6, 7.2);
  camera.lookAt(0, 1.05, 0);
  camera.updateProjectionMatrix();
  stage.render();
  const info = {
    ember: ['Cinderbrand', 'Ember · Burn and splash', 'fire'],
    rime: ['Rimefang', 'Rime · Pierce and chill', 'frost'],
    tempest: ['Thundercoil', 'Tempest · Chain and stun', 'storm'],
  };
  labels(frame, { width, items: Object.entries(xs).map(([school, x]) => {
    const [px, py] = toScreen(camera, [x - 0.2, -0.2, 0.6], width, height);
    return { at: [px, py + 6], title: info[school][0], sub: info[school][1], kind: info[school][2] };
  }) });
  heading(frame, { width, title: 'Staves', sub: 'Three schools · one starting staff per run' });
  return stage;
};

SHOTS.draft = async ({ width, height, frame }) => {
  const stage = createStage(width, height, { exposure: 1.15 });
  const { scene, camera } = stage;
  buildSanctum(scene, { rifts: [0, 1, 3] });
  camera.fov = 62;
  camera.position.set(0.8, 1.7, 7.5);
  camera.lookAt(0, 2.6, 0);
  camera.updateProjectionMatrix();
  stage.render();
  stage.renderer.domElement.style.filter = 'blur(5px) saturate(1.1)';
  await draftScreen(frame, { width });
  return stage;
};

SHOTS.title = async ({ width, height, frame }) => {
  const stage = createStage(width, height, { exposure: 1.15, bloom: [0.75, 0.55, 1.0] });
  const { scene, camera } = stage;
  buildSanctum(scene, { rifts: [0, 1, 3], wellspringOn: false });
  const boss = tidecaller(11);
  boss.scale.setScalar(4.4);
  boss.position.set(0, -13, -54);
  scene.add(boss);
  const bossLight = new THREE.PointLight(PAL.gloam, 120, 24, 1.6);
  bossLight.position.set(0, 14, -40);
  scene.add(bossLight);
  put(scene, wardenFigure('ember'), 0.6, 7.2, 0, -27);
  [[-0.5, -18], [2.5, -16.5], [4.5, -19], [1, -21]].forEach(([x, z], i) => put(scene, husk(i + 11, { reach: 0.25, stride: i % 2 ? 1 : -1 }), x, z, 2.6, 7.5));
  camera.fov = 50;
  camera.position.set(-2, 1.4, 14);
  camera.lookAt(-8.5, 7.5, -27);
  camera.updateProjectionMatrix();
  stage.render();
  await titleScreen(frame, { width });
  return stage;
};
