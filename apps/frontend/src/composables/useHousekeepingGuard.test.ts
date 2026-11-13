// A changed setting about what to remove removes nothing by itself: arrowing or wheeling a select through values asks nothing
// and removes nothing until the user has stopped; then a dry run says what would go; ONE question names the number and size;
// only a yes removes, a no puts the setting back.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LogsHousekept } from '@/generated/app'
import type { HousekeepingModel } from './useHousekeeping'
import { type Removal, questionOf, useHousekeepingGuard } from './useHousekeepingGuard'

const WOULD_GO: LogsHousekept = {
  removed: [
    { vehicle: 'v', name: '00000003-aaaaaaaa.BIN', size: 6_000_000, why: 'age' },
    { vehicle: 'v', name: '00000001-bbbbbbbb.BIN', size: 4_000_000, why: 'age' },
  ],
  removedCount: 2, freed: 10_000_000, kept: 3, unverified: 0, overCap: false, partsRemoved: 0,
}
const NOTHING: LogsHousekept = { ...WOULD_GO, removed: [], removedCount: 0, freed: 0 }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A guard over a fake housekeeping and a settings value that the test changes.
 *
 * @param preview what the dry run says (null: it cannot say now)
 * @param answer what the user answers
 * @returns the guard, the choice to change, and what happened
 */
// eslint-disable-next-line max-lines-per-function -- one fake housekeeping, kept in one place
function setup(preview: LogsHousekept | null, answer = true) {
  const chosen: Removal = { retentionDays: 0, sizeCapMb: 0 }
  const seen = { previews: [] as Removal[], runs: 0, questions: [] as string[], restored: [] as Removal[], told: [] as string[] }
  const housekeeping = {
    preview: (prefs: Removal) => {
      seen.previews.push({ ...prefs })

      return Promise.resolve(preview)
    },
    run: () => {
      seen.runs += 1

      return Promise.resolve()
    },
  } as unknown as HousekeepingModel
  const guard = useHousekeepingGuard({
    housekeeping,
    prefs: () => ({ ...chosen }),
    confirm: question => {
      seen.questions.push(question)

      return Promise.resolve(answer)
    },
    restore: to => {
      seen.restored.push(to)

      return Promise.resolve()
    },
    tell: input => seen.told.push(input.text),
    settleMs: 100,
  })
  guard.begin()

  return { guard, chosen, seen }
}

it('removes nothing and asks nothing while the select is being arrowed through values', async () => {
  const { guard, chosen, seen } = setup(WOULD_GO)
  // Each arrow is a change; the user has not stopped for 100 ms.
  for (const days of [30, 90, 180, 365]) {
    chosen.retentionDays = days
    guard.changed()
    // eslint-disable-next-line no-await-in-loop -- one arrow after the other, a moment apart
    await vi.advanceTimersByTimeAsync(40)
  }

  expect(seen.previews).toHaveLength(0)
  expect(seen.questions).toHaveLength(0)
  expect(seen.runs).toBe(0)
})

it('then asks ONE question about the value it stopped on, and removes only on a yes', async () => {
  const { guard, chosen, seen } = setup(WOULD_GO, true)
  for (const days of [30, 90, 180]) {
    chosen.retentionDays = days
    guard.changed()
  }
  await vi.advanceTimersByTimeAsync(150)

  // One look, at the value the user stopped on, one question that names the number, the size and the logs.
  expect(seen.previews).toEqual([{ retentionDays: 180, sizeCapMb: 0 }])
  expect(seen.questions).toHaveLength(1)
  expect(seen.questions[0]).toContain('2 (10 MB; log 3, 1)')
  expect(seen.runs).toBe(1)
  expect(seen.restored).toHaveLength(0)
})

it('puts the setting back and removes nothing on a no', async () => {
  const { guard, chosen, seen } = setup(WOULD_GO, false)
  chosen.retentionDays = 30
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)

  expect(seen.questions).toHaveLength(1)
  expect(seen.runs).toBe(0)
  expect(seen.restored).toEqual([{ retentionDays: 0, sizeCapMb: 0 }])
})

