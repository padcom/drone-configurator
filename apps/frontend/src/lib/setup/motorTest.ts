// The motor test of the Motors page: what the page holds a test to (the caps are the backend's too, and pico-mavlink's, and the
// vehicle is never asked for more), why a test may not start, and the buttons of a frame (labelled by the TEST ORDER, A, B, C
// ..., and put where the motor is on the frame, never named by an output). Nothing here talks to the vehicle.
import type { Telemetry } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { layoutOf, pointOf } from './frame'

/** The most throttle (percent) a test is ever asked for: the backend refuses more, and so does the helper under it. */
export const MAX_THROTTLE = 20

/** The least, and what a test starts at. */
export const MIN_THROTTLE = 1

export const DEFAULT_THROTTLE = 5

/** Presses this soon (ms) after "the propellers are off" is ticked are ignored: a tick and a press are not one gesture. */
export const IGNORE_AFTER_UNLOCK_MS = 400

/** How often the page tells the backend that the button is still held (ms): a second of silence stops the motor. */
export const HOLD_PING_MS = 250

/** How long after a test the page waits before another may start (ms): the vehicle stops the motor, and still says armed. */
export const SETTLE_MS = 2000

/** Why a test may not start now: no vehicle (`offline`), its state not known (`unknown`), or it is armed (`armed`). */
export type TestBlock = 'offline' | 'unknown' | 'armed' | null

/**
 * A throttle held to what a test takes: a whole number from 1 to 20 percent. A value outside it (a stored one, a typed one) is
 * clamped, and one that is not a number is the default.
 *
 * @param value what was stored or typed
 * @returns the throttle in percent
 */
export function clampThrottle(value: unknown): number {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(number)) {
    return DEFAULT_THROTTLE
  }

  return Math.min(MAX_THROTTLE, Math.max(MIN_THROTTLE, Math.round(number)))
}

/**
 * The block that the armed state makes.
 *
 * @param armed whether the vehicle is armed, or undefined when that is not known
 * @param testing whether a test runs, or ended a moment ago (the armed flag is then the test's own)
 * @returns the reason, or null
 */
function armedBlock(armed: boolean | undefined, testing: boolean): TestBlock {
  if (armed === undefined) {
    return 'unknown'
  }

  return armed && !testing ? 'armed' : null
}

/**
 * Whether a test may start: the vehicle is connected and its state is KNOWN, and it is disarmed. The vehicle itself would take a
 * test while armed (ArduPilot does), so this is the page's to refuse (the backend refuses too). While a test runs, or just after
 * one, the armed flag is the test's own (the vehicle arms its motors for it) and does not count.
 *
 * @param connected whether a vehicle is connected
 * @param telemetry the latest telemetry
 * @param testing whether a test runs, or ended a moment ago
 * @returns the reason, or null
 */
export function testBlock(connected: boolean, telemetry: Telemetry | null, testing: boolean): TestBlock {
  return connected ? armedBlock(armedOf(telemetry), testing) : 'offline'
}

/**
 * Whether a test that ended with this reason ended as it was meant to: the button was let go. Anything else (the page fell
 * silent, the link was lost, the vehicle refused) takes the unlock away: the person has to say again that the propellers are off.
 *
 * @param why the reason the backend gave
 * @returns true for a release
 */
export function endedNormally(why: string): boolean {
  return why === 'RELEASED'
}

/** A button of the motor test: its place on the frame and the letter of the motor (A is the first of the test order). */
export interface TestButton {
  /** The motor's number in the test order (what the backend is told). */
  number: number
  /** A, B, C ... (what the person reads: the number of an output is not the number of a test). */
  letter: string
  /** Where it is, in percent of the drawing (0 to 100, the front is up). */
  left: number
  /**
   *
   */
  top: number
  /** Which way the motor turns. */
  spin: 'cw' | 'ccw'
}

/**
 * The letter of a motor in the test order.
 *
 * @param number the motor's number in the test order (1 is A)
 * @returns A, B, C ...
 */
export function letterOf(number: number): string {
  return String.fromCodePoint(64 + number)
}

/**
 * The buttons of a frame, in the test order, where the motors are drawn. A frame this page has no layout for has no buttons (a
 * layout is never guessed, and a motor is never named by an output).
 *
 * @param frameClass FRAME_CLASS
 * @param frameType FRAME_TYPE
 * @returns the buttons, or null when there is no layout
 */
export function testButtons(frameClass: number, frameType: number): TestButton[] | null {
  const motors = layoutOf(frameClass, frameType)

  return motors === null
    ? null
    : [...motors]
      .sort((a, b) => a.number - b.number)
      .map(motor => {
        const at = pointOf(motor.angle, 34)

        return { number: motor.number, letter: letterOf(motor.number), left: 50 + at.x, top: 50 + at.y, spin: motor.spin }
      })
}
