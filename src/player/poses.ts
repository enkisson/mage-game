// The library of hand poses and cast gestures.
// Every pose is written for the right arm in camera space (x right, y up, -z forward);
// the left arm mirrors it. Springs carry the hands between poses, so a motion is only a
// short list of beats to pass through. Every cast begins with a wind-up and lands on its
// strike, which is when the spell itself leaves the hands.
import type { SigilId } from '../magic/sigils';
import type { Effect } from '../magic/grammar';
import type { ArmBeat, ArmPose, Beat } from './hands';

/** Hands down, loose, just in view. */
export const IDLE: ArmPose = { at: [0.27, -0.36, -0.43], fingers: [-0.2, 0.42, -0.88], palm: [-0.9, -0.2, 0.1], shape: 'relaxed' };

/** The off hand, drawn back and half closed, while the other one casts alone. */
export const BRACE: ArmPose = { at: [0.31, -0.39, -0.36], fingers: [-0.25, 0.55, -0.8], palm: [-0.85, -0.4, 0.2], shape: 'gather' };

/** Fingers flicked open, letting an unfinished sentence fall. */
export const LET_GO: ArmPose = { at: [0.27, -0.33, -0.46], fingers: [-0.15, 0.3, -0.94], palm: [-0.6, -0.75, 0.1], shape: 'splay' };

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

/** The small motion that makes each sign: what the hand does on its way into the hold. */
const FORM: Partial<Record<SigilId, ArmPose>> = {
  // fingers pinched as if to snap, then they open and the flame is there
  fire: { at: [0.23, -0.31, -0.45], fingers: [-0.3, 0.34, -0.89], palm: [-0.55, 0.78, 0.1], shape: 'pinch' },
  // an open hand reaches down for the weight, then closes on it
  stone: { at: [0.24, -0.32, -0.5], fingers: [-0.1, 0.62, -0.78], palm: [-0.85, -0.45, 0.05], shape: 'claw' },
  // loose, turned out; then the two fingers flick up
  wind: { at: [0.26, -0.32, -0.45], fingers: [0.12, 0.6, -0.79], palm: [-0.92, 0.05, -0.3], shape: 'relaxed' },
  // reaches out open, then draws back flat like a bowstring
  push: { at: [0.2, -0.27, -0.52], fingers: [-0.1, 0.84, -0.53], palm: [-0.25, -0.3, -0.92], shape: 'splay' },
};

/** The beats that bring a hand into a sigil's hold. */
export function forming(id: SigilId): ArmBeat[] {
  const first = FORM[id];
  const hold = { t: first ? 0.075 : 0, ease: 0.085, pose: HOLD[id] };
  return first ? [{ t: 0, ease: 0.06, pose: first }, hold] : [hold];
}

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

// Shared poses, so the two-handed versions line up.
const DRAWN: ArmPose = { at: [0.24, -0.25, -0.35], fingers: [-0.1, 0.82, -0.56], palm: [-0.2, -0.2, -0.96], shape: 'gather' };
const OUT: ArmPose = { at: [0.14, -0.15, -0.62], fingers: [0.02, 0.93, -0.36], palm: [0.05, -0.3, -0.95], shape: 'splay' };
const OUT_SETTLE: ArmPose = { at: [0.17, -0.2, -0.56], fingers: [0, 0.9, -0.44], palm: [0.02, -0.36, -0.93], shape: 'relaxed' };
const both = (t: number, ease: number, pose: ArmPose): Beat => ({ t, ease, lead: pose, other: pose });

/**
 * Cast gestures. `lead` is the hand holding the first word (the left); `other` is the
 * second hand, which joins in when the sentence has two words. The first beat of each is
 * the wind-up.
 */