it('does not accept a change while the dry run is blocked: it goes back and removals stay held to the old choice', async () => {
  const { guard, chosen, seen } = setup(null)
  chosen.retentionDays = 30
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)

  // Not asked, not run, put back, said once; what a run at the next download would use is still Never.
  expect(seen.questions).toHaveLength(0)
  expect(seen.runs).toBe(0)
  expect(seen.restored).toEqual([{ retentionDays: 0, sizeCapMb: 0 }])
  expect(seen.told).toHaveLength(1)
  expect(seen.told[0]).toContain('cannot be changed while the vehicle is armed')
  expect(guard.accepted()).toEqual({ retentionDays: 0, sizeCapMb: 0 })
})

it('holds every removal to the accepted choice while a question is open, not to what is chosen', async () => {
  const seen = { questions: 0 }
  const chosen: Removal = { retentionDays: 0, sizeCapMb: 0 }
  const guard = useHousekeepingGuard({
    housekeeping: { preview: () => Promise.resolve(WOULD_GO), run: () => Promise.resolve() } as unknown as HousekeepingModel,
    prefs: () => ({ ...chosen }),
    confirm: () => {
      seen.questions += 1

      return new Promise<boolean>(() => {
        // Never answered: the question stays open.
      })
    },
    restore: () => Promise.resolve(),
    tell: () => undefined,
    settleMs: 100,
  })
  guard.begin()
  chosen.retentionDays = 30
  // Before it is looked at, and while the question is open, a run (at the start or after a download) is held to Never.
  expect(guard.accepted()).toEqual({ retentionDays: 0, sizeCapMb: 0 })
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)
  expect(seen.questions).toBe(1)
  expect(guard.accepted()).toEqual({ retentionDays: 0, sizeCapMb: 0 })
})

it('keeps a change that would remove nothing, without a question and without a run', async () => {
  const { guard, chosen, seen } = setup(NOTHING)
  chosen.sizeCapMb = 5000
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)

  expect(seen.previews).toHaveLength(1)
  expect(seen.questions).toHaveLength(0)
  expect(seen.runs).toBe(0)
  // It is the accepted choice now: changing back to it asks nothing.
  chosen.sizeCapMb = 5000
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)
  expect(seen.previews).toHaveLength(1)
})

// eslint-disable-next-line max-lines-per-function -- the question is held open by hand
it('looks at a change made while a question is open only after the answer', async () => {
  let answer: (yes: boolean) => void = () => undefined
  const seen = { previews: 0, questions: 0, runs: 0 }
  const chosen: Removal = { retentionDays: 0, sizeCapMb: 0 }
  const guard = useHousekeepingGuard({
    housekeeping: {
      preview: () => {
        seen.previews += 1

        return Promise.resolve(WOULD_GO)
      },
      run: () => {
        seen.runs += 1

        return Promise.resolve()
      },
    } as unknown as HousekeepingModel,
    prefs: () => ({ ...chosen }),
    confirm: () => {
      seen.questions += 1

      return new Promise<boolean>(resolve => {
        answer = resolve
      })
    },
    restore: () => Promise.resolve(),
    tell: () => undefined,
    settleMs: 100,
  })
  guard.begin()
  chosen.retentionDays = 30
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)
  expect(seen.questions).toBe(1)
  // The user changes it again while the question is open: nothing new is asked yet.
  chosen.retentionDays = 90
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)
  expect(seen.questions).toBe(1)
  expect(seen.runs).toBe(0)
  answer(true)
  await vi.advanceTimersByTimeAsync(300)

  // After the answer the newer choice is looked at, and asked about.
  expect(seen.runs).toBeGreaterThanOrEqual(1)
  expect(seen.questions).toBe(2)
})

it('does nothing before the settings have been read, and when the choice did not change', async () => {
  const seen = { previews: 0 }
  const chosen: Removal = { retentionDays: 0, sizeCapMb: 0 }
  const guard = useHousekeepingGuard({
    housekeeping: {
      preview: () => {
        seen.previews += 1

        return Promise.resolve(WOULD_GO)
      }, run: () => Promise.resolve(),
    } as unknown as HousekeepingModel,
    prefs: () => ({ ...chosen }),
    confirm: () => Promise.resolve(true),
    restore: () => Promise.resolve(),
    tell: () => undefined,
    settleMs: 100,
  })
  chosen.retentionDays = 30
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)
  expect(seen.previews).toBe(0)

  guard.begin()
  guard.changed()
  await vi.advanceTimersByTimeAsync(150)
  expect(seen.previews).toBe(0)
})

it('names the number, the size and the logs in the question', () => {
  expect(questionOf(WOULD_GO)).toContain('2 (10 MB; log 3, 1)')
})
