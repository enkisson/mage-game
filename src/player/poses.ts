// The library of hand poses and cast gestures.
// Every pose is written for the right arm in camera space (x right, y up, -z forward);
// the left arm mirrors it. Springs carry the hands between poses, so a gesture is only a
// short list of beats to pass through.
import type { SigilId } from '../magic/sigils';
import type { Effect } from '../magic/grammar';
import type { ArmPose, Beat } from './hands';

/** Hands down, loose, just in view. */
export const IDLE: ArmPose = { at: [0.27, -0.36, -0.43], fingers: [-0.2, 0.42, -0.88], palm: [-0.9, -0.2, 0.1], shape: 'relaxed' };

/** The sign each sigil is held in while the sentence is being spoken. */
export const HOLD: Record<SigilId, ArmPose> = {
  // cupped upward, a coal in the palm
  fire: { at: [0.21, -0.25, -0.5], fingers: [-0.32, 0.22, -0.92], palm: [-0.1, 1, 0.12], shape: 'cup' },
  // a fist, knuckles to the sky
  stone: { at: [0.22, -0.26, -0.47], fingers: [-0.12, 0.9, -0.42], palm: [-1, 0, 0.1], shape: 'fist' },
  // two fingers raised
  wind: { at: [0.22, -0.27, -0.5], fingers: [-0.14, 0.93, -0.33], palm: [-0.75, 0, -0.66], shape: 'two' },
  // flat palm drawn back, ready to shove
  push: { at: [0.23, -0.24, -0.4], fingers: [-0.08, 0.96, -0.26], palm: [-0.15, -0.26, -0.95], shape: 'flat' },
  // not built yet: sensible stand-ins
  ice: { at: [0.21, -0.25, -0.5], fingers: [-0.2, 0.3, -0.93], palm: [0, -1, -0.1], shape: 'splay' },
  pull: { at: [0.22, -0.25, -0.5], fingers: [-0.1, 0.5, -0.86], palm: [-0.2, 0.3, 0.93], shape: 'claw' },
  bind: { at: [0.22, -0.25, -0.5], fingers: [-0.1, 0.9, -0.4], palm: [-0.9, 0, -0.4], shape: 'cup' },
  break: { at: [0.22, -0.25, -0.5], fingers: [-0.1, 0.4, -0.9], palm: [-1, 0, 0], shape: 'flat' },
};

export type GestureName = 'thrust' | 'hurl' | 'slash' | 'shove' | 'sweep' | 'press' | 'raise' | 'loft';

/** Which motion delivers a spell. */
export function gestureFor(effect: Effect): GestureName {
  switch (effect.kind) {
    case 'bolt': return effect.visual === 'stone' ? 'hurl' : 'thrust';
    case 'lance': return 'slash';
    case 'cone': return 'shove';
    case 'ring': return 'sweep';
    case 'zone': return 'press';
    case 'pillar': return 'raise';
    case 'updraft': return 'loft';
  }
}

// Shared end positions, so the two-handed versions line up.
const OUT: ArmPose = { at: [0.14, -0.15, -0.62], fingers: [0.02, 0.93, -0.36], palm: [0.05, -0.3, -0.95], shape: 'splay' };
const OUT_SETTLE: ArmPose = { at: [0.17, -0.2, -0.56], fingers: [0, 0.9, -0.44], palm: [0.02, -0.36, -0.93], shape: 'relaxed' };

/**
 * Cast gestures. `lead` is the hand holding the first word (the left); `other` is the
 * second hand, which joins in when the sentence has two words.
 */
