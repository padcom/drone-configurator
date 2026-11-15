// The name a screen reader hears for a cell of the top bar that is a control.
import { expect, it } from 'vitest'
import { nameWithAge } from './topBar'

it('is what the control does, with the age of a stale heartbeat when the visible text says it (label in name)', () => {
  expect(nameWithAge('Arm the vehicle', 'disarmed')).toBe('Arm the vehicle')
  expect(nameWithAge('Arm the vehicle', 'disarmed · 7 s without a heartbeat')).toBe('Arm the vehicle · 7 s without a heartbeat')
})
