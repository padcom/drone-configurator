import { describe, expect, it, vi } from 'vitest'
import { type ShallowRef, shallowRef } from 'vue'
import type { BackendClient } from '@/backend/client'
import type { Param, ParamWriteResult } from '@/generated/app'
import type { ParamsModel } from './useParams'
import { endsSession, questionFor, useStaged } from './useStaged'
import { createWriteLock } from './writeLock'

const RTL: Param = { id: 'RTL_ALT', index: 0, kind: 'int', type: 'INT32', value: 1500 }
const FENCE: Param = { id: 'FENCE_RADIUS', index: 1, kind: 'real', type: 'REAL32', value: 150 }
const BATT: Param = { id: 'BATT_CAPACITY', index: 2, kind: 'int', type: 'INT32', value: 5200 }

/**
 * The `call` of a fake backend: a write answers with what the vehicle reports after it.
 *
 * @param params the parameters the vehicle holds
 * @param answer the value read back, or an error to throw
 * @returns the function (a spy)
 */
function vehicleAnswering(params: ShallowRef<Param[]>, answer: (id: string, value: number) => number | Error) {
  return vi.fn((_name: string, payload: { id: string, value: number }) => {
    const reported = answer(payload.id, payload.value)
    if (reported instanceof Error) {
      return Promise.reject(reported)
    }
    const param = params.value.find(candidate => candidate.id === payload.id) as Param

    return Promise.resolve({ param: { ...param, value: reported }, verified: reported === payload.value } as ParamWriteResult)
  })
}

/**
 * The parameters model as far as the staged changes use it: the list, the selected one, its draft and the words about it.
 *
 * @param params the list
 * @returns the model and the refs a test sets
 */
function fakeParameters(params: ShallowRef<Param[]>) {
  const [selected, draftError, draftWarning] = [0, 1, 2].map(() => shallowRef<string | null>(null)) as [
    ShallowRef<string | null>, ShallowRef<string | null>, ShallowRef<string | null>,
  ]
  const draft = shallowRef('')
  const lock = createWriteLock()
  const list = shallowRef('complete')
  const parameters = {
    params,
    list,
    draft,
    draftError,
    draftWarning,
    refreshWarning: () => draftWarning.value,
    editDraft: (text: string) => {
      draft.value = text
    },
    lock,
    selectedParam: () => params.value.find(param => param.id === selected.value) ?? null,
    replace: (param: Param) => {
      params.value = params.value.map(candidate => candidate.id === param.id ? param : candidate)
    },
  } as unknown as ParamsModel

  return { parameters, selected, draft, draftError, draftWarning, lock, list }
}

/**
 * A staged model on a fake vehicle: the parameters it holds, and what a write to it answers.
 *
 * @param answer what the vehicle reports after a write: the value read back, or an error to throw
 * @param options what is different from the usual
 * @param options.confirm whether the user says yes to the question (yes by default)
 * @param options.mayBeArmed whether the vehicle is armed or may be (no by default)
 * @returns the model, the parameters model it works with, and the spies
 */
function rig(answer: (id: string, value: number) => number | Error, options: { confirm?: boolean, mayBeArmed?: boolean } = {}) {
  const confirm = options.confirm ?? true
  const params = shallowRef<Param[]>([RTL, FENCE, BATT])
  const { parameters, selected, draft, draftError, draftWarning, lock } = fakeParameters(params)
  const call = vehicleAnswering(params, answer)
  const askedOnce = vi.fn(() => Promise.resolve(confirm))
  const staged = useStaged({
    client: { call } as unknown as BackendClient,
    parameters,
    isConnected: () => true,
    confirm: askedOnce,
    mayBeArmed: () => options.mayBeArmed ?? false,
  })
  const pick = (id: string, text: string) => {
    selected.value = id
    draft.value = text
  }

  return { staged, call, askedOnce, pick, params, draft, draftError, draftWarning, lock }
}

/**
 * What the writes came to: each result's name and outcome.
 *
 * @param staged the staged changes
 * @returns the pairs, in order
 */
const outcomes = (staged: ReturnType<typeof rig>['staged']) => staged.results.value.map(result => [result.id, result.outcome])

