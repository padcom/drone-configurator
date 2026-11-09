import { describe, expect, it } from 'vitest'
import { FORMAT, type Snapshot, parseSnapshot, review, saveSnapshot } from './snapshot'
import { PARAMS, VEHICLE } from './fixtures'

const saved = (): Snapshot => JSON.parse(saveSnapshot(PARAMS, { ...VEHICLE }, new Date('2026-11-07T12:00:00Z'))) as Snapshot

describe('snapshots', () => {
  it('save the parameters with the vehicle and the time', () => {
    const s = saved()
    expect(s.format).toBe(FORMAT)
    expect(s.savedAt).toBe('2026-11-07T12:00:00.000Z')
    expect(s.vehicle?.type).toBe('QUADROTOR')
    expect(s.params[1]).toEqual({ id: 'BATT_CAPACITY', kind: 'int', type: 'INT32', value: 5200 })
  })

  it('refuse what isn\'t a snapshot', () => {
    expect(parseSnapshot('{')).toBe('not JSON')
    expect(parseSnapshot('{"format":"x"}')).toBe('not a Drone Configurator parameter snapshot')
    expect(parseSnapshot(JSON.stringify({ ...saved(), version: 2 }))).toBe('snapshot version 2 (this app reads version 1)')
    expect(parseSnapshot(JSON.stringify({ ...saved(), params: [{ id: 1 }] }))).toBe('its parameters are malformed')
  })
})

describe('reviewing a snapshot', () => {
  it('shows what differs, what can\'t be applied and why, and a different vehicle', () => {
    const s = saved()
    s.params = s.params.map(p => p.id === 'RTL_ALT' ? { ...p, value: 2000 } : p.id === 'FENCE_ENABLE' ? { ...p, value: 300 } : p)
    s.params.push({ id: 'NOT_A_PARAM', kind: 'int', type: 'INT32', value: 1 })
    s.params.push({ id: 'SYSID_THISMAV', kind: 'real', type: 'REAL32', value: 2 })
    s.vehicle = { ...VEHICLE, type: 'FIXED_WING' }
    const r = review(s, PARAMS, { ...VEHICLE })
    expect(r.changes).toEqual([
      { id: 'FENCE_ENABLE', from: 0, to: 300, problem: 'INT8 goes from -128 to 127' },
      { id: 'RTL_ALT', from: 1500, to: 2000, problem: null },
      { id: 'NOT_A_PARAM', from: null, to: 1, problem: 'not on this vehicle' },
      { id: 'SYSID_THISMAV', from: 1, to: 2, problem: 'REAL32 in the snapshot, INT16 on the vehicle' },
    ])
    expect(r.unchanged).toBe(PARAMS.length - 2)
    expect(r.vehicleWarning).toBe('saved from a FIXED_WING (ARDUPILOTMEGA); this is a QUADROTOR (ARDUPILOTMEGA)')
  })
})
