// The words for a reason the RC control did not begin or ended.
import { describe, expect, it } from 'vitest'
import { reasonWords } from './reason'

/**
 * What a reason that names a problem of the vehicle is said with.
 *
 * @param key the key of Settings' line for the problem
 * @param channel the channel
 * @returns the message and its values
 */
function detail(key: string, channel: string) {
  return { key: 'rc.reason.vehicleDetail', values: { detail: { key, values: { channel } } } }
}

describe('the words for a reason', () => {
  it('are `rc.reason.<code>` for a reason of the control itself', () => {
    expect(reasonWords('MODE')).toEqual({ key: 'rc.reason.MODE', values: {} })
    expect(reasonWords('vehicle')).toEqual({ key: 'rc.reason.vehicle', values: {} })
  })

  it('name the problem with the vehicle, with Settings\' line for it and the channel', () => {
    expect(reasonWords('vehicle.range.3')).toEqual(detail('settings.rc.issue.vehicle.range', '3'))
    expect(reasonWords('vehicle.arm.7')).toEqual(detail('settings.rc.issue.vehicle.arm', '7'))
    expect(reasonWords('vehicle.centre.3')).toEqual(detail('settings.rc.issue.vehicle.centre', '3'))
  })

  it('say that the vehicle\'s settings are not all known when it is the vehicle as a whole', () => {
    expect(reasonWords('vehicle.unknown.0')).toEqual(detail('settings.rc.issue.vehicle.unknownAll', '0'))
    expect(reasonWords('vehicle.unknown.5')).toEqual(detail('settings.rc.issue.vehicle.unknown', '5'))
  })
})