describe('adding to the changes', () => {
  it('collects the draft of the selected parameter, with the value it has now, and nothing is sent', () => {
    const { staged, pick, call } = rig((_id, value) => value)

    pick('RTL_ALT', '1600')
    staged.sync()

    expect(staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1600 }])
    expect(call).not.toHaveBeenCalled()
  })

  it('takes a second change for the same parameter as a replacement, and keeps the order of the others', () => {
    const { staged, pick } = rig((_id, value) => value)

    pick('RTL_ALT', '1600')
    staged.sync()
    pick('FENCE_RADIUS', '300')
    staged.sync()
    pick('RTL_ALT', '1700')
    staged.sync()

    expect(staged.changes.value.map(change => [change.id, change.to])).toEqual([['FENCE_RADIUS', 300], ['RTL_ALT', 1700]])
  })
})

describe('a draft that does not change the queue', () => {
  it('leaves the changes as they are for a draft that is empty, has a problem, or is for a parameter that is not there', () => {
    const { staged, pick, draftError } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()

    pick('RTL_ALT', '')
    staged.sync()
    pick('RTL_ALT', 'abc')
    draftError.value = 'a number, please'
    staged.sync()
    draftError.value = null
    pick('NOT_THERE', '3')
    staged.sync()

    expect(staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1600 }])
  })

  it('lets a change be taken out again while nothing is being written', () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()

    staged.discard('RTL_ALT')

    expect(staged.changes.value).toEqual([])
  })
})

describe('a draft put back to the value the vehicle has', () => {
  it('takes its change out', () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    pick('FENCE_RADIUS', '300')
    staged.sync()

    pick('RTL_ALT', '1500')
    staged.sync()

    expect(staged.changes.value.map(change => change.id)).toEqual(['FENCE_RADIUS'])
  })

  it('has no change left that was written, and a new value for it is a change like any other', async () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('FENCE_RADIUS', '300')
    staged.sync()
    await staged.writeAll()

    // The vehicle reports 300 now: the written change is gone, and a draft at the vehicle's value queues nothing.
    expect(staged.changes.value).toEqual([])
    pick('FENCE_RADIUS', '300')
    staged.sync()
    expect(staged.changes.value).toEqual([])

    pick('FENCE_RADIUS', '150')
    staged.sync()
    expect(staged.changes.value.map(change => [change.id, change.to])).toEqual([['FENCE_RADIUS', 150]])
    expect(outcomes(staged)).toEqual([])
  })
})

describe('a draft the metadata finds unusual', () => {
  it('can be added, with its warning, which the question to write says', async () => {
    const { staged, pick, draftWarning, askedOnce } = rig((_id, value) => value)
    pick('RTL_ALT', '20')
    draftWarning.value = 'Outside the usual range 30–300000 cm'
    staged.sync()
    pick('FENCE_RADIUS', '300')
    draftWarning.value = null
    staged.sync()

    await staged.writeAll()

    expect(askedOnce).toHaveBeenCalledWith(
      'Write 2 parameters to the vehicle?\nRTL_ALT 1500 → 20 (Outside the usual range 30–300000 cm)\nFENCE_RADIUS 150 → 300',
    )
  })
})

describe('writing the changes', () => {
  it('asks once, naming every parameter, and writes them in order, each read back', async () => {
    const { staged, pick, call, askedOnce, params } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    pick('FENCE_RADIUS', '300')
    staged.sync()

    await staged.writeAll()

    expect(askedOnce).toHaveBeenCalledTimes(1)
    expect(askedOnce).toHaveBeenCalledWith('Write 2 parameters to the vehicle?\nRTL_ALT 1500 → 1600\nFENCE_RADIUS 150 → 300')
    expect(call.mock.calls.map(([, payload]) => [payload.id, payload.value])).toEqual([['RTL_ALT', 1600], ['FENCE_RADIUS', 300]])
    // Both were read back: they are done, so nothing is left in the list, and the run says how many it wrote.
    expect(staged.results.value).toEqual([])
    expect(staged.changes.value).toEqual([])
    expect(staged.written.value).toEqual({ count: 2 })
    expect(staged.pending()).toEqual([])
    expect(params.value.find(param => param.id === 'RTL_ALT')?.value).toBe(1600)
    expect(staged.writing.value).toBe(false)
  })
})

