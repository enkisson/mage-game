// Gloamtide palette. One source of truth for look-dev and, later, the game.
export const PAL = {
  // sky and atmosphere
  night: 0x0b0a1a,
  skyTop: 0x05041a,
  skyMid: 0x1a1344,
  horizon: 0x57307f,
  fog: 0x1c1440,
  moon: 0xd6e2ff,

  // sanctum stone
  stone0: 0x2c2947,
  stone1: 0x38345c,
  stone2: 0x464170,
  stone3: 0x5a548c,
  grout: 0x14122a,

  // the Gloam (enemies): dusk hide, pale bone, toxic glow
  hide: 0x51436f,
  hideDark: 0x352b52,
  bone: 0xe2dbc6,
  boneShade: 0xa69e88,
  gloam: 0x8dff3a,

  // schools of magic
  fire: 0xff7a1a,
  fireCore: 0xffd98a,
  frost: 0x62d8ff,
  frostCore: 0xe8fbff,
  storm: 0xa97bff,
  stormCore: 0xf1e8ff,
  ward: 0x9db8ff,

  // the Warden (player)
  robe: 0x27408f,
  robeDark: 0x172052,
  gold: 0xe0a93f,
  leather: 0x3a2b26,
  skin: 0xc79a7c,
  wood: 0x503729,
  iron: 0x4b4c66,
  silver: 0xc4cce0,
};

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
