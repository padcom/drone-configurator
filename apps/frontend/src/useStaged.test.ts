import { describe, expect, it, vi } from 'vitest'
import { type ShallowRef, shallowRef } from 'vue'
import type { BackendClient } from './backend/client'
import type { Param, ParamWriteResult } from './generated/app'
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
 * A staged model on a fake vehicle: the parameters it holds, and what a write to it answers.
 *
 * @param answer what the vehicle reports after a write: the value read back, or an error to throw
 * @param confirm whether the user says yes to the question
 * @returns the model, the parameters model it works with, and the spies
 */
function rig(answer: (id: string, value: number) => number | Error, confirm = true) {
  const params = shallowRef<Param[]>([RTL, FENCE, BATT])
  const selected = shallowRef<string | null>(null)
  const draft = shallowRef('')
  const [draftError, draftWarning] = [shallowRef<string | null>(null), shallowRef<string | null>(null)]
  const lock = createWriteLock()
  const parameters = {
    params,
    draft,
    draftError,
    draftWarning,
    lock,
    selectedParam: () => params.value.find(param => param.id === selected.value) ?? null,
    replace: (param: Param) => {
      params.value = params.value.map(candidate => candidate.id === param.id ? param : candidate)
    },
  } as unknown as ParamsModel
  const call = vehicleAnswering(params, answer)
  const askedOnce = vi.fn(() => Promise.resolve(confirm))
  const staged = useStaged({
    client: { call } as unknown as BackendClient,
    parameters,
    isConnected: () => true,
    confirm: askedOnce,
  })
  const pick = (id: string, text: string) => {
    selected.value = id
    draft.value = text
  }

  return { staged, call, askedOnce, pick, params, draftError, draftWarning, lock }
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
    staged.stage()

    expect(staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1600 }])
    expect(call).not.toHaveBeenCalled()
  })

  it('takes a second change for the same parameter as a replacement, and keeps the order of the others', () => {
    const { staged, pick } = rig((_id, value) => value)

    pick('RTL_ALT', '1600')
    staged.stage()
    pick('FENCE_RADIUS', '300')
    staged.stage()
    pick('RTL_ALT', '1700')
    staged.stage()

    expect(staged.changes.value.map(change => [change.id, change.to])).toEqual([['FENCE_RADIUS', 300], ['RTL_ALT', 1700]])
  })
})

describe('a draft that cannot be added', () => {
  it('refuses a draft that is not a value, is empty, is the value already there, or has a problem', () => {
    const { staged, pick, draftError } = rig((_id, value) => value)

    pick('RTL_ALT', '')
    expect(staged.canStage()).toBe(false)
    pick('RTL_ALT', '1500')
    expect(staged.canStage()).toBe(false)
    pick('RTL_ALT', 'abc')
    draftError.value = 'a number, please'
    expect(staged.canStage()).toBe(false)
    draftError.value = null
    pick('RTL_ALT', '1600')
    expect(staged.canStage()).toBe(true)
    staged.stage()
    pick('NOT_THERE', '3')
    staged.stage()
    expect(staged.changes.value).toHaveLength(1)
  })

  it('lets a change be taken out again while nothing is being written', () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.stage()

    staged.discard('RTL_ALT')

    expect(staged.changes.value).toEqual([])
  })
})

describe('a draft the metadata finds unusual', () => {
  it('can be added, with its warning, which the question to write says', async () => {
    const { staged, pick, draftWarning, askedOnce } = rig((_id, value) => value)
    pick('RTL_ALT', '20')
    draftWarning.value = 'Outside the usual range 30–300000 cm'
    expect(staged.canStage()).toBe(true)
    staged.stage()
    pick('FENCE_RADIUS', '300')
    draftWarning.value = null
    staged.stage()

    await staged.writeAll()

    expect(askedOnce).toHaveBeenCalledWith(
      'Write 2 parameters to the vehicle (RTL_ALT, FENCE_RADIUS)? RTL_ALT: Outside the usual range 30–300000 cm.',
    )
  })
})

describe('writing the changes', () => {
  it('asks once, naming every parameter, and writes them in order, each read back', async () => {
    const { staged, pick, call, askedOnce, params } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.stage()
    pick('FENCE_RADIUS', '300')
    staged.stage()

    await staged.writeAll()

    expect(askedOnce).toHaveBeenCalledTimes(1)
    expect(askedOnce).toHaveBeenCalledWith('Write 2 parameters to the vehicle (RTL_ALT, FENCE_RADIUS)?')
    expect(call.mock.calls.map(([, payload]) => [payload.id, payload.value])).toEqual([['RTL_ALT', 1600], ['FENCE_RADIUS', 300]])
    expect(staged.results.value.map(result => [result.id, result.outcome, result.detail])).toEqual([
      ['RTL_ALT', 'verified', '1600'],
      ['FENCE_RADIUS', 'verified', '300'],
    ])
    expect(staged.pending()).toEqual([])
    expect(params.value.find(param => param.id === 'RTL_ALT')?.value).toBe(1600)
    expect(staged.writing.value).toBe(false)
  })
})