describe('a write that is not confirmed', () => {
  it('stops at the first change the vehicle does not read back, and does not write the rest', async () => {
    const { staged, pick, call } = rig((id, value) => id === 'RTL_ALT' ? 1599 : value)
    pick('RTL_ALT', '1600')
    staged.sync()
    pick('FENCE_RADIUS', '300')
    staged.sync()

    await staged.writeAll()

    expect(call).toHaveBeenCalledTimes(1)
    expect(staged.results.value).toEqual([{ id: 'RTL_ALT', outcome: 'changed', detail: 'the vehicle reports 1599, not 1600' }])
    expect(staged.pending().map(change => change.id)).toEqual(['RTL_ALT', 'FENCE_RADIUS'])
  })

  it('stops at a write that fails, with the reason, and can be tried again', async () => {
    let fails = true
    const { staged, pick, call } = rig((_id, value) => fails ? new Error('TIMEOUT: no reply') : value)
    pick('RTL_ALT', '1600')
    staged.sync()

    await staged.writeAll()
    expect(staged.results.value[0]).toMatchObject({ outcome: 'failed' })
    expect(staged.results.value[0]?.detail).toContain('TIMEOUT')

    fails = false
    await staged.writeAll()
    expect(call).toHaveBeenCalledTimes(2)
    expect(staged.results.value).toEqual([])
    expect(staged.changes.value).toEqual([])
  })
})

describe('a write that is only partly confirmed', () => {
  it('says nothing was all written while a change is left that was not', async () => {
    const { staged, pick } = rig((id, value) => id === 'FENCE_RADIUS' ? 1 : value)
    pick('RTL_ALT', '1600')
    staged.sync()
    pick('FENCE_RADIUS', '300')
    staged.sync()

    await staged.writeAll()

    // RTL_ALT was read back and is gone; FENCE_RADIUS stays with its cross, and the run is not "all written".
    expect(staged.changes.value.map(change => change.id)).toEqual(['FENCE_RADIUS'])
    expect(outcomes(staged)).toEqual([['FENCE_RADIUS', 'changed']])
    expect(staged.written.value).toBeNull()
  })
})

describe('a write that does not start or that is done', () => {
  it('writes nothing when the user says no, or there is nothing to write', async () => {
    const { staged, pick, call } = rig((_id, value) => value, { confirm: false })

    await staged.writeAll()
    pick('RTL_ALT', '1600')
    staged.sync()
    await staged.writeAll()

    expect(call).not.toHaveBeenCalled()
    expect(staged.results.value).toEqual([])
  })

  it('clears what was written away when the next change is added', async () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    await staged.writeAll()

    pick('FENCE_RADIUS', '300')
    staged.sync()

    expect(staged.changes.value.map(change => change.id)).toEqual(['FENCE_RADIUS'])
    expect(staged.results.value).toEqual([])
  })
})

describe('a retry after a partial write', () => {
  it('leaves what the vehicle read back out of the list, writes only the rest, and says how many are written', async () => {
    let flaky = true
    const { staged, pick, call, askedOnce } = rig((id, value) => id === 'FENCE_RADIUS' && flaky ? new Error('TIMEOUT') : value)
    for (const [id, text] of [['RTL_ALT', '1600'], ['FENCE_RADIUS', '300'], ['BATT_CAPACITY', '6000']]) {
      pick(id as string, text as string)
      staged.sync()
    }

    await staged.writeAll()
    expect(outcomes(staged)).toEqual([['FENCE_RADIUS', 'failed']])
    expect(staged.pending().map(change => change.id)).toEqual(['FENCE_RADIUS', 'BATT_CAPACITY'])
    expect(staged.written.value).toBeNull()
    expect(staged.readBack.value).toBe(1)

    flaky = false
    await staged.writeAll()

    const asked = /^Write 2 parameters to the vehicle\?\nFENCE_RADIUS .+\nBATT_CAPACITY /u
    expect(askedOnce).toHaveBeenLastCalledWith(expect.stringMatching(asked))
    expect(call.mock.calls.map(([, payload]) => payload.id)).toEqual(['RTL_ALT', 'FENCE_RADIUS', 'FENCE_RADIUS', 'BATT_CAPACITY'])
    expect(outcomes(staged)).toEqual([])
    expect(staged.written.value).toEqual({ count: 2 })
    expect(staged.pending()).toEqual([])
  })
})