export const GESTURES: Record<GestureName, Beat[]> = {
  // drawn back to the shoulder, then the palm snaps out toward the target and opens
  thrust: [
    both(0, 0.055, DRAWN),
    both(0.075, 0.04, OUT),
    both(0.22, 0.17, OUT_SETTLE),
  ],
  // a rock is thrown overhand: up and back, then down through the target
  hurl: [
    { t: 0, ease: 0.06, lead: { at: [0.27, -0.06, -0.42], fingers: [-0.05, 0.85, 0.5], palm: [-0.3, 0.5, -0.8], shape: 'fist' } },
    { t: 0.11, ease: 0.05, lead: { at: [0.15, -0.21, -0.66], fingers: [-0.05, 0.25, -0.97], palm: [-0.1, -0.95, -0.25], shape: 'splay' } },
    { t: 0.27, ease: 0.17, lead: { at: [0.17, -0.28, -0.62], fingers: [-0.1, 0.2, -0.97], palm: [-0.3, -0.9, -0.1], shape: 'relaxed' } },
  ],
  // two fingers drawn out to the side, then cut across the body
  slash: [
    { t: 0, ease: 0.05, lead: { at: [0.36, -0.1, -0.5], fingers: [0.35, 0.55, -0.76], palm: [-0.5, -0.6, -0.6], shape: 'two' } },
    { t: 0.085, ease: 0.055, lead: { at: [-0.04, -0.2, -0.62], fingers: [-0.62, 0.2, -0.76], palm: [-0.3, -0.9, 0.3], shape: 'two' } },
    { t: 0.24, ease: 0.17, lead: { at: [0.06, -0.27, -0.56], fingers: [-0.5, 0.25, -0.83], palm: [-0.4, -0.85, 0.2], shape: 'relaxed' } },
  ],
  // both palms drawn back to the chest, then driven forward, arms straightening
  shove: [
    both(0, 0.055, { at: [0.21, -0.21, -0.35], fingers: [0, 0.9, -0.44], palm: [0, -0.2, -0.98], shape: 'flat' }),
    both(0.085, 0.05, { at: [0.16, -0.14, -0.66], fingers: [0.06, 0.96, -0.26], palm: [0.04, -0.24, -0.97], shape: 'flat' }),
    both(0.25, 0.17, OUT_SETTLE),
  ],
  // arms cross low, then fling wide: everything near is thrown outward
  sweep: [
    { t: 0, ease: 0.055, lead: { at: [0.04, -0.24, -0.5], fingers: [-0.7, 0.3, -0.65], palm: [0.5, -0.3, -0.8], shape: 'fist' }, other: { at: [0.04, -0.28, -0.46], fingers: [-0.7, 0.3, -0.65], palm: [0.5, -0.3, -0.8], shape: 'fist' } },
    both(0.105, 0.06, { at: [0.36, -0.13, -0.52], fingers: [0.62, 0.55, -0.56], palm: [0.5, -0.62, -0.6], shape: 'splay' }),
    both(0.3, 0.18, { at: [0.33, -0.25, -0.47], fingers: [0.3, 0.4, -0.86], palm: [0.1, -0.8, -0.55], shape: 'relaxed' }),
  ],
  // hands lifted, then pressed down and forward onto the ground ahead
  press: [
    both(0, 0.065, { at: [0.2, -0.07, -0.5], fingers: [0, 0.55, -0.84], palm: [0, -0.8, -0.6], shape: 'splay' }),
    both(0.11, 0.06, { at: [0.17, -0.2, -0.7], fingers: [0.02, 0.22, -0.97], palm: [0, -0.97, -0.24], shape: 'splay' }),
    both(0.32, 0.18, { at: [0.19, -0.27, -0.62], fingers: [0, 0.2, -0.98], palm: [0, -0.97, -0.2], shape: 'relaxed' }),
  ],
  // hooked fingers dig low, then haul the ground up
  raise: [
    both(0, 0.065, { at: [0.2, -0.36, -0.52], fingers: [-0.05, 0.1, -0.99], palm: [0, 0.98, 0.15], shape: 'claw' }),
    both(0.12, 0.1, { at: [0.21, -0.09, -0.53], fingers: [-0.05, 0.75, -0.66], palm: [-0.1, 0.55, 0.83], shape: 'fist' }),
    both(0.46, 0.2, { at: [0.22, -0.18, -0.5], fingers: [-0.08, 0.7, -0.7], palm: [-0.4, 0.4, 0.8], shape: 'relaxed' }),
  ],
  // open hands scoop low, then sweep upward, fingers wide, throwing the air into the sky
  loft: [
    both(0, 0.055, { at: [0.19, -0.34, -0.55], fingers: [-0.02, 0.1, -0.99], palm: [0, 0.98, 0.1], shape: 'flat' }),
    both(0.095, 0.075, { at: [0.27, -0.05, -0.58], fingers: [0.1, 0.9, -0.42], palm: [-0.2, 0.42, 0.88], shape: 'splay' }),
    both(0.36, 0.2, { at: [0.25, -0.12, -0.5], fingers: [0, 0.8, -0.6], palm: [-0.5, 0.3, 0.8], shape: 'relaxed' }),
  ],
};

/** Seconds from the start of each gesture to the moment the spell leaves the hands. */
export const STRIKE: Record<GestureName, number> = {
  thrust: 0.095, hurl: 0.13, slash: 0.105, shove: 0.105, sweep: 0.125, press: 0.14, raise: 0.15, loft: 0.115,
};

/** How long after its last beat a hand is given back to rest. */
export const GESTURE_TAIL = 0.1;
