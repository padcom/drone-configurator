// The calibration wizard's steps: first the sticks at rest (the throttle where it rests), then every stick moved to both of its
// ends, then the measuring is put into the mapping, which is what gives it the wizard's mark (`calibrated()`, and nothing else).
// Pure: it is fed the reads it is to use (it never reads a pad itself).
import { Capture, MIN_REST_READS } from './capture'
import { calibrated } from './edits'
import type { PadSample, Profile } from './types'

/** Where the wizard is: sticks at rest, or sticks to their ends. */
export type Step = 'rest' | 'move'

/** How it ended when it did not give a mapping: the axes that were not moved to both ends, or that the mapping lacks. */
export interface Failure {
  /** The axes that were not moved to both ends (empty when the mapping could not be calibrated for another reason). */
  axes: number[]
}

/** The wizard. */
export class Wizard {
  step: Step = 'rest'
  private readonly capture = new Capture()

  /**
   * Takes a read: counted for the middle in the first step, for the ends in the second.
   *
   * @param sample what the pad said
   */
  feed(sample: PadSample): void {
    if (this.step === 'rest') {
      this.capture.rest(sample)
    } else {
      this.capture.move(sample)
    }
  }

  /**
   * Whether the first step has enough reads to go on.
   *
   * @returns true when the middle is known
   */
  restDone(): boolean {
    return this.capture.restReads() >= MIN_REST_READS
  }

  /**
   * Goes to the second step, when the first is done.
   *
   * @returns true when it did
   */
  toMove(): boolean {
    if (this.step === 'rest' && this.restDone()) {
      this.step = 'move'
    }

    return this.step === 'move'
  }

  /**
   * How far an axis has travelled so far (raw).
   *
   * @param axis the axis
   * @returns the travel, 0 for one not seen
   */
  travel(axis: number): number {
    return this.capture.travel(axis)
  }

  /**
   * Puts what was measured into the mapping.
   *
   * @param profile the mapping
   * @returns the mapping, calibrated; or what went wrong (the axes not moved to both ends)
   */
  finish(profile: Profile): Profile | Failure {
    if (this.step !== 'move') {
      return { axes: [] }
    }
    const measured = this.capture.measure(profile)

    return (measured.failed.length === 0 ? calibrated(profile, measured.calibrations) : null) ?? { axes: measured.failed }
  }
}
