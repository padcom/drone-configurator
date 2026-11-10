import { describe, expect, it } from 'vitest'
import { type FlyCard, flyCards } from './flyCards'
import type { Telemetry } from './generated/app'
import { translate } from './testing'
import { useFormat } from './useFormat'

const format = useFormat()

const FULL: Telemetry = {
  armed: true,
  mode: 'LOITER',
  heartbeatAgeMs: 100,
  battery: { voltage: 12.18, current: 11.4, remaining: 87, cells: [], ageMs: 200 },
  wind: { direction: 240, speed: 4, speedZ: 0, ageMs: 300 },
  gps: { fixType: 3, satellites: 14, hdop: 0.8, ageMs: 100 },
  ekf: {
    flags: 0,
    velocityVariance: 0.1,
    positionHorizVariance: 0.12,
    positionVertVariance: 0.05,
    compassVariance: 0.02,
    terrainAltVariance: 0,
    ageMs: 100,
  },
  vibration: { x: 9, y: 8, z: 12, clipping: [0, 0, 0], ageMs: 100 },
}

/**
 * The cards for some telemetry.
 *
 * @param now the telemetry, or null
 * @param reconnecting whether the link is being brought back
 * @returns the cards by their id
 */
function cardsOf(now: Telemetry | null, reconnecting = false): Record<string, FlyCard> {
  return Object.fromEntries(flyCards(now, reconnecting, translate, format).map(card => [card.id, card]))
}

/**
 * The states of the cards, in order.
 *
 * @param cards the cards by their id
 * @returns their states
 */
const states = (cards: Record<string, FlyCard>) => Object.values(cards).map(card => card.state)

/**
 * The value and the line under it of a card.
 *
 * @param cards the cards by their id
 * @param id which card
 * @returns the two texts
 */
const texts = (cards: Record<string, FlyCard>, id: string) => [cards[id]?.value, cards[id]?.help]

describe('the cards of a live vehicle', () => {
  it('are the six of the design, in order', () => {
    expect(flyCards(FULL, false, translate, format).map(card => card.label))
      .toEqual(['BATTERY', 'WIND', 'GPS', 'LINK', 'EKF', 'VIBRATION'])
  })

  it('say the charge with the voltage and current under it, the wind, the fix and the satellites', () => {
    const cards = cardsOf(FULL)

    expect(texts(cards, 'battery')).toEqual(['87%', '12.18 V · 11.4 A'])
    expect(texts(cards, 'wind')).toEqual(['4.0 m/s', 'from 240°'])
    expect(texts(cards, 'gps')).toEqual(['3D fix · 14', 'HDOP 0.8'])
    expect(states(cards)).toEqual(Array(6).fill('live'))
  })

  it('say the estimator in a word and the vibration by its worst axis', () => {
    const cards = cardsOf(FULL)

    expect(texts(cards, 'ekf')).toEqual(['Healthy', 'highest variance 0.12'])
    expect(texts(cards, 'vibration')).toEqual(['12 m/s²', 'x 9 · y 8 · z 12'])
  })

  it.each([
    [0.49, 'Healthy'],
    [0.5, 'Degraded'],
    [0.79, 'Degraded'],
    [0.8, 'Failing'],
  ])('call the estimator with a worst variance of %f %s', (positionHorizVariance, word) => {
    expect(cardsOf({ ...FULL, ekf: { ...FULL.ekf!, positionHorizVariance } }).ekf?.value).toBe(word)
  })
})

describe('the link card', () => {
  it('says how long ago the heartbeat came', () => {
    expect(texts(cardsOf({ ...FULL, heartbeatAgeMs: 68 }), 'link')[0]).toBe('68 ms ago')
  })
})

describe('the cards of a vehicle that has not said everything', () => {
  it('are never reported, with no value, for a group that did not come', () => {
    const { wind, gps } = cardsOf({ ...FULL, wind: undefined, gps: undefined })

    expect([wind, gps].map(card => card?.state)).toEqual(['never', 'never'])
    expect([wind, gps].map(card => card?.value)).toEqual([undefined, undefined])
  })

  it('are all never reported without a vehicle', () => {
    const cards = flyCards(null, false, translate, format)

    expect(cards.map(card => card.state)).toEqual(Array(6).fill('never'))
    expect(cards.map(card => card.value)).toEqual(Array(6).fill(undefined))
  })

  it('read the flat battery fields when there is no battery group', () => {
    const flat = { armed: false, mode: 'STABILIZE', heartbeatAgeMs: 0, batteryRemaining: 61, batteryVoltage: 11.8 }
    const { battery } = cardsOf(flat)

    expect([battery?.value, battery?.help]).toEqual(['61%', '11.80 V'])
  })

  it('give the voltage alone when the charge is not known', () => {
    const { battery } = cardsOf({ ...FULL, battery: { voltage: 11.5, cells: [], ageMs: 0 } })

    expect([battery?.value, battery?.help]).toEqual(['11.50 V', ''])
  })
})

describe('the cards of a vehicle that is not heard from', () => {
  it('are stale, with their age, when a group has gone quiet', () => {
    const { wind, gps } = cardsOf({ ...FULL, wind: { ...FULL.wind!, ageMs: 4200 } })

    expect([wind?.state, wind?.ageMs, gps?.state]).toEqual(['stale', 4200, 'live'])
  })

  it('are the last that was heard when the heartbeat is stale or the link is being brought back', () => {
    const quiet = cardsOf({ ...FULL, heartbeatAgeMs: 5000 })
    const back = cardsOf(FULL, true)

    const heard = Array(6).fill('last-heard')
    expect(states(quiet)).toEqual(heard)
    expect(states(back)).toEqual(heard)
  })
})
