// A reboot as the interface follows it: the quiet that the backend reports with the code REBOOTING, and the vehicle's return.
import { describe, expect, it } from 'vitest'
import type { Connection } from '@/generated/app'
import { isRebooting, rebootProgress } from './reboot'
import { vehicleCellFor } from './topBar'
import { translate as translateEnglish } from '@/testing/testing'

const VEHICLE = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' }
const TRYING = { state: 'reconnecting', vehicle: VEHICLE, attempt: 1, nextRetryMs: 1000 } as const
const rebooting: Connection = { ...TRYING, error: 'x', errorCode: 'REBOOTING' }
const lost: Connection = { ...TRYING, error: 'no heartbeat for 5 s' }
const back: Connection = { state: 'connected', vehicle: VEHICLE, resumed: true }

describe('whether the link is down because of a reboot', () => {
  it('is only a reconnecting that says REBOOTING', () => {
    expect(isRebooting(rebooting)).toBe(true)
    expect(isRebooting(lost)).toBe(false)
    expect(isRebooting({ state: 'lost', vehicle: VEHICLE, errorCode: 'REBOOTING' })).toBe(false)
    expect(isRebooting({ state: 'connected', vehicle: VEHICLE })).toBe(false)
  })
})

describe('how a reboot goes on', () => {
  it('begins with the quiet, goes on through the tries, and ends with the vehicle\'s return, which is welcome once', () => {
    const begun = rebootProgress(false, rebooting)
    const again = rebootProgress(begun.rebooting, lost)
    const done = rebootProgress(again.rebooting, back)

    expect(begun).toEqual({ rebooting: true, back: false })
    expect(again).toEqual({ rebooting: true, back: false })
    expect(done).toEqual({ rebooting: false, back: true })
    expect(rebootProgress(done.rebooting, back)).toEqual({ rebooting: false, back: false })
  })

  it('is over when the user disconnects, or the vehicle is another one, and then nobody is welcomed back', () => {
    expect(rebootProgress(true, { state: 'disconnected' })).toEqual({ rebooting: false, back: false })
    expect(rebootProgress(true, { state: 'connected', vehicle: VEHICLE })).toEqual({ rebooting: false, back: false })
  })

  it('is no reboot when a link is lost for another reason', () => {
    expect(rebootProgress(false, lost)).toEqual({ rebooting: false, back: false })
    expect(rebootProgress(false, back)).toEqual({ rebooting: false, back: false })
  })
})

describe('the top bar while the vehicle reboots', () => {
  it('says "Rebooting…", amber, with the tries under it; a lost link says what it is', () => {
    expect(vehicleCellFor(rebooting, translateEnglish)).toMatchObject({ title: 'Rebooting…', tone: 'warn' })
    expect(vehicleCellFor(lost, translateEnglish).title).toBe('reconnecting')
    expect(vehicleCellFor(back, translateEnglish)).toMatchObject({ title: 'QUADROTOR', tone: 'ok' })
  })
})
