// The frame page's tables. The lists of classes, types and board orientations are ArduPilot's own (ArduCopter/Parameters.cpp
// line 675: FRAME_CLASS, line 234: FRAME_TYPE; libraries/AP_AHRS/AP_AHRS.cpp line 145: AHRS_ORIENTATION): their names are the
// vehicle's own vocabulary, like a mode's name, and a value that is not in a list is shown as its number. The drawings are
// the motor layouts of libraries/AP_Motors/AP_MotorsMatrix.cpp (quad lines 582 to 602, hexa 781 to 806, octa 860 to 890): the
// angle of each motor from the front, clockwise, which way it spins and its number in the motor test. Only layouts that file
// spells out as angles are drawn; the others say that there is no drawing, never a guess.

/** A value of a parameter and its name. */
export interface Named {
  /**
   *
   */
  value: number
  /**
   *
   */
  name: string
}

/** FRAME_CLASS (the name of 0, "Undefined", is a message of the interface). */
export const FRAME_CLASSES: readonly Named[] = [
  { value: 1, name: 'Quad' },
  { value: 2, name: 'Hexa' },
  { value: 3, name: 'Octa' },
  { value: 4, name: 'OctaQuad' },
  { value: 5, name: 'Y6' },
  { value: 6, name: 'Heli' },
  { value: 7, name: 'Tri' },
  { value: 8, name: 'SingleCopter' },
  { value: 9, name: 'CoaxCopter' },
  { value: 10, name: 'BiCopter' },
  { value: 11, name: 'Heli_Dual' },
  { value: 12, name: 'DodecaHexa' },
  { value: 13, name: 'HeliQuad' },
  { value: 14, name: 'Deca' },
  { value: 15, name: 'Scripting Matrix' },
  { value: 16, name: '6DoF Scripting' },
  { value: 17, name: 'Dynamic Scripting Matrix' },
]

/** FRAME_TYPE. */
export const FRAME_TYPES: readonly Named[] = [
  { value: 0, name: 'Plus' },
  { value: 1, name: 'X' },
  { value: 2, name: 'V' },
  { value: 3, name: 'H' },
  { value: 4, name: 'V-Tail' },
  { value: 5, name: 'A-Tail' },
  { value: 10, name: 'Y6B' },
  { value: 11, name: 'Y6F' },
  { value: 12, name: 'BetaFlightX' },
  { value: 13, name: 'DJIX' },
  { value: 14, name: 'ClockwiseX' },
  { value: 15, name: 'I' },
  { value: 18, name: 'BetaFlightXReversed' },
  { value: 19, name: 'Y4' },
]

/** AHRS_ORIENTATION: how the board sits, as ArduPilot names the rotations (None is a message of the interface). */
export const ORIENTATIONS: readonly Named[] = [
  'Yaw45',
  'Yaw90',
  'Yaw135',
  'Yaw180',
  'Yaw225',
  'Yaw270',
  'Yaw315',
  'Roll180',
  'Yaw45Roll180',
  'Yaw90Roll180',
  'Yaw135Roll180',
  'Pitch180',
  'Yaw225Roll180',
  'Yaw270Roll180',
  'Yaw315Roll180',
  'Roll90',
  'Yaw45Roll90',
  'Yaw90Roll90',
  'Yaw135Roll90',
  'Roll270',
  'Yaw45Roll270',
  'Yaw90Roll270',
  'Yaw135Roll270',
  'Pitch90',
  'Pitch270',
  'Yaw90Pitch180',
  'Yaw270Pitch180',
  'Pitch90Roll90',
  'Pitch90Roll180',
  'Pitch90Roll270',
  'Pitch180Roll90',
  'Pitch180Roll270',
  'Pitch270Roll90',
  'Pitch270Roll180',
  'Pitch270Roll270',
  'Yaw90Pitch180Roll90',
  'Yaw270Roll90',
  'Yaw293Pitch68Roll180',
  'Pitch315',
  'Pitch315Roll90',
].map((name, i) => ({ value: i + 1, name })).concat([
  { value: 42, name: 'Roll45' },
  { value: 43, name: 'Roll315' },
  { value: 100, name: 'Custom 4.1 and older' },
  { value: 101, name: 'Custom 1' },
  { value: 102, name: 'Custom 2' },
])

/** One motor of a layout: where it is (degrees clockwise from the front), which way it spins, and its motor-test number. */
export interface Motor {
  /**
   *
   */
  angle: number
  /**
   *
   */
  spin: 'cw' | 'ccw'
  /**
   *
   */
  number: number
}