describe('a row that was not confirmed', () => {
  it('keeps why when another change is added', async () => {
    const { staged, pick } = rig((id, value) => id === 'RTL_ALT' ? new Error('TIMEOUT') : value)
    pick('RTL_ALT', '1600')
    staged.sync()
    await staged.writeAll()

    pick('FENCE_RADIUS', '300')
    staged.sync()

    expect(staged.results.value.map(result => [result.id, result.outcome])).toEqual([['RTL_ALT', 'failed']])
    expect(staged.changes.value.map(change => change.id)).toEqual(['RTL_ALT', 'FENCE_RADIUS'])
  })
})

describe('another write under way', () => {
  it('does not start while a single write or a snapshot holds the lock, and gives the lock back when it is done', async () => {
    const { staged, pick, call, lock } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    const release = lock.take()

    await staged.writeAll()
    expect(call).not.toHaveBeenCalled()
    release?.()
    await staged.writeAll()

    expect(call).toHaveBeenCalledTimes(1)
    expect(lock.busy.value).toBe(false)
  })

  it('holds the lock for the whole run, and gives it back also when the user says no', async () => {
    const answered: boolean[] = []
    const { staged, pick, lock } = rig((_id, value) => {
      answered.push(lock.busy.value)

      return value
    }, { confirm: false })
    pick('RTL_ALT', '1600')
    staged.sync()

    await staged.writeAll()

    expect(answered).toEqual([])
    expect(lock.busy.value).toBe(false)
  })
})

describe('the session of the staged changes', () => {
  it('is over when the link is ended, or another vehicle comes up, and not when the same one comes back', () => {
    const connected = { state: 'connected' as const }
    const resumed = { state: 'connected' as const, resumed: true }

    expect(endsSession({ state: 'disconnected' }, connected)).toBe(true)
    expect(endsSession(connected, { state: 'connecting' })).toBe(true)
    expect(endsSession(resumed, { state: 'reconnecting' })).toBe(false)
    expect(endsSession({ state: 'lost' }, connected)).toBe(false)
    expect(endsSession({ state: 'reconnecting' }, { state: 'lost' })).toBe(false)
    expect(endsSession({ state: 'disconnected' }, { state: 'disconnected' })).toBe(false)
  })

  it('forgets every change and result with reset', async () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    await staged.writeAll()

    staged.reset()

    expect(staged.changes.value).toEqual([])
    expect(staged.results.value).toEqual([])
  })
})

describe('the Value field after a reset', () => {
  it('goes back to what the vehicle has for the selected parameter, as the queued value is gone', () => {
    const { staged, pick, draft } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    expect(draft.value).toBe('1600')

    staged.reset()

    expect(draft.value).toBe('1500')
  })
})

describe('a run that the session ends', () => {
  it('writes no more, adds no late result, and gives the lock back at once', async () => {
    const ender: { reset: () => void } = { reset: () => undefined }
    const first = rig((_id, value) => {
      ender.reset()

      return value
    })
    ender.reset = () => first.staged.reset()
    first.pick('RTL_ALT', '1600')
    first.staged.sync()
    first.pick('FENCE_RADIUS', '300')
    first.staged.sync()

    await first.staged.writeAll()

    expect(first.call).toHaveBeenCalledTimes(1)
    expect(first.staged.results.value).toEqual([])
    expect(first.staged.changes.value).toEqual([])
    expect(first.staged.writing.value).toBe(false)
    expect(first.lock.busy.value).toBe(false)
  })
})

describe('the lock', () => {
  it('is given back only by the write that took it, and giving it back twice does not free another\'s', () => {
    const lock = createWriteLock()
    const first = lock.take()
    first?.()
    const second = lock.take()

    first?.()

    expect(lock.busy.value).toBe(true)
    second?.()
    expect(lock.busy.value).toBe(false)
    expect(lock.take()).not.toBeNull()
  })
})

