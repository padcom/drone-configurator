// What each copter mode does with the pilot's throttle: one test for each mode number against the lists of the plan
// (`drone-configurator-joystick-backend.md`, section 11.1, from ArduCopter's source).
import { describe, expect, it } from 'vitest'
import { COPTER_MODES, type ModeClass, classOfName, classOfNumber, continueAllowed, startAllowed } from './modes'

/** The plan's lists: the climb-rate modes, the modes that ignore the pilot's throttle, and the thrust modes. */
const CLIMB = [2, 5, 7, 13, 15, 16, 22, 24]
const IGNORES = [3, 4, 6, 9, 17, 18, 19, 20, 21, 23, 26, 27]
const THRUST = [0, 1, 11, 14, 25, 28]

/** A mode that may be given by its name, or none. */
type Name = string | undefined

/**
 * What the plan says of a mode number.
 *
 * @param number the mode number
 * @returns the class the plan gives it
 */
function planned(number: number): ModeClass {
  if (CLIMB.includes(number)) {
    return 'climb'
  }

  return IGNORES.includes(number) ? 'ignores' : 'thrust'
}

/**
 * The modes (of these) that a rule lets through.
 *
 * @param names the modes
 * @param rule the rule
 * @returns the ones it allows
 */
function allowed(names: Name[], rule: (mode: Name) => boolean): Name[] {
  return names.filter(rule)
}

describe('what a mode does with the throttle', () => {
  it.each(Array.from({ length: 30 }, (_, number) => number))('is what the plan says for mode %i', number => {
    expect(classOfNumber(number)).toBe(planned(number))
  })

  it('has every mode of the three lists, once', () => {
    const numbers = COPTER_MODES.map(mode => mode.number).sort((a, b) => a - b)

    expect(numbers).toEqual([...CLIMB, ...IGNORES, ...THRUST].sort((a, b) => a - b))
  })

  it('is read from the name the vehicle gives, in any case, with a space for the underscore', () => {
    expect(['ALT_HOLD', 'Alt Hold', 'loiter'].map(classOfName)).toEqual(['climb', 'climb', 'climb'])
    expect(['GUIDED', 'smart_rtl'].map(classOfName)).toEqual(['ignores', 'ignores'])
    expect(['STABILIZE', 'DRIFT', 'FLIP'].map(classOfName)).toEqual(['thrust', 'thrust', 'thrust'])
  })

  it('is thrust for a mode that is not known, and for none: the safe guess is never "climb"', () => {
    const unknown = [classOfNumber(99), classOfNumber(-1), classOfName('MYSTERY'), classOfName(undefined), classOfName('')]

    expect(unknown).toEqual(['thrust', 'thrust', 'thrust', 'thrust', 'thrust'])
  })
})

describe('where a control may start and go on', () => {
  const climb = ['ALT_HOLD', 'LOITER', 'POSHOLD', 'SPORT', 'CIRCLE', 'FLOWHOLD', 'ZIGZAG', 'AUTOTUNE']
  const ignores = ['RTL', 'LAND', 'GUIDED', 'AUTO', 'BRAKE', 'SMART_RTL']
  const thrust = ['STABILIZE', 'ACRO', 'DRIFT', 'FLIP', 'SYSTEMID', 'TURTLE', undefined, 'MYSTERY']

  it('starts a centred throttle only in a climb mode, armed or not, and never in an unknown mode', () => {
    expect(allowed(climb, mode => startAllowed(true, mode))).toEqual(climb)
    expect(allowed([...ignores, ...thrust], mode => startAllowed(true, mode))).toEqual([])
  })

  it('goes on with a centred throttle in a climb mode and in a mode that ignores the throttle', () => {
    expect(allowed([...climb, ...ignores], mode => continueAllowed(true, mode))).toEqual([...climb, ...ignores])
  })

  it('ends a centred throttle in any other mode', () => {
    expect(allowed(thrust, mode => continueAllowed(true, mode))).toEqual([])
  })

  it('has no rule for a throttle that rests low: any mode, even none', () => {
    const modes = [...climb, ...ignores, ...thrust]

    expect(allowed(modes, mode => startAllowed(false, mode))).toEqual(modes)
    expect(allowed(modes, mode => continueAllowed(false, mode))).toEqual(modes)
  })
})
