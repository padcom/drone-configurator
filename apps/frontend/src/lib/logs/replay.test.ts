import { describe, expect, it } from 'vitest'
import type { LocalLogTrack } from '@/generated/app'
import {
  ReplayClock, altitudeAt, bearing, groundSpeedAt, indexAt, jumpsOf, markAt, splitPath, trackOf,
} from './replay'

/** A track that goes north a step a second for three seconds, is not heard for ten, and then goes on. */
const ANSWER: LocalLogTrack = {
  source: 'pos',
  fixes: 5,
  skipped: 1,
  points: [
    { timeUs: 1_000_000, lat: 47, lon: 8, alt: 500 },
    { timeUs: 2_000_000, lat: 47.0001, lon: 8, alt: 501 },
    { timeUs: 3_000_000, lat: 47.0002, lon: 8 },
    { timeUs: 13_000_000, lat: 47.001, lon: 8.001, alt: 510 },
    { timeUs: 14_000_000, lat: 47.0011, lon: 8.001, alt: 511 },
  ],
  home: { lat: 47, lon: 8 },
  // (no fix from 3 s to 13 s of the log: the log says so)
  gaps: [{ fromUs: 3_000_000, toUs: 13_000_000 }],
  gapsMore: 0,
  events: [
    { timeUs: 1_500_000, kind: 'armed' },
    { timeUs: 6_000_000, kind: 'text', text: 'Failsafe: radio' },
    { timeUs: 14_500_000, kind: 'disarmed' },
  ],
}

const track = () => trackOf(ANSWER, 1_000_000)

/**
 * The track with its first fix at a time (the fixes begin late in the log).
 *
 * @param start seconds from the start of the log
 * @returns the track
 */
function startingAt(start: number): ReturnType<typeof track> {
  return { ...track(), fixes: track().fixes.map(fix => ({ ...fix, t: fix.t + start })) }
}

describe('the track of a replay', () => {
  it('counts the times from the first message of the log, and keeps home and how many positions were no place', () => {
    const t = track()

    expect(t.fixes.map(fix => fix.t)).toEqual([0, 1, 2, 12, 13])
    expect(t.home).toEqual({ lat: 47, lon: 8 })
    expect(t.total).toBe(5)
    expect(t.skipped).toBe(1)
    expect([t.from, t.to]).toEqual([0, 13])
  })

  it('finds the last fix at or before a time, and none before the first', () => {
    const { fixes } = track()

    expect([-1, 0, 0.5, 1, 2.9, 12, 99].map(t => indexAt(fixes, t))).toEqual([-1, 0, 0, 1, 2, 3, 4])
    expect(indexAt([], 5)).toBe(-1)
  })
})

describe('the vehicle at a time of the log', () => {
  it('is not drawn before the first fix (nothing is made up)', () => {
    expect(markAt(startingAt(5), 1)).toBeNull()
  })

  it('is heard until the end of the track, and then held at the last fix', () => {
    expect(markAt(track(), 12.5)).toMatchObject({ stale: false })
  })

  it('is between two fixes where a straight line puts it, heading the way the line goes', () => {
    const mark = markAt(track(), 0.5)

    expect(mark?.lat).toBeCloseTo(47.00005, 8)
    expect(mark?.heading).toBeCloseTo(0, 3)
    expect(mark?.stale).toBe(false)
  })

  it('holds the last fix in a gap, as one that is not heard now, with how long since', () => {
    const mark = markAt(track(), 7)

    expect(mark).toMatchObject({ lat: 47.0002, lon: 8, stale: true })
    expect(mark?.ageMs).toBeCloseTo(5000, 6)
    expect(mark?.heading).toBeUndefined()
  })

  it('holds the last fix after the end of the track, old by the time that passed', () => {
    expect(markAt(track(), 20)).toMatchObject({ lat: 47.0011, stale: true })
  })
})

describe('the vehicle between thinned points', () => {
  const points = [{ timeUs: 1_000_000, lat: 47, lon: 8 }, { timeUs: 9_000_000, lat: 47.001, lon: 8 }]

  it('is heard where the points are 8 s apart and the log has no gap: a distance between points is not a gap', () => {
    const thin = trackOf({ ...ANSWER, points, gaps: [] }, 1_000_000)

    expect(markAt(thin, 4)).toMatchObject({ stale: false, ageMs: 0 })
    expect(markAt(thin, 4)?.lat).toBeCloseTo(47.0005, 6)
    expect(groundSpeedAt(thin, 4)).toBeCloseTo(13.9, 0)
  })

  it('is not heard there when the log says it has no position between them', () => {
    const thin = trackOf({ ...ANSWER, points, gaps: [{ fromUs: 1_000_000, toUs: 9_000_000 }] }, 1_000_000)

    expect(markAt(thin, 4)).toMatchObject({ stale: true, lat: 47 })
    expect(groundSpeedAt(thin, 4)).toBeUndefined()
  })
})

