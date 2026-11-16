// The measuring of the calibration wizard: first the sticks at rest (and the throttle where it is), then every axis moved to both
// of its ends. Pure: it takes the reads it is given (never reads a pad itself) and says what each axis did.
import type { AxisCalibration, PadSample, Profile } from './types'

/** How many reads at rest are needed for the middle of an axis. */
export const MIN_REST_READS = 10

/** The least an axis must travel (raw, of its -1 to 1) to be calibrated: an axis not moved to both ends is not. */
export const MIN_TRAVEL = 0.8

/** The part of the travel at either end within which a rest is "at an end" (a throttle stick that rests at the bottom). */
const END_FRACTION = 0.05

/** What an axis did, as the wizard measured it. */
export interface Measured {
  /** The axes of the calibrations that could be made. */
  calibrations: Map<number, AxisCalibration>
  /** The axes of the sticks of the mapping that were not moved to both ends (the wizard cannot finish with one). */
  failed: number[]
}

/** The least and the most an axis said. */
interface Ends {
  /** The least. */
  min: number
  /** The most. */
  max: number
}

/** What has been seen of the axes so far. */
export class Capture {
  private sums: number[] = []
  private reads = 0
  private mins: number[] = []
  private maxs: number[] = []

  /**
   * One read with the sticks where they rest: it is counted for the middle, and for the ends too.
   *
   * @param sample what the pad said
   */
  rest(sample: PadSample): void {
    this.reads += 1
    sample.axes.forEach((value, axis) => {
      this.sums[axis] = (this.sums[axis] ?? 0) + value
    })
    this.move(sample)
  }

  /**
   * One read while the sticks are moved to their ends.
   *
   * @param sample what the pad said
   */
  move(sample: PadSample): void {
    sample.axes.forEach((value, axis) => {
      this.mins[axis] = Math.min(this.mins[axis] ?? value, value)
      this.maxs[axis] = Math.max(this.maxs[axis] ?? value, value)
    })
  }

  /**
   * How many reads at rest there are.
   *
   * @returns the count
   */
  restReads(): number {
    return this.reads
  }

  /**
   * How far an axis has travelled so far (raw).
   *
   * @param axis the axis
   * @returns the largest minus the least it said, 0 for one not seen
   */
  travel(axis: number): number {
    return (this.maxs[axis] ?? 0) - (this.mins[axis] ?? 0)
  }

  /**
   * The ends an axis has been to, when it has been seen.
   *
   * @param axis the axis
   * @returns the ends, or null
   */
  private endsOf(axis: number): Ends | null {
    const min = this.mins[axis]
    const max = this.maxs[axis]

    return min === undefined || max === undefined ? null : { min, max }
  }

  /**
   * The ends of an axis that has enough reads at rest and has travelled to both of them.
   *
   * @param axis the axis
   * @returns the ends, or null
   */
  private measuredEnds(axis: number): Ends | null {
    const ends = this.endsOf(axis)

    return ends !== null && this.reads >= MIN_REST_READS && ends.max - ends.min >= MIN_TRAVEL ? ends : null
  }

  /**
   * Where an axis rests: the rest it was read at, or halfway for one that rests at an end (a throttle).
   *
   * @param axis the axis
   * @param ends the ends it has been to
   * @returns the middle
   */
  private centerOf(axis: number, ends: Ends): number {
    const rest = (this.sums[axis] ?? 0) / this.reads
    const margin = END_FRACTION * (ends.max - ends.min)

    return rest > ends.min + margin && rest < ends.max - margin ? rest : (ends.min + ends.max) / 2
  }

  /**
   * What an axis calibrates to: its ends, and its middle.
   *
   * @param axis the axis
   * @returns the calibration, or null when there are too few reads at rest or the axis did not travel to both ends
   */
  calibrationOf(axis: number): AxisCalibration | null {
    const ends = this.measuredEnds(axis)

    return ends === null ? null : { min: ends.min, center: this.centerOf(axis, ends), max: ends.max }
  }

  /**
   * Notes what an axis measured to: its calibration, or that it failed.
   *
   * @param axis the axis
   * @param measured what is noted
   */
  private note(axis: number, measured: Measured): void {
    const calibration = this.calibrationOf(axis)

    if (calibration !== null) {
      measured.calibrations.set(axis, calibration)
    } else if (!measured.failed.includes(axis)) {
      measured.failed.push(axis)
    }
  }

  /**
   * What the wizard measured for the sticks of a mapping.
   *
   * @param profile the mapping
   * @returns the calibrations of its sticks' axes, and the axes that failed
   */
  measure(profile: Profile): Measured {
    const measured: Measured = { calibrations: new Map(), failed: [] }

    for (const row of profile.rows) {
      if (row.kind === 'stick') {
        this.note(row.axis, measured)
      }
    }

    return measured
  }
}
