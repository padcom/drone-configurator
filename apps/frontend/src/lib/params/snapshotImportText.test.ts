import { expect, it } from 'vitest'
import { type Progress, canApply, panelShown, resultOf, statusOf, stoppedEarly } from './snapshotImport'
import { translate } from '@/testing/testing'
import { VEHICLE } from '@/mock/fixtures'

const connected = { state: 'connected' as const, vehicle: { ...VEHICLE } }

const change = { id: 'A', from: 1, to: 2, problem: null }

/**
 * The result of the row of `change`, with some changes applied.
 *
 * @param applied how the changes written so far went
 * @param over what differs in the change
 * @returns the result
 */
function result(applied: Progress['applied'], over = {}) {
  return resultOf({ ...change, ...over }, { applied, stopped: false, picked: true }, translate)
}

it('words the result of a row by how its write went, and says why a change cannot be made', () => {
  expect(result([{ id: 'A', outcome: 'verified', detail: '2' }])).toEqual({ tone: 'ok', text: '✓ Written and read back: 2' })
  expect(result([{ id: 'A', outcome: 'changed', detail: 'the vehicle reports 1, not 2' }]))
    .toEqual({ tone: 'error', text: '✕ the vehicle reports 1, not 2' })
  expect(result([{ id: 'A', outcome: 'failed', detail: 'TIMEOUT' }])).toEqual({ tone: 'error', text: '✕ TIMEOUT' })
  expect(result([], { problem: 'not on this vehicle' })).toEqual({ tone: 'warn', text: 'not on this vehicle' })
  expect(result([])).toEqual({ tone: '', text: '' })
})

it('says "not written" for a ticked row that applying stopped before, and for no other', () => {
  expect(resultOf(change, { applied: [], stopped: true, picked: true }, translate)).toEqual({ tone: '', text: 'Not written' })
  expect(resultOf(change, { applied: [], stopped: true, picked: false }, translate)).toEqual({ tone: '', text: '' })
})

it('says what is ticked, what is going on, and how writing ended', () => {
  const done = { id: 'A', outcome: 'verified' as const, detail: '2' }
  const failed = { id: 'B', outcome: 'failed' as const, detail: 'x' }

  expect(statusOf({ picked: [], applied: [], applying: false }, translate))
    .toEqual({ tone: '', text: 'Tick the changes you want.' })
  expect(statusOf({ picked: ['A', 'B'], applied: [], applying: false }, translate).text).toContain('2 ticked.')
  expect(statusOf({ picked: ['A'], applied: [done], applying: true }, translate).text).toContain('Writing')
  expect(statusOf({ picked: ['A'], applied: [done], applying: false }, translate))
    .toEqual({ tone: 'ok', text: 'All written and read back.' })
  expect(statusOf({ picked: ['A'], applied: [done, failed], applying: false }, translate))
    .toEqual({ tone: 'warn', text: 'Stopped there: the rest weren\'t written.' })
})

it('says applying stopped early only when the last change did not verify and nothing is being written', () => {
  const verified = { id: 'A', outcome: 'verified' as const, detail: '' }
  const failed = { id: 'B', outcome: 'failed' as const, detail: '' }

  expect(stoppedEarly([], false)).toBe(false)
  expect(stoppedEarly([verified], false)).toBe(false)
  expect(stoppedEarly([verified, failed], false)).toBe(true)
  expect(stoppedEarly([verified, failed], true)).toBe(false)
})

it('shows the panel for a snapshot under review or a failed load', () => {
  const snapshot = { format: 'x', version: 1, savedAt: '', params: [] }
  const review = { snapshot, changes: [], unchanged: 0, vehicleWarning: null }

  expect(panelShown(null, null)).toBe(false)
  expect(panelShown(review as never, null)).toBe(true)
  expect(panelShown(null, 'Can\'t load it')).toBe(true)
})

it('enables the write only with something ticked, idle, and connected', () => {
  expect(canApply({ picked: ['A'], applying: false, connection: connected })).toBe(true)
  expect(canApply({ picked: [], applying: false, connection: connected })).toBe(false)
  expect(canApply({ picked: ['A'], applying: true, connection: connected })).toBe(false)
  expect(canApply({ picked: ['A'], applying: false, connection: { state: 'lost' } })).toBe(false)
})
