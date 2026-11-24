import { describe, expect, it } from 'vitest'
import { type FlyCard, flyCards } from './flyCards'
import type { LinkStats, Telemetry } from '@/generated/app'
import { translate } from '@/testing/testing'
import { useFormat } from '@/i18n/useFormat'

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
  return Object.fromEntries(flyCards(now, { reconnecting }, translate, format).map(card => [card.id, card]))
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
    expect(flyCards(FULL, { reconnecting: false }, translate, format).map(card => card.label))
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

  it('does not show a frozen age as current while the vehicle is silent', () => {
    const quiet = texts(cardsOf({ ...FULL, heartbeatAgeMs: 5200 }), 'link')
    const back = texts(cardsOf(FULL, true), 'link')

    expect(quiet).toEqual(['no heartbeat', 'last one 5,200 ms before it went quiet'])
    expect(back[0]).toBe('no heartbeat')
    expect(back.join(' ')).not.toMatch(/\d ms ago/u)
  })
})

/** A link that loses nothing, with a quick ping. */
const GOOD: LinkStats = {
  windowMs: 5000, received: 500, lost: 1, rxRate: 100, txRate: 6, rxBytes: 4000, txBytes: 144, latencyMs: 68.4, silentMs: 10,
  totalReceived: 3000, totalLost: 1,
}

/**
 * The link card with some link stats.
 *
 * @param stats the stats
 * @param now the telemetry, or null
 * @param reconnecting whether the link is being brought back
 * @returns the card
 * @throws {Error} when there is none
 */
function linkCard(stats: LinkStats | null, now: Telemetry | null = FULL, reconnecting = false): FlyCard {
  const card = flyCards(now, { reconnecting, stats }, translate, format).find(one => one.id === 'link')
  if (!card) {
    throw new Error('no link card')
  }

  return card
}

/**
 * The value and the status of the link card with some stats.
 *
 * @param change what differs from a good link
 * @returns the value, and the status
 */
function judged(change: Partial<LinkStats>): [string | undefined, FlyCard['status']] {
  const card = linkCard({ ...GOOD, ...change })

  return [card.value, card.status]
}

describe('the link card with the link\'s stats', () => {
  it('says the share of the packets that arrived, and under it the round trip of the ping and the share lost', () => {
    const card = linkCard(GOOD)

    expect([card.value, card.help, card.state, card.status]).toEqual(['100%', '68\u00A0ms · 0.2% lost', 'live', undefined])
  })

  it.each([
    ['weak, from 5 % lost', { lost: 30, received: 470 }, '94%', 'warn'],
    ['poor, from 20 % lost', { lost: 100, received: 400 }, '80%', 'error'],
    ['weak, from half a second of latency', { latencyMs: 640 }, '100%', 'warn'],
    ['poor, from two seconds of latency', { latencyMs: 2000 }, '100%', 'error'],
    ['weak, after two seconds without a packet', { silentMs: 2000 }, '100%', 'warn'],
  ] as const)('says a link that is %s, with its level and the word', (_name, change, value, level) => {
    expect(judged(change)).toEqual([value, { level, word: level === 'warn' ? 'weak' : 'poor' }])
  })

  it('gives the age of the heartbeat instead of the round trip when the vehicle answers no ping', () => {
    const noPing = { ...GOOD, latencyMs: undefined }

    expect(linkCard(noPing, { ...FULL, heartbeatAgeMs: 120 }).help).toBe('0.2% lost · heartbeat 120 ms ago')
  })
})

describe('the link card of a link that is silent, or has no stats', () => {
  it('keeps "last heard" for a silent link, whatever the stats said last', () => {
    const quiet = linkCard({ ...GOOD, lost: 100, received: 400 }, { ...FULL, heartbeatAgeMs: 5200 })
    const back = linkCard(GOOD, FULL, true)

    expect([quiet.value, quiet.help, quiet.state, quiet.status])
      .toEqual(['no heartbeat', 'last one 5,200 ms before it went quiet', 'last-heard', undefined])
    expect([back.value, back.state]).toEqual(['no heartbeat', 'last-heard'])
  })

  it('says how long ago the heartbeat came without the stats (a backend that sends none)', () => {
    const card = linkCard(null)

    expect([card.value, card.help]).toEqual(['100 ms ago', 'last heartbeat'])
  })

  it('is never reported without a vehicle, whatever the stats', () => {
    expect(linkCard(GOOD, null).state).toBe('never')
  })
})

describe('the cards of a vehicle that has not said everything', () => {
  it('are never reported, with no value, for a group that did not come', () => {
    const { wind, gps } = cardsOf({ ...FULL, wind: undefined, gps: undefined })

    expect([wind, gps].map(card => card?.state)).toEqual(['never', 'never'])
    expect([wind, gps].map(card => card?.value)).toEqual([undefined, undefined])
  })

  it('are all never reported without a vehicle', () => {
    const cards = flyCards(null, { reconnecting: false }, translate, format)

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