const QUAD_PLUS: readonly Motor[] = [
  { angle: 90, spin: 'ccw', number: 2 },
  { angle: -90, spin: 'ccw', number: 4 },
  { angle: 0, spin: 'cw', number: 1 },
  { angle: 180, spin: 'cw', number: 3 },
]
const QUAD_X: readonly Motor[] = [
  { angle: 45, spin: 'ccw', number: 1 },
  { angle: -135, spin: 'ccw', number: 3 },
  { angle: -45, spin: 'cw', number: 4 },
  { angle: 135, spin: 'cw', number: 2 },
]
const HEXA_PLUS: readonly Motor[] = [
  { angle: 0, spin: 'cw', number: 1 },
  { angle: 180, spin: 'ccw', number: 4 },
  { angle: -120, spin: 'cw', number: 5 },
  { angle: 60, spin: 'ccw', number: 2 },
  { angle: -60, spin: 'ccw', number: 6 },
  { angle: 120, spin: 'cw', number: 3 },
]
const HEXA_X: readonly Motor[] = [
  { angle: 90, spin: 'cw', number: 2 },
  { angle: -90, spin: 'ccw', number: 5 },
  { angle: -30, spin: 'cw', number: 6 },
  { angle: 150, spin: 'ccw', number: 3 },
  { angle: 30, spin: 'ccw', number: 1 },
  { angle: -150, spin: 'cw', number: 4 },
]
const OCTA_PLUS: readonly Motor[] = [
  { angle: 0, spin: 'cw', number: 1 },
  { angle: 180, spin: 'cw', number: 5 },
  { angle: 45, spin: 'ccw', number: 2 },
  { angle: 135, spin: 'ccw', number: 4 },
  { angle: -45, spin: 'ccw', number: 8 },
  { angle: -135, spin: 'ccw', number: 6 },
  { angle: -90, spin: 'cw', number: 7 },
  { angle: 90, spin: 'cw', number: 3 },
]
const OCTA_X: readonly Motor[] = [
  { angle: 22.5, spin: 'cw', number: 1 },
  { angle: -157.5, spin: 'cw', number: 5 },
  { angle: 67.5, spin: 'ccw', number: 2 },
  { angle: 157.5, spin: 'ccw', number: 4 },
  { angle: -22.5, spin: 'ccw', number: 8 },
  { angle: -112.5, spin: 'ccw', number: 6 },
  { angle: -67.5, spin: 'cw', number: 7 },
  { angle: 112.5, spin: 'cw', number: 3 },
]

/** The layouts that are drawn, by class and type. */
const LAYOUTS: Readonly<Record<string, readonly Motor[]>> = {
  '1:0': QUAD_PLUS, '1:1': QUAD_X, '2:0': HEXA_PLUS, '2:1': HEXA_X, '3:0': OCTA_PLUS, '3:1': OCTA_X,
}

/**
 * The motors of a frame, when this page can draw it.
 *
 * @param frameClass FRAME_CLASS
 * @param frameType FRAME_TYPE
 * @returns the motors, or null when there is no drawing for that class and type
 */
export function layoutOf(frameClass: number, frameType: number): readonly Motor[] | null {
  return LAYOUTS[`${frameClass}:${frameType}`] ?? null
}

/**
 * Where a motor is drawn: the front is up, the angle is clockwise from it.
 *
 * @param angle degrees clockwise from the front
 * @param radius how far from the middle
 * @returns the point
 */
export function pointOf(angle: number, radius: number): { x: number, y: number } {
  const turn = angle * Math.PI / 180

  // (`+ 0` turns a negative zero into 0.)
  return { x: Math.round(Math.sin(turn) * radius * 100) / 100 + 0, y: Math.round(-Math.cos(turn) * radius * 100) / 100 + 0 }
}

/** The parameters of the page: the frame and how the board sits. */
export const FRAME_PARAMS: readonly string[] = ['FRAME_CLASS', 'FRAME_TYPE', 'AHRS_ORIENTATION']

/**
 * The options of a field that names the values of a list, with one of its own in front when asked.
 *
 * @param list the list
 * @param first an option of the interface's own (a value that has no name in the list), or undefined
 * @param first.value the number the vehicle holds
 * @param first.label the words for it
 * @returns the options
 */
export function optionsOf(list: readonly Named[], first?: { value: number, label: string }): { value: number, label: string }[] {
  const named = list.map(item => ({ value: item.value, label: item.name }))

  return first === undefined ? named : [first, ...named]
}

/**
 * The name of a value in a list.
 *
 * @param list the list
 * @param value the value
 * @returns the name, or undefined for a value that is not in it
 */
export function nameIn(list: readonly Named[], value: number): string | undefined {
  return list.find(item => item.value === value)?.name
}
