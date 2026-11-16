// The rules of guided control on the page: what Settings hold (and the default for what they do not), the distance between two
// places, why a Go
// here is not offered, and the altitude it keeps.
import { describe, expect, it } from 'vitest'
import { HOME, NORTH, inTheAir } from '@/testing/guided'
import {
  GUIDED_DEFAULTS, MAX_ALTITUDES, altitudeToKeep, confirmationOf, distanceM, failsafeOf, goHereBlock, limitsOf, numberOf, speedOf,
} from './guided'

const state = (change: Partial<Parameters<typeof goHereBlock>[0]> = {}): Parameters<typeof goHereBlock>[0] => ({
  telemetry: inTheAir(), listComplete: true, target: NORTH, prefs: GUIDED_DEFAULTS, ...change,
})

describe('what Settings hold', () => {
  it('has the safe defaults: a plain confirmation, the failsafe blocks, 50 m, 500 m and 10 m/s', () => {
    expect(GUIDED_DEFAULTS).toEqual({
      confirmation: 'plain', failsafe: 'block', maxAltitude: 50, maxDistance: 500, maxSpeed: 10, speed: 5,
    })
  })

  it('takes what is one of the choices and the default for anything else', () => {
    expect(confirmationOf('none')).toBe('none')
    expect(confirmationOf('hold')).toBe('hold')
    expect(confirmationOf('plain')).toBe('plain')
    expect(confirmationOf('whatever')).toBe('plain')
    expect(confirmationOf(undefined)).toBe('plain')
    expect(failsafeOf('warn')).toBe('warn')
    expect(failsafeOf('block')).toBe('block')
    expect(failsafeOf('')).toBe('block')
    expect(numberOf('80', MAX_ALTITUDES, 50)).toBe(80)
    expect(numberOf('81', MAX_ALTITUDES, 50)).toBe(50)
    expect(numberOf(undefined, MAX_ALTITUDES, 50)).toBe(50)
  })

  it('sends the limits as they are, and flies at a speed that is never above the greatest', () => {
    expect(limitsOf(GUIDED_DEFAULTS)).toEqual({ maxAltitude: 50, maxDistance: 500, maxSpeed: 10 })
    expect(speedOf({ ...GUIDED_DEFAULTS, speed: 15, maxSpeed: 10 })).toBe(10)
    expect(speedOf(GUIDED_DEFAULTS)).toBe(5)
  })
})

describe('distance', () => {
  it('is metres, flat-earth: 0.0005 degrees of latitude is about 56 m', () => {
    expect(distanceM(HOME, NORTH)).toBeGreaterThan(55)
    expect(distanceM(HOME, NORTH)).toBeLessThan(57)
    expect(distanceM(HOME, HOME)).toBe(0)
  })
})

describe('when a Go here is offered', () => {
  it('is offered to a vehicle in the air with its position and home, a place picked and the whole parameter list', () => {
    expect(goHereBlock(state())).toBeNull()
  })

  it.each([
    ['without the complete parameter list', state({ listComplete: false }), 'params'],
    ['without a position', state({ telemetry: inTheAir({ position: undefined }) }), 'position'],
    ['with an old position', state({ telemetry: inTheAir({ position: { ...inTheAir().position!, ageMs: 9000 } }) }), 'position'],
    ['on the ground', state({ telemetry: inTheAir({ position: { ...inTheAir().position!, relativeAltitude: 0.5 } }) }), 'air'],
    ['without home', state({ telemetry: inTheAir({ home: undefined }) }), 'home'],
    ['without a place', state({ target: null }), 'target'],
    ['for a place farther from home than the user allows', state({ target: { lat: HOME.lat + 0.01, lon: HOME.lon } }), 'far'],
  ])('is not offered %s', (_name, given, why) => {
    expect(goHereBlock(given)).toBe(why)
  })

  it('takes the limit of the user for the distance', () => {
    const away = { lat: HOME.lat + 0.01, lon: HOME.lon }

    expect(goHereBlock(state({ target: away, prefs: { ...GUIDED_DEFAULTS, maxDistance: 2000 } }))).toBeNull()
  })
})

describe('the altitude a Go here keeps', () => {
  it('is where the vehicle is, in whole metres, within 2 m and the highest the user allows', () => {
    expect(altitudeToKeep(inTheAir(), GUIDED_DEFAULTS)).toBe(20)
    expect(altitudeToKeep(inTheAir({ position: { ...inTheAir().position!, relativeAltitude: 20.6 } }), GUIDED_DEFAULTS)).toBe(21)
    expect(altitudeToKeep(inTheAir({ position: { ...inTheAir().position!, relativeAltitude: 70 } }), GUIDED_DEFAULTS)).toBe(50)
    expect(altitudeToKeep(inTheAir({ position: { ...inTheAir().position!, relativeAltitude: 1.2 } }), GUIDED_DEFAULTS)).toBe(2)
  })
})