describe('the question, for a bulk reset', () => {
  it('says that calibration values are in it, at the top where a long list that scrolls does not hide it', () => {
    const question = questionFor([{ id: 'RTL_ALT', from: 1, to: 2 }, { id: 'COMPASS_OFS_X', from: 5, to: 0, origin: 'reset' }])

    expect(question.split('\n')).toEqual([
      'Write 2 parameters to the vehicle?',
      'Includes calibration values',
      'RTL_ALT 1 → 2',
      'COMPASS_OFS_X 5 → 0',
    ])
    expect(questionFor([{ id: 'RTL_ALT', from: 1, to: 2 }])).not.toContain('calibration')
  })

  it('names every parameter, with the count first, for hundreds of them', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ id: `P_${i}`, from: i, to: i + 1, origin: 'reset' as const }))
    const lines = questionFor(many).split('\n')

    expect(lines[0]).toBe('Write 300 parameters to the vehicle?')
    expect(lines).toHaveLength(301)
    expect(lines.at(-1)).toBe('P_299 299 → 300')
  })
})

describe('putting parameters back to their initial values', () => {
  it('queues each in place of any change queued for it, from what the vehicle has, and writes nothing', () => {
    const { staged, pick, call } = rig((_id, value) => value)
    pick('RTL_ALT', '1700')
    staged.sync()

    expect(staged.resetTo([{ id: 'RTL_ALT', to: 1400 }, { id: 'FENCE_RADIUS', to: 100 }])).toBe(2)

    expect(staged.changes.value.map(change => [change.id, change.from, change.to, change.origin]))
      .toEqual([['RTL_ALT', 1500, 1400, 'reset'], ['FENCE_RADIUS', 150, 100, 'reset']])
    expect(call).not.toHaveBeenCalled()
  })

  it('takes a change out for a parameter that has the value already, and skips one that is not on the vehicle', () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1700')
    staged.sync()

    expect(staged.resetTo([{ id: 'RTL_ALT', to: 1500 }, { id: 'NOT_THERE', to: 1 }])).toBe(0)

    expect(staged.changes.value).toEqual([])
  })

  it('makes the Value field of the selected parameter say what will be written', () => {
    const { staged, pick, draft } = rig((_id, value) => value)
    pick('RTL_ALT', '1500')

    staged.resetTo([{ id: 'RTL_ALT', to: 1400 }])

    expect(draft.value).toBe('1400')
  })
})

describe('staging values chosen on another page', () => {
  it('queues them as edits, with no warning of the selected parameter, and writes nothing', () => {
    const { staged, pick, draftWarning, call } = rig((_id, value) => value)
    pick('FENCE_RADIUS', '150')
    draftWarning.value = 'outside the range'

    expect(staged.stage([{ id: 'RTL_ALT', to: 1400 }, { id: 'BATT_CAPACITY', to: 6000 }])).toBe(2)

    expect(staged.changes.value).toEqual([
      { id: 'RTL_ALT', from: 1500, to: 1400 },
      { id: 'BATT_CAPACITY', from: 5200, to: 6000 },
    ])
    expect(call).not.toHaveBeenCalled()
  })

  it('takes a change out for the vehicle\'s own value, and skips what is not on the vehicle or while writing', async () => {
    const { staged, pick } = rig((_id, value) => value)
    staged.stage([{ id: 'RTL_ALT', to: 1400 }])

    expect(staged.stage([{ id: 'RTL_ALT', to: 1500 }, { id: 'NOT_THERE', to: 1 }])).toBe(0)
    expect(staged.changes.value).toEqual([])

    pick('RTL_ALT', '1600')
    staged.sync()
    const writing = staged.writeAll()
    await Promise.resolve()
    expect(staged.stage([{ id: 'FENCE_RADIUS', to: 1 }])).toBe(0)
    await writing
  })
})

describe('logging settings while the vehicle may be armed', () => {
  it('are not written, and not even asked about, when the vehicle may be armed, and are when it is not', async () => {
    const { staged, params, call, askedOnce } = rig((_id, value) => value, { mayBeArmed: true })
    params.value = [...params.value, { id: 'LOG_BITMASK', index: 9, kind: 'int', type: 'INT32', value: 5 }]
    expect(staged.stage([{ id: 'LOG_BITMASK', to: 7 }])).toBe(0)

    // Queued while it was safe, written when it is not: the write is refused.
    staged.changes.value = [{ id: 'LOG_BITMASK', from: 5, to: 7 }]
    await staged.writeAll()

    expect(askedOnce).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
  })
})