describe('a write that is not confirmed', () => {
  it('stops at the first change the vehicle does not read back, and does not write the rest', async () => {
    const { staged, pick, call } = rig((id, value) => id === 'RTL_ALT' ? 1599 : value)
    pick('RTL_ALT', '1600')
    staged.stage()
    pick('FENCE_RADIUS', '300')
    staged.stage()

    await staged.writeAll()

    expect(call).toHaveBeenCalledTimes(1)
    expect(staged.results.value).toEqual([{ id: 'RTL_ALT', outcome: 'changed', detail: 'the vehicle reports 1599, not 1600' }])
    expect(staged.pending().map(change => change.id)).toEqual(['RTL_ALT', 'FENCE_RADIUS'])
  })

  it('stops at a write that fails, with the reason, and can be tried again', async () => {
    let fails = true
    const { staged, pick, call } = rig((_id, value) => fails ? new Error('TIMEOUT: no reply') : value)
    pick('RTL_ALT', '1600')
    staged.stage()

    await staged.writeAll()
    expect(staged.results.value[0]).toMatchObject({ outcome: 'failed' })
    expect(staged.results.value[0]?.detail).toContain('TIMEOUT')

    fails = false
    await staged.writeAll()
    expect(call).toHaveBeenCalledTimes(2)
    expect(staged.results.value).toEqual([{ id: 'RTL_ALT', outcome: 'verified', detail: '1600' }])
  })
})

describe('a write that does not start or that is done', () => {
  it('writes nothing when the user says no, or there is nothing to write', async () => {
    const { staged, pick, call } = rig((_id, value) => value, false)

    await staged.writeAll()
    pick('RTL_ALT', '1600')
    staged.stage()
    await staged.writeAll()

    expect(call).not.toHaveBeenCalled()
    expect(staged.results.value).toEqual([])
  })

  it('clears what was written away when the next change is added', async () => {
    const { staged, pick } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.stage()
    await staged.writeAll()

    pick('FENCE_RADIUS', '300')
    staged.stage()

    expect(staged.changes.value.map(change => change.id)).toEqual(['FENCE_RADIUS'])
    expect(staged.results.value).toEqual([])
  })
})

describe('a retry after a partial write', () => {
  it('keeps what the vehicle read back, writes only the rest, and says how many are written', async () => {
    let flaky = true
    const { staged, pick, call, askedOnce } = rig((id, value) => id === 'FENCE_RADIUS' && flaky ? new Error('TIMEOUT') : value)
    for (const [id, text] of [['RTL_ALT', '1600'], ['FENCE_RADIUS', '300'], ['BATT_CAPACITY', '6000']]) {
      pick(id as string, text as string)
      staged.stage()
    }

    await staged.writeAll()
    expect(outcomes(staged)).toEqual([['RTL_ALT', 'verified'], ['FENCE_RADIUS', 'failed']])
    expect(staged.pending().map(change => change.id)).toEqual(['FENCE_RADIUS', 'BATT_CAPACITY'])

    flaky = false
    await staged.writeAll()

    expect(askedOnce).toHaveBeenLastCalledWith('Write 2 parameters to the vehicle (FENCE_RADIUS, BATT_CAPACITY)?')
    expect(call.mock.calls.map(([, payload]) => payload.id)).toEqual(['RTL_ALT', 'FENCE_RADIUS', 'FENCE_RADIUS', 'BATT_CAPACITY'])
    expect(outcomes(staged)).toEqual([['RTL_ALT', 'verified'], ['FENCE_RADIUS', 'verified'], ['BATT_CAPACITY', 'verified']])
    expect(staged.pending()).toEqual([])
  })
})

describe('a row that was not confirmed', () => {
  it('keeps why when another change is added', async () => {
    const { staged, pick } = rig((id, value) => id === 'RTL_ALT' ? new Error('TIMEOUT') : value)
    pick('RTL_ALT', '1600')
    staged.stage()
    await staged.writeAll()

    pick('FENCE_RADIUS', '300')
    staged.stage()

    expect(staged.results.value.map(result => [result.id, result.outcome])).toEqual([['RTL_ALT', 'failed']])
    expect(staged.changes.value.map(change => change.id)).toEqual(['RTL_ALT', 'FENCE_RADIUS'])
  })
})

describe('another write under way', () => {
  it('does not start while a single write or a snapshot holds the lock, and gives the lock back when it is done', async () => {
    const { staged, pick, call, lock } = rig((_id, value) => value)
    pick('RTL_ALT', '1600')
    staged.stage()
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
    }, false)
    pick('RTL_ALT', '1600')
    staged.stage()

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
    staged.stage()
    await staged.writeAll()

    staged.reset()

    expect(staged.changes.value).toEqual([])
    expect(staged.results.value).toEqual([])
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
    first.staged.stage()
    first.pick('FENCE_RADIUS', '300')
    first.staged.stage()

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

describe('the question', () => {
  it('says one parameter in the singular', () => {
    expect(questionFor([{ id: 'RTL_ALT', from: 1, to: 2 }])).toBe('Write 1 parameter to the vehicle (RTL_ALT)?')
  })
})
