import { expect, it } from 'vitest'
import { type Progress, canApply, panelShown, resultOf, sourceWords, statusOf, stoppedEarly } from './snapshotImport'
import { translate } from '@/testing/testing'
import { VEHICLE } from '@/mock/fixtures'

const connected = { state: 'connected' as const, vehicle: { ...VEHICLE } }

const change = { id: 'A', from: 1, to: 2, problem: null, warning: null }

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
  const review = { source: { kind: 'snapshot', savedAt: '' }, changes: [], unchanged: 0, vehicleWarning: null, notes: [] }

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

it('does not enable the write while the vehicle is armed or may be, and says so', () => {
  expect(canApply({ picked: ['A'], applying: false, connection: connected, armed: true })).toBe(false)
  expect(canApply({ picked: ['A'], applying: false, connection: connected, armed: false })).toBe(true)
  expect(statusOf({ picked: ['A'], applied: [], applying: false, armed: true }, translate))
    .toEqual({ tone: 'warn', text: 'Nothing is written while the vehicle is armed, or may be. Disarm it first.' })
})

it('shows what the metadata finds unusual about a value that can be written, and nothing over a problem', () => {
  const unusual = { ...change, warning: 'Outside the usual range 0–10' }

  expect(resultOf(unusual, { applied: [], stopped: false, picked: false }, translate))
    .toEqual({ tone: 'warn', text: 'Outside the usual range 0–10. Check it before you write it.' })
  expect(resultOf({ ...unusual, problem: 'read-only' }, { applied: [], stopped: false, picked: false }, translate))
    .toEqual({ tone: 'warn', text: 'read-only' })
})

it('heads a snapshot with when it was saved, and a parameter file with its format', () => {
  expect(sourceWords({ kind: 'snapshot', savedAt: '2026-11-07' }, translate))
    .toEqual({ heading: 'Snapshot from 2026-11-07', column: 'In the snapshot' })
  expect(sourceWords({ kind: 'file', format: 'qgc' }, translate))
    .toEqual({ heading: 'Parameter file: QGroundControl .params', column: 'In the file' })
  expect(sourceWords({ kind: 'file', format: 'param' }, translate).heading).toBe('Parameter file: ArduPilot .param (NAME,VALUE)')
})
