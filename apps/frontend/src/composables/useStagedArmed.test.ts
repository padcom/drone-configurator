// A change from the Parameters screen while the vehicle is armed: nothing refuses it (the leader's decision: that screen is the
// ultimate configuration panel), the ordinary question is asked, and it says that the changes take effect now.
import { describe, expect, it, vi } from 'vitest'
import { type ShallowRef, shallowRef } from 'vue'
import type { BackendClient } from '@/backend/client'
import type { Param, ParamWriteResult } from '@/generated/app'
import type { ParamsModel } from './useParams'
import { questionFor, useStaged } from './useStaged'
import { createWriteLock } from './writeLock'

/**
 * The `call` of a fake backend: a write answers with the value written, read back.
 *
 * @param params the parameters the vehicle holds
 * @returns the function (a spy)
 */
function vehicleAnswering(params: ShallowRef<Param[]>) {
  return vi.fn((_name: string, payload: { id: string, value: number }) => {
    const param = params.value.find(candidate => candidate.id === payload.id) as Param

    return Promise.resolve({ param: { ...param, value: payload.value }, verified: true } as ParamWriteResult)
  })
}

/**
 * The parameters model as far as the staged changes use it.
 *
 * @param params the list
 * @returns the model
 */
function fakeParameters(params: ShallowRef<Param[]>): ParamsModel {
  return {
    params,
    list: shallowRef('complete'),
    draft: shallowRef(''),
    draftError: shallowRef<string | null>(null),
    draftWarning: shallowRef<string | null>(null),
    refreshWarning: () => null,
    editDraft: () => undefined,
    lock: createWriteLock(),
    selectedParam: () => null,
    replace: (param: Param) => {
      params.value = params.value.map(candidate => candidate.id === param.id ? param : candidate)
    },
  } as unknown as ParamsModel
}

/**
 * A staged model on a vehicle with the hover throttle, whose armed state is what a test says (undefined: not known).
 *
 * @param armed whether the vehicle is armed
 * @returns the model and the spies
 */
function hoverRig(armed: boolean | undefined) {
  const params = shallowRef<Param[]>([{ id: 'MOT_THST_HOVER', index: 0, kind: 'real', type: 'REAL32', value: 0.3 }])
  const call = vehicleAnswering(params)
  const confirm = vi.fn((question: string) => Promise.resolve(question !== ''))
  const hold = vi.fn((question: string) => Promise.resolve(question !== ''))
  const staged = useStaged({
    client: { call } as unknown as BackendClient,
    parameters: fakeParameters(params),
    isConnected: () => true,
    confirm,
    confirmHold: hold,
    mayBeArmed: () => armed !== false,
    armedState: () => armed,
  })

  return { staged, call, confirm, hold }
}

describe('the question of a write, and what the vehicle\'s armed state adds to it', () => {
  it('says that changes take effect now for a vehicle that is armed, or whose state is not known', () => {
    const change = [{ id: 'RTL_ALT', from: 1, to: 2 }]

    expect(questionFor(change, 'armed')).toContain('The vehicle is armed: changes take effect now.')
    expect(questionFor(change, 'unknown')).toContain('state is not known (it may be armed): changes take effect now.')
    expect(questionFor(change, 'disarmed')).not.toContain('take effect now')
    expect(questionFor(change)).toBe('Write 1 parameter to the vehicle?\nRTL_ALT 1 → 2')
  })

  it('says that the feed-forward changes at once when the hover throttle moves by more than a quarter', () => {
    const big = questionFor([{ id: 'MOT_THST_HOVER', from: 0.3, to: 0.4, tuning: true }])
    const small = questionFor([{ id: 'MOT_THST_HOVER', from: 0.3, to: 0.35, tuning: true }])

    expect(big).toContain('changes by more than a quarter')
    expect(small).not.toContain('more than a quarter')
  })

  it('does not say it for a tuning change, which has the hold', () => {
    expect(questionFor([{ id: 'ATC_RAT_RLL_P', from: 1, to: 2, tuning: true }], 'armed')).not.toContain('take effect now')
  })
})

describe('a change from the Parameters screen while the vehicle is armed', () => {
  it('is queued and asked about once, with no hold, and the question says that changes take effect now', async () => {
    const { staged, confirm, hold } = hoverRig(true)

    expect(staged.stage([{ id: 'MOT_THST_HOVER', to: 0.375 }])).toBe(1)
    await staged.writeAll()

    expect(hold).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]?.[0]).toContain('The vehicle is armed: changes take effect now.')
  })

  it('is written with no flag, so that the backend refuses nothing', async () => {
    const { staged, call } = hoverRig(true)

    staged.stage([{ id: 'MOT_THST_HOVER', to: 0.375 }])
    await staged.writeAll()

    expect(call).toHaveBeenCalledTimes(1)
    expect(call.mock.calls[0]?.[1]).toMatchObject({ id: 'MOT_THST_HOVER', value: 0.375 })
    expect(call.mock.calls[0]?.[1]).not.toHaveProperty('guarded')
    expect(call.mock.calls[0]?.[1]).not.toHaveProperty('tuning')
  })
})

describe('a change from the Parameters screen while the state of the vehicle is not known', () => {
  it('is written too, and the question says so', async () => {
    const { staged, call, confirm } = hoverRig(undefined)

    expect(staged.stage([{ id: 'MOT_THST_HOVER', to: 0.35 }])).toBe(1)
    await staged.writeAll()

    expect(confirm.mock.calls[0]?.[0]).toContain('state is not known')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('has no such line for a vehicle that is disarmed', async () => {
    const { staged, confirm } = hoverRig(false)

    staged.stage([{ id: 'MOT_THST_HOVER', to: 0.35 }])
    await staged.writeAll()

    expect(confirm.mock.calls[0]?.[0]).not.toContain('take effect now')
  })
})