describe('the vehicle at a time of the log: its heading', () => {
  it('does not point anywhere when it has not moved', () => {
    const points = [{ timeUs: 1_000_000, lat: 47, lon: 8 }, { timeUs: 2_000_000, lat: 47, lon: 8 }]
    const still = trackOf({ ...ANSWER, points }, 1_000_000)

    expect(markAt(still, 0.5)?.heading).toBeUndefined()
  })

  it('has bearings of the four ways', () => {
    const o = { lat: 47, lon: 8 }

    expect(Math.round(bearing(o, { lat: 47.1, lon: 8 }))).toBe(0)
    expect(Math.round(bearing(o, { lat: 47, lon: 8.1 }))).toBe(90)
    expect(Math.round(bearing(o, { lat: 46.9, lon: 8 }))).toBe(180)
    expect(Math.round(bearing(o, { lat: 47, lon: 7.9 }))).toBe(270)
  })
})

describe('the path flown and the path ahead', () => {
  it('splits at the vehicle: the fixes up to it and it, then it and the fixes after', () => {
    const t = track()
    const mark = markAt(t, 1.5)
    const { flown, ahead } = splitPath(t, 1.5, mark)

    expect(flown).toHaveLength(3)
    expect(flown.at(-1)).toBe(mark)
    expect(ahead).toHaveLength(4)
    expect(ahead[0]).toBe(mark)
  })

  it('has nothing flown before the first fix: the whole path is ahead', () => {
    const { flown, ahead } = splitPath(startingAt(5), 1, null)

    expect(flown).toHaveLength(0)
    expect(ahead).toHaveLength(5)
  })
})

describe('what the cursor says of the track', () => {
  it('has the speed over the ground from the fixes either side, none in a gap or at the end', () => {
    const t = track()

    expect(groundSpeedAt(t, 0.5)).toBeCloseTo(11.1, 0)
    expect(groundSpeedAt(t, 7)).toBeUndefined()
    expect(groundSpeedAt(t, 13)).toBeUndefined()
    expect(groundSpeedAt(t, -1)).toBeUndefined()
  })

  it('has the height of the last fix that says one, and none when the log does not', () => {
    const t = track()

    expect(altitudeAt(t, 1.5)).toBe(501)
    expect(altitudeAt(t, 2.5)).toBeUndefined()
    expect(altitudeAt(t, -1)).toBeUndefined()
  })
})

describe('the list to jump to', () => {
  it('has the events and the changes of mode in time order, from the start of the log', () => {
    const jumps = jumpsOf(ANSWER, [{ timeUs: 1_000_000, mode: 5 }, { timeUs: 8_000_000, mode: 6 }], 1_000_000)

    expect(jumps.map(jump => `${jump.t}:${jump.kind}`)).toEqual(['0:mode', '0.5:armed', '5:text', '7:mode', '13.5:disarmed'])
    expect(jumps[2]?.text).toBe('Failsafe: radio')
    expect(jumps[3]?.mode).toBe(6)
  })

  it('holds a time before the start of the log to the start', () => {
    expect(jumpsOf(ANSWER, [{ timeUs: 0, mode: 5 }], 1_000_000)[0]?.t).toBe(0)
  })
})

describe('the clock of a replay', () => {
  it('runs at the speed asked for and stops at the end', () => {
    const clock = new ReplayClock(10)
    clock.toggle()
    clock.speed = 4

    expect(clock.advance(1000)).toBe(true)
    expect(clock.time).toBe(4)
    clock.advance(5000)

    expect(clock.time).toBe(10)
    expect(clock.playing).toBe(false)
    expect(clock.advance(1000)).toBe(false)
  })

  it('does not move while it is stopped, and goes only inside the log', () => {
    const clock = new ReplayClock(10)

    expect(clock.advance(1000)).toBe(false)
    clock.seek(99)
    expect(clock.time).toBe(10)
    clock.seek(-3)
    expect(clock.time).toBe(0)
  })
})

describe('the clock of a replay: its ends', () => {
  it('begins again from the start when it is run at the end, and does not run in a log of no length', () => {
    const clock = new ReplayClock(10)
    clock.seek(10)
    clock.toggle()

    expect([clock.time, clock.playing]).toEqual([0, true])
    clock.toggle()
    expect(clock.playing).toBe(false)

    const empty = new ReplayClock(0)
    empty.toggle()
    expect(empty.playing).toBe(false)
  })
})
