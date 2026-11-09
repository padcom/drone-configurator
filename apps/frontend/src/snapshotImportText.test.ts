import { expect, it } from 'vitest'
import { appliedLine, canApply, panelShown, stoppedEarly } from './snapshotImport'
import { translate } from './testing'
import { VEHICLE } from './fixtures'

const connected = { state: 'connected' as const, vehicle: { ...VEHICLE } }

it('words each applied change by how it went', () => {
  expect(appliedLine({ id: 'A', outcome: 'verified', detail: '1500' }, translate))
    .toEqual({ tone: 'ok', text: 'A: written and read back: 1500' })
  expect(appliedLine({ id: 'A', outcome: 'changed', detail: 'the vehicle reports 1499' }, translate))
    .toEqual({ tone: 'warn', text: 'A: the vehicle reports 1499' })
  expect(appliedLine({ id: 'A', outcome: 'failed', detail: 'TIMEOUT' }, translate))
    .toEqual({ tone: 'error', text: 'A: TIMEOUT' })
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
