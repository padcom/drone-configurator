// One read of the gamepad, and what it may be used for (plan `drone-configurator-rc-control.md`, section 6, the stale-input
// rule). Measured in the app's window with the real radio: `getGamepads()` has nothing until the radio has had input;
// `Gamepad.timestamp` moves only when the state changes (a still stick keeps an old one), so it is NOT a sign of life; with
// the window minimised the page's timers fall to one a second and the pad gives the same values. So freshness is the page's
// OWN: a read is used only when it is on
// time (the one before was less than `LATE_MS` ago, by this module's clock), the window is visible, and the pad is still there.
// Nothing here is cached: every `read()` is a new read, and what it cannot vouch for is not a sample.
import { CHANNELS, type PadLayout, type PadSample } from './types'

/** A read later than this (ms) after the one before is not used: the page was not running (a throttled or frozen timer). */
export const LATE_MS = 100

/** The part of a gamepad that is read (what `navigator.getGamepads()` gives, in its own words). */
export interface PadLike {
  /** The device's id string (vendor and product). */
  readonly id: string
  /** The device's index among the connected ones. */
  readonly index: number
  /** Whether it is still connected. */
  readonly connected: boolean
  /** The axes, -1 to 1. */
  readonly axes: readonly number[]
  /** The buttons. */
  readonly buttons: readonly { readonly value: number }[]
}

/** What the reader looks at: the pads, the clock and the window. Parameters, so that a test needs no gamepad and no waiting. */
export interface Environment {
  /** The pads that are there now (a slot is null when empty). */
  pads: () => readonly (PadLike | null)[]
  /** The clock of the page (ms), steady: `performance.now()`. */
  now: () => number
  /** Whether the window is visible (`document.visibilityState === 'visible'`). */
  visible: () => boolean
}

/** Why a read gives no sample: `none` (no pad, or not the one asked for), `late` (too long after the one before), `hidden`. */
export type Gap = 'none' | 'late' | 'hidden'

/** What a read said. */
export type Reading = {
  /** A fresh sample of a pad. */
  kind: 'live'
  /** The pad's id. */
  id: string
  /** What it said. */
  sample: PadSample
  /** What each of its channels is (an axis, a button, or not there). */
  layout: PadLayout
  /** When the page read it (its clock, ms). */
  at: number
} | {
  /** No sample, and why. */
  kind: Gap
  /** When the page tried (its clock, ms). */
  at: number
}

/**
 * What each of CH1..CH16 of a browser's pad is: its axes first, then its buttons, as far as 16 go (the model of the backend's
 * pads, so that the mapping sees no difference between the two sources).
 *
 * @param pad the pad
 * @returns 16 entries: `axis`, `button`, or null for a channel it has not
 */
export function layoutOf(pad: PadLike): PadLayout {
  const kinds: ('axis' | 'button')[] = [...pad.axes.map(() => 'axis' as const), ...pad.buttons.map(() => 'button' as const)]

  return Array.from({ length: CHANNELS }, (_, index) => kinds[index] ?? null)
}

/**
 * Takes what is needed of a pad: copies, so that nothing later changes what was read. An axis is its reading, a button is -1 up
 * and 1 pressed (an analog trigger is anything between), so every channel is proportional.
 *
 * @param pad the pad
 * @returns CH1..CH16 (null for what the pad has not)
 */
export function sampleOf(pad: PadLike): PadSample {
  const values = [...pad.axes, ...pad.buttons.map(button => button.value * 2 - 1)]

  return { channels: Array.from({ length: CHANNELS }, (_, index) => values[index] ?? null) }
}

/**
 * The pad to read: the first one that is connected (and has the id, when one is asked for).
 *
 * @param pads the slots
 * @param device the id to find, or undefined for any
 * @returns the pad, or null
 */
export function padOf(pads: readonly (PadLike | null)[], device?: string): PadLike | null {
  return pads.find(pad => pad !== null && pad.connected && (device === undefined || pad.id === device)) ?? null
}

/** Reads a gamepad on the page's own clock. */
export class PadReader {
  private last: number | null = null

  /**
   * Makes the reader.
   *
   * @param env the pads, the clock and the window
   * @param device the id of the pad to read (any connected one when it is not given)
   */
  constructor(private readonly env: Environment, private readonly device?: string) {}

  /** Forgets the time of the read before (the next read is the first of a run: it is not late). */
  restart(): void {
    this.last = null
  }

  /**
   * One read. It is a gap when the window is hidden, when the read is late, or when there is no pad: never a sample then. What
   * throws while it looks (the browser's gamepad call, its clock, its visibility) is no pad: a gap, never a sample and never an
   * error that ends the poll.
   *
   * @returns what the read said
   */
  read(): Reading {
    try {
      return this.look()
    } catch {
      return { kind: 'none', at: this.last ?? 0 }
    }
  }

  /**
   * Looks at the clock, the window and the pad.
   *
   * @returns what the read said
   */
  private look(): Reading {
    const at = this.env.now()
    const gap = this.gapAt(at)

    this.last = at

    if (gap !== null) {
      return { kind: gap, at }
    }
    const pad = padOf(this.env.pads(), this.device)

    return pad === null ? { kind: 'none', at } : { kind: 'live', id: pad.id, sample: sampleOf(pad), layout: layoutOf(pad), at }
  }

  /**
   * Why this read may not be used, apart from the pad itself.
   *
   * @param at the time of the read
   * @returns `hidden`, `late`, or null
   */
  private gapAt(at: number): Gap | null {
    if (!this.env.visible()) {
      return 'hidden'
    }

    return this.last !== null && at - this.last > LATE_MS ? 'late' : null
  }
}
