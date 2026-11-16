// What the hover and AutoTune groups of the Tune screen know besides its table (lib/tune/table.ts): the names ArduPilot gives the
// choices of the hover learning and the bits of AutoTune's axes (`@Values` of `MOT_HOVER_LEARN` in AP_MotorsMulticopter.cpp and
// `@Bitmask` of `AUTOTUNE_AXES` in AC_AutoTune_Multi.cpp: the vehicle's own vocabulary, the same in every language).
import type { Choice, NamedBit } from './filters'

/** MOT_HOVER_LEARN: whether the vehicle learns the hover throttle, and whether it keeps what it learned. */
export const HOVER_LEARN: Choice[] = [
  { value: 0, label: 'Disabled' },
  { value: 1, label: 'Learn' },
  { value: 2, label: 'Learn and Save' },
]

/** AUTOTUNE_AXES: the axes AutoTune tunes (bit 0 first). */
export const AUTOTUNE_AXES: NamedBit[] = ['Roll', 'Pitch', 'Yaw', 'YawD'].map((name, bit) => ({ bit, name }))