export const GESTURES: Record<GestureName, Beat[]> = {
  // palm snaps out toward the target and opens
  thrust: [
    { t: 0, ease: 0.045, lead: OUT, other: OUT },
    { t: 0.13, ease: 0.15, lead: OUT_SETTLE, other: OUT_SETTLE },
  ],
  // a rock is thrown overhand: up and back, then down through the target
  hurl: [
    { t: 0, ease: 0.05, lead: { at: [0.27, -0.06, -0.42], fingers: [-0.05, 0.85, 0.5], palm: [-0.3, 0.5, -0.8], shape: 'fist' } },
    { t: 0.09, ease: 0.05, lead: { at: [0.15, -0.21, -0.66], fingers: [-0.05, 0.25, -0.97], palm: [-0.1, -0.95, -0.25], shape: 'splay' } },
    { t: 0.24, ease: 0.16, lead: { at: [0.17, -0.28, -0.62], fingers: [-0.1, 0.2, -0.97], palm: [-0.3, -0.9, -0.1], shape: 'relaxed' } },
  ],
  // two fingers cut across the body, outside to in
  slash: [
    { t: 0, ease: 0.04, lead: { at: [0.36, -0.1, -0.5], fingers: [0.35, 0.55, -0.76], palm: [-0.5, -0.6, -0.6], shape: 'two' } },
    { t: 0.07, ease: 0.055, lead: { at: [-0.04, -0.2, -0.62], fingers: [-0.62, 0.2, -0.76], palm: [-0.3, -0.9, 0.3], shape: 'two' } },
    { t: 0.22, ease: 0.16, lead: { at: [0.06, -0.27, -0.56], fingers: [-0.5, 0.25, -0.83], palm: [-0.4, -0.85, 0.2], shape: 'relaxed' } },
  ],
  // both palms driven forward, arms straightening
  shove: [
    { t: 0, ease: 0.05, lead: { at: [0.16, -0.14, -0.66], fingers: [0.06, 0.96, -0.26], palm: [0.04, -0.24, -0.97], shape: 'flat' }, other: { at: [0.16, -0.14, -0.66], fingers: [0.06, 0.96, -0.26], palm: [0.04, -0.24, -0.97], shape: 'flat' } },
    { t: 0.14, ease: 0.16, lead: OUT_SETTLE, other: OUT_SETTLE },
  ],
  // arms cross low, then fling wide: everything near is thrown outward
  sweep: [
    { t: 0, ease: 0.05, lead: { at: [0.04, -0.24, -0.5], fingers: [-0.7, 0.3, -0.65], palm: [0.5, -0.3, -0.8], shape: 'fist' }, other: { at: [0.04, -0.28, -0.46], fingers: [-0.7, 0.3, -0.65], palm: [0.5, -0.3, -0.8], shape: 'fist' } },
    { t: 0.08, ease: 0.06, lead: { at: [0.36, -0.13, -0.52], fingers: [0.62, 0.55, -0.56], palm: [0.5, -0.62, -0.6], shape: 'splay' }, other: { at: [0.36, -0.13, -0.52], fingers: [0.62, 0.55, -0.56], palm: [0.5, -0.62, -0.6], shape: 'splay' } },
    { t: 0.26, ease: 0.18, lead: { at: [0.33, -0.25, -0.47], fingers: [0.3, 0.4, -0.86], palm: [0.1, -0.8, -0.55], shape: 'relaxed' }, other: { at: [0.33, -0.25, -0.47], fingers: [0.3, 0.4, -0.86], palm: [0.1, -0.8, -0.55], shape: 'relaxed' } },
  ],
  // palms pressed down and forward onto the ground ahead
  press: [
    { t: 0, ease: 0.07, lead: { at: [0.17, -0.2, -0.7], fingers: [0.02, 0.22, -0.97], palm: [0, -0.97, -0.24], shape: 'splay' }, other: { at: [0.17, -0.2, -0.7], fingers: [0.02, 0.22, -0.97], palm: [0, -0.97, -0.24], shape: 'splay' } },
    { t: 0.2, ease: 0.17, lead: { at: [0.19, -0.27, -0.62], fingers: [0, 0.2, -0.98], palm: [0, -0.97, -0.2], shape: 'relaxed' }, other: { at: [0.19, -0.27, -0.62], fingers: [0, 0.2, -0.98], palm: [0, -0.97, -0.2], shape: 'relaxed' } },
  ],
  // hooked fingers dig low, then haul the ground up
  raise: [
    { t: 0, ease: 0.06, lead: { at: [0.2, -0.36, -0.52], fingers: [-0.05, 0.1, -0.99], palm: [0, 0.98, 0.15], shape: 'claw' }, other: { at: [0.2, -0.36, -0.52], fingers: [-0.05, 0.1, -0.99], palm: [0, 0.98, 0.15], shape: 'claw' } },
    { t: 0.1, ease: 0.1, lead: { at: [0.21, -0.09, -0.53], fingers: [-0.05, 0.75, -0.66], palm: [-0.1, 0.55, 0.83], shape: 'fist' }, other: { at: [0.21, -0.09, -0.53], fingers: [-0.05, 0.75, -0.66], palm: [-0.1, 0.55, 0.83], shape: 'fist' } },
    { t: 0.42, ease: 0.2, lead: { at: [0.22, -0.18, -0.5], fingers: [-0.08, 0.7, -0.7], palm: [-0.4, 0.4, 0.8], shape: 'relaxed' }, other: { at: [0.22, -0.18, -0.5], fingers: [-0.08, 0.7, -0.7], palm: [-0.4, 0.4, 0.8], shape: 'relaxed' } },
  ],
  // open hands swept upward, fingers wide, throwing the air into the sky
  loft: [
    { t: 0, ease: 0.05, lead: { at: [0.19, -0.34, -0.55], fingers: [-0.02, 0.1, -0.99], palm: [0, 0.98, 0.1], shape: 'flat' }, other: { at: [0.19, -0.34, -0.55], fingers: [-0.02, 0.1, -0.99], palm: [0, 0.98, 0.1], shape: 'flat' } },
    { t: 0.08, ease: 0.075, lead: { at: [0.27, -0.05, -0.58], fingers: [0.1, 0.9, -0.42], palm: [-0.2, 0.42, 0.88], shape: 'splay' }, other: { at: [0.27, -0.05, -0.58], fingers: [0.1, 0.9, -0.42], palm: [-0.2, 0.42, 0.88], shape: 'splay' } },
    { t: 0.34, ease: 0.2, lead: { at: [0.25, -0.12, -0.5], fingers: [0, 0.8, -0.6], palm: [-0.5, 0.3, 0.8], shape: 'relaxed' }, other: { at: [0.25, -0.12, -0.5], fingers: [0, 0.8, -0.6], palm: [-0.5, 0.3, 0.8], shape: 'relaxed' } },
  ],
};

/** How long after its last beat a gesture hands the arms back to idle. */
export const GESTURE_TAIL = 0.06;
