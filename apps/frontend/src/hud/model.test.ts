import { describe, expect, it } from 'vitest'
import { telemetryAt } from '../fixtures'
import { STALE_MS } from '../telemetryCards'
import { hudModel } from './model'

describe('the HUD model', () => {
  it('has every value from telemetry that has them all', () => {
    const model = hudModel(telemetryAt(5))

    expect(model.roll.value).toBeTypeOf('number')
    expect(model.altitude.value).toBe(20)
    expect(model.battery.value).toBeTypeOf('number')
    expect([model.mode, model.armed, model.silent]).toEqual(['LOITER', true, false])
  })

  it('has every value absent, never zero, before any telemetry', () => {
    const model = hudModel(undefined)

    for (const item of [model.roll, model.pitch, model.heading, model.speed, model.altitude, model.climb, model.battery]) {
      expect(item).toEqual({ value: undefined, stale: false })
    }
  })

  it('has a value absent when its group has not been sent', () => {
    const model = hudModel({ ...telemetryAt(5), speed: undefined, position: undefined })

    expect([model.speed.value, model.altitude.value, model.climb.value]).toEqual([undefined, undefined, undefined])
  })

  it('takes the flat fields when there are no groups', () => {
    const flat = { ...telemetryAt(5), battery: undefined, attitude: undefined }
    const model = hudModel(flat)

    expect([model.battery.value, model.roll.value]).toEqual([flat.batteryRemaining, flat.roll])
  })
})

describe('the HUD model, with old values', () => {
  it('marks only the group that is old as stale', () => {
    const t = telemetryAt(5)
    const model = hudModel({ ...t, speed: { ...t.speed!, ageMs: STALE_MS + 1 } })

    expect([model.speed.stale, model.climb.stale, model.altitude.stale, model.roll.stale]).toEqual([true, true, false, false])
  })

  it('marks everything stale while reconnecting, or when the heartbeat is old', () => {
    expect(hudModel(telemetryAt(5), true).roll.stale).toBe(true)
    expect(hudModel({ ...telemetryAt(5), heartbeatAgeMs: STALE_MS + 1 }).altitude.stale).toBe(true)
  })

  it('wraps the heading into 0 to 360', () => {
    const t = telemetryAt(5)

    expect(hudModel({ ...t, speed: { ...t.speed!, heading: -90 } }).heading.value).toBe(270)
    expect(hudModel({ ...t, speed: { ...t.speed!, heading: 450 } }).heading.value).toBe(90)
  })
})
