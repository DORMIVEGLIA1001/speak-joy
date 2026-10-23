// Feature: kid-friendly-ui-improvements
// Animation_Assets_Dir (Req 8.1): assets and presentation-layer animation configs
// used by the SpeakJoy_Kids_App. These configs are side-effect free data objects
// consumed by the `motion` library. They MUST NOT influence XP/score logic.

import { DESIGN } from '../../lib/ui/presentation';

/**
 * Between-loop pause for the Mascot bobbing animation, in seconds.
 * A value of 0 means the loop repeats immediately. It MUST stay within the
 * design budget (DESIGN.mascotLoopGapMaxMs) so the mascot never appears frozen
 * for more than the allowed gap (Req 8.2).
 */
export const MASCOT_LOOP_GAP_SEC = Math.min(0, DESIGN.mascotLoopGapMaxMs / 1000);

/** Duration of one bob cycle (up + down), in seconds. */
export const MASCOT_BOB_DURATION_SEC = 3;

/**
 * Explicit, traceable Mascot animation config for PathMap (Req 8.1, 8.2).
 *
 * Implemented with the existing `motion` (Framer Motion) library. Transform
 * animations (translateY) are GPU-driven and run effectively at >= 24 fps
 * (DESIGN.mascotMinFps); the between-loop pause is bounded by
 * DESIGN.mascotLoopGapMaxMs. Sourced from `mascot-bob.json` in this directory.
 */
export const MASCOT_BOB_ANIMATION = {
  /** Target keyframes fed to motion's `animate` prop. */
  keyframes: { y: [0, -6, 0] },
  /** Transition fed to motion's `transition` prop. */
  transition: {
    repeat: Infinity,
    repeatType: 'loop',
    duration: MASCOT_BOB_DURATION_SEC,
    repeatDelay: MASCOT_LOOP_GAP_SEC,
    ease: 'easeInOut',
  },
  /** Traceability metadata aligned with the design constants. */
  meta: {
    minFps: DESIGN.mascotMinFps,
    loopGapMaxMs: DESIGN.mascotLoopGapMaxMs,
    requirements: ['8.1', '8.2'] as const,
  },
} as const;