describe('values the vehicle cannot be given exactly', () => {
  it('are not queued from another page: it takes a parameter as a 32-bit float, and an integer above 2^24 may not be one', () => {
    const { staged, params } = rig((_id, value) => value)
    params.value = [...params.value, { id: 'LOG_BITMASK', index: 9, kind: 'int', type: 'INT32', value: 5 }]

    // 2^24 + 1 is not a float; 2^24 and -17 are; a real parameter is a float to begin with.
    expect(staged.stage([{ id: 'LOG_BITMASK', to: 16777217 }])).toBe(0)
    expect(staged.stage([{ id: 'LOG_BITMASK', to: 16777216 }, { id: 'FENCE_RADIUS', to: 100.5 }])).toBe(2)
    expect(staged.changes.value.map(change => change.to)).toEqual([16777216, 100.5])
  })
})

/** The logging and notch parameters a guarded test has on its vehicle. */
const GUARDED = ['LOG_BITMASK', 'INS_LOG_BAT_MASK', 'INS_HNTCH_ENABLE', 'INS_HNTCH_FREQ', 'INS_HNTCH_BW', 'INS_HNTCH_HMNCS']

/**
 * A rig whose vehicle has the guarded parameters.
 *
 * @param mayBeArmed whether the vehicle is armed or may be
 * @returns the rig
 */
function guardedRig(mayBeArmed: boolean) {
  const made = rig((_id, value) => value, { mayBeArmed })
  const more = GUARDED.map((id, index) => ({ id, index: 30 + index, kind: 'int' as const, type: 'INT32', value: 1 }))
  made.params.value = [...made.params.value, ...more]

  return made
}

describe('every way of queueing a change while the vehicle may be armed', () => {
  it('puts nothing in the list for a guarded parameter: not a reset, not a typed value, not a value from another page', () => {
    const { staged, pick } = guardedRig(true)

    // The initial values put back (the Parameters screen's reset): refused for the six, and the reason is kept.
    expect(staged.resetTo(GUARDED.map(id => ({ id, to: 0 })))).toBe(0)
    expect(staged.changes.value).toEqual([])
    expect(staged.refused.value).toContain('not written while the vehicle is armed')
    // A value typed in the Value field.
    pick('LOG_BITMASK', '7')
    staged.sync()
    expect(staged.changes.value).toEqual([])
    // A value from another page.
    expect(staged.stage(GUARDED.map(id => ({ id, to: 5 })))).toBe(0)
    expect(staged.changes.value).toEqual([])
  })

  it('goes on queueing the others, and says the reason when it refused something', () => {
    const { staged } = guardedRig(true)

    expect(staged.resetTo([{ id: 'INS_HNTCH_FREQ', to: 0 }, { id: 'RTL_ALT', to: 1400 }])).toBe(1)
    expect(staged.changes.value.map(change => change.id)).toEqual(['RTL_ALT'])
    expect(staged.refused.value).not.toBeNull()
  })
})

describe('the reason a change was refused', () => {
  it('has no reason when nothing was refused, and forgets it when the changes are forgotten', () => {
    const { staged } = guardedRig(true)
    staged.resetTo([{ id: 'LOG_BITMASK', to: 0 }])
    expect(staged.refused.value).not.toBeNull()

    staged.resetTo([{ id: 'RTL_ALT', to: 1400 }])
    expect(staged.refused.value).toBeNull()
    staged.resetTo([{ id: 'LOG_BITMASK', to: 0 }])
    staged.reset()
    expect(staged.refused.value).toBeNull()
  })

  it('queues them all when the vehicle is known to be disarmed', () => {
    const { staged } = guardedRig(false)

    expect(staged.resetTo(GUARDED.map(id => ({ id, to: 0 })))).toBe(6)
    expect(staged.refused.value).toBeNull()
  })
})

describe('the notch values while the vehicle may be armed', () => {
  it('are not queued or written, like the logging ones', async () => {
    const { staged, params, call, askedOnce } = rig((_id, value) => value, { mayBeArmed: true })
    params.value = [...params.value, ...['INS_HNTCH_ENABLE', 'INS_HNTCH_FREQ', 'INS_HNTCH_BW', 'INS_HNTCH_HMNCS']
      .map((id, index) => ({ id, index: 20 + index, kind: 'int' as const, type: 'INT16', value: 1 }))]

    expect(staged.stage([{ id: 'INS_HNTCH_FREQ', to: 150 }, { id: 'INS_HNTCH_ENABLE', to: 0 }])).toBe(0)
    staged.changes.value = [{ id: 'INS_HNTCH_BW', from: 1, to: 75 }]
    await staged.writeAll()

    expect(askedOnce).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
  })
})

