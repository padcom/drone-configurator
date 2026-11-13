// What the accelerometer and compass pages know about the calibrations, and nothing of the link: the six positions the
// vehicle asks for (ArduPilot's ACCELCAL_VEHICLE_POS: libraries/AP_AccelCal/AP_AccelCal.cpp lines 85 to 100), the sections of
// the compass sphere (the 80 bits of MAG_CAL_PROGRESS's completion mask: libraries/AP_Compass/CompassCalibrator.h), and the
// parameters the pages show.
import type { CalibrationCompass } from '@/generated/app'

/** The positions of the full accelerometer calibration, in the order the vehicle asks for them, with the key of their words. */
export const ACCEL_POSITIONS: readonly { position: number, key: string }[] = [
  { position: 1, key: 'level' },
  { position: 2, key: 'left' },
  { position: 3, key: 'right' },
  { position: 4, key: 'noseDown' },
  { position: 5, key: 'noseUp' },
  { position: 6, key: 'back' },
]

/** The accelerometer's offsets and scales (the first one): the vehicle's own, shown after a calibration it called a success. */
export const ACCEL_PARAMS: readonly string[] = [
  'INS_ACCOFFS_X', 'INS_ACCOFFS_Y', 'INS_ACCOFFS_Z', 'INS_ACCSCAL_X', 'INS_ACCSCAL_Y', 'INS_ACCSCAL_Z',
]

/** How many sections the sphere of a compass has: 10 bytes of 8 bits. */
export const SPHERE_SECTIONS = 80

/**
 * Which sections of the sphere have samples: bit 0 of byte 0 is section 0.
 *
 * @param mask the vehicle's completion mask (10 bytes)
 * @returns whether each of the 80 sections is lit (a mask that is short or has a bad byte lights nothing it does not say)
 */
export function litSections(mask: readonly number[]): boolean[] {
  return Array.from({ length: SPHERE_SECTIONS }, (_unused, section) => {
    const byte = mask[Math.floor(section / 8)]

    return Number.isInteger(byte) && ((byte as number) >> section % 8 & 1) === 1
  })
}

/**
 * How many sections of the sphere are lit.
 *
 * @param mask the vehicle's completion mask
 * @returns how many, of 80
 */
export function litCount(mask: readonly number[]): number {
  return litSections(mask).filter(Boolean).length
}

/**
 * The offsets of the compass with this number: COMPASS_OFS_X, COMPASS2_OFS_X, COMPASS3_OFS_X.
 *
 * @param index the compass, 0 for the first
 * @returns the three parameters, X, Y and Z
 */
export function offsetParams(index: number): string[] {
  const stem = index === 0 ? 'COMPASS_OFS' : `COMPASS${index + 1}_OFS`

  return ['X', 'Y', 'Z'].map(axis => `${stem}_${axis}`)
}

/** The parameters that say in which order the compasses are used: each holds the device id of the compass in its place. */
export const COMPASS_ORDER_PARAMS: readonly string[] = ['COMPASS_PRIO1_ID', 'COMPASS_PRIO2_ID', 'COMPASS_PRIO3_ID']

/** The compasses' own device ids, for the compass with each number. */
export const COMPASS_DEVICE_PARAMS: readonly string[] = ['COMPASS_DEV_ID', 'COMPASS_DEV_ID2', 'COMPASS_DEV_ID3']

/** Whether a calibration may turn a compass's orientation (2 or more: it does, when it finds the compass turned). */
export const COMPASS_AUTO_ROT = 'COMPASS_AUTO_ROT'

/** Every parameter the Compass page writes (the order of the compasses): nothing else is written from it. */
export const COMPASS_PARAMS: readonly string[] = COMPASS_ORDER_PARAMS

/**
 * Whether a place exists.
 *
 * @param ids the places
 * @param place the place, 0 based
 * @returns true if there is such a place
 */
function within(ids: readonly number[], place: number): boolean {
  return place >= 0 && place < ids.length
}

/**
 * The order of the compasses with two neighbours swapped (the first goes down, or the second goes up).
 *
 * @param ids the device ids in their places (0 for an empty place)
 * @param place the place that moves (0 based)
 * @param direction -1 to move it up (to an earlier place), 1 to move it down
 * @returns the ids in their new places, or null when it cannot move that way
 */
export function moved(ids: readonly number[], place: number, direction: -1 | 1): number[] | null {
  const to = place + direction
  if (!within(ids, place) || !within(ids, to)) {
    return null
  }
  const next = [...ids]
  next[place] = ids[to] as number
  next[to] = ids[place] as number

  return next
}

/**
 * Whether the vehicle found a compass turned: its orientation after the calibration is not the one before.
 *
 * @param compass the compass with a report
 * @returns true when the orientations differ
 */
export function foundTurned(compass: CalibrationCompass): boolean {
  const { report } = compass

  return report !== undefined && report.oldOrientation !== report.newOrientation
}

/**
 * Whether any compass succeeded: only then is there anything to accept.
 *
 * @param compasses the compasses of a calibration
 * @returns true when at least one has a report that says it worked
 */
export function anySucceeded(compasses: readonly CalibrationCompass[]): boolean {
  return compasses.some(compass => compass.report?.ok === true)
}

/**
 * A number of a report, shown with its sign and at most three decimals (a vehicle's float is not shown as it travels).
 *
 * @param value the number
 * @returns the text
 */
export function shown(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '—'
}

/** What the accelerometer page says of where its calibration is: a key of `setup.accel`, or '' when there is nothing to say. */
export type AccelPhase = 'idle' | 'starting' | 'holding' | 'waiting' | 'place' | ''

/**
 * Where a running accelerometer calibration is.
 *
 * @param asked the position asked for now (0: none)
 * @param confirming whether the vehicle is taking a sample
 * @returns the phase
 */
function runningPhase(asked: number, confirming: boolean): AccelPhase {
  if (confirming) {
    return 'holding'
  }

  return asked > 0 ? 'place' : 'waiting'
}

/**
 * Where an accelerometer calibration is, for the words of the page.
 *
 * @param state the calibration's state (`idle` when this page's calibration is not the one that runs)
 * @param asked the position the vehicle asks for now (0: none)
 * @param confirming whether the vehicle is taking the sample of the position the page said it is in
 * @returns the phase
 */
export function accelPhase(state: string, asked: number, confirming: boolean): AccelPhase {
  if (state !== 'running') {
    return ({ idle: 'idle', starting: 'starting' } as Record<string, AccelPhase>)[state] ?? ''
  }

  return runningPhase(asked, confirming)
}

/**
 * The key of the words for a position.
 *
 * @param position the position, 1 to 6
 * @returns the key (the first, `level`, for a number that is none)
 */
export function positionKey(position: number): string {
  return ACCEL_POSITIONS.find(p => p.position === position)?.key ?? 'level'
}

/** The mark of a position: done, the one asked for, or still to come, and its glyph. */
export interface PositionMark {
  /** Done, the one asked for now, or still to come. */
  state: 'done' | 'current' | 'todo'
  /** The glyph that says it. */
  glyph: string
}

/**
 * The mark of a position.
 *
 * @param position the position
 * @param asked the position asked for now
 * @param placed the positions that are done
 * @returns the state and its glyph
 */
export function positionMark(position: number, asked: number, placed: readonly number[]): PositionMark {
  if (placed.includes(position)) {
    return { state: 'done', glyph: '✓' }
  }

  return asked === position ? { state: 'current', glyph: '→' } : { state: 'todo', glyph: '·' }
}