describe('writing what was put back', () => {
  it('writes them as any change, after the one question, which says the value the vehicle has when it is asked', async () => {
    const { staged, askedOnce, params, call } = rig((_id, value) => value)
    staged.resetTo([{ id: 'RTL_ALT', to: 1400 }])
    // Another ground station changed it after the reset was queued.
    params.value = params.value.map(param => param.id === 'RTL_ALT' ? { ...param, value: 1600 } : param)

    await staged.writeAll()

    expect(askedOnce).toHaveBeenCalledWith('Write 1 parameter to the vehicle?\nRTL_ALT 1600 → 1400')
    expect(call.mock.calls.map(([, payload]) => [payload.id, payload.value])).toEqual([['RTL_ALT', 1400]])
  })

  it('is not queued while the changes are being written', async () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    const writing = staged.writeAll()
    await Promise.resolve()

    expect(staged.resetTo([{ id: 'FENCE_RADIUS', to: 1 }])).toBe(0)
    await writing
  })
})

describe('queued changes that the vehicle has the value of', () => {
  it('are taken out, and the resets among them are counted (a download after they were queued)', () => {
    const { staged, pick, params } = rig((_id, value) => value)
    pick('FENCE_RADIUS', '300')
    staged.sync()
    staged.resetTo([{ id: 'RTL_ALT', to: 1400 }, { id: 'BATT_CAPACITY', to: 5000 }])

    const now: Record<string, number> = { RTL_ALT: 1400, FENCE_RADIUS: 300 }
    params.value = params.value.map(param => param.id in now ? { ...param, value: now[param.id] as number } : param)
    staged.dropMatching()

    expect(staged.changes.value.map(change => change.id)).toEqual(['BATT_CAPACITY'])
    expect(staged.matched.value).toEqual({ count: 1 })
  })

  it('stay when the vehicle has another value than the queued one', () => {
    const { staged, pick, params } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    params.value = params.value.map(param => param.id === 'RTL_ALT' ? { ...param, value: 1599 } : param)

    staged.dropMatching()

    expect(staged.changes.value).toHaveLength(1)
    expect(staged.matched.value).toBeNull()
  })
})

describe('a change taken out while the question is open', () => {
  it('is left out of the run, which goes on with the rest and says so', async () => {
    const { staged, pick, askedOnce, params, call } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()
    pick('FENCE_RADIUS', '300')
    staged.sync()
    askedOnce.mockImplementationOnce(() => {
      // A download gave the vehicle the value queued for the first, while the question was asked.
      params.value = params.value.map(param => param.id === 'RTL_ALT' ? { ...param, value: 1600 } : param)
      staged.dropMatching()

      return Promise.resolve(true)
    })

    await staged.writeAll()

    expect(call.mock.calls.map(([, payload]) => payload.id)).toEqual(['FENCE_RADIUS'])
    expect(staged.changes.value).toEqual([])
    expect(staged.leftOut.value).toEqual({ count: 1 })
    expect(staged.written.value).toEqual({ count: 1 })
  })
})

describe('a run with nothing taken out', () => {
  it('says nothing was left out', async () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.sync()

    await staged.writeAll()

    expect(staged.leftOut.value).toBeNull()
  })
})

describe('the question', () => {
  it('says one parameter in the singular, with the value it has and the value it is given', () => {
    expect(questionFor([{ id: 'RTL_ALT', from: 1, to: 2 }])).toBe('Write 1 parameter to the vehicle?\nRTL_ALT 1 → 2')
  })

  it('has a line for each change, so that what is queued (a "1500 → 1" included) is said at the gate', () => {
    const question = questionFor([
      { id: 'A', from: 1500, to: 1 },
      { id: 'B', from: 10.5, to: 11, warning: 'Outside the usual range 0–10 V' },
    ])

    expect(question.split('\n')).toEqual([
      'Write 2 parameters to the vehicle?',
      'A 1500 → 1',
      'B 10.5 → 11 (Outside the usual range 0–10 V)',
    ])
  })
})
