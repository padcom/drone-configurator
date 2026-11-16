import { describe, expect, it } from 'vitest'
import { type ControlInput, controlBlock, isSimulatorLink } from './gate'
import { suggestedProfile } from './suggest'
import { calibratedSuggestion } from '@/testing/rcProfiles'
import type { ConnectRequest } from '@/generated/app'

const SIM: ConnectRequest = { transport: 'simulator' }
const GOOD: ControlInput = {
  allowed: true,
  request: SIM,
  padLive: true,
  profile: calibratedSuggestion(),
  vehicle: [],
}

describe('a link to a simulator', () => {
  it('is the built-in simulator, and TCP or UDP to this computer', () => {
    expect(isSimulatorLink(SIM)).toBe(true)
    expect(isSimulatorLink({ transport: 'tcp', host: '127.0.0.1', port: 5760 })).toBe(true)
    expect(isSimulatorLink({ transport: 'tcp', host: 'localhost', port: 5760 })).toBe(true)
    expect(isSimulatorLink({ transport: 'udp', host: '::1', port: 14550 })).toBe(true)
    expect(isSimulatorLink({ transport: 'tcp', host: 'LocalHost', port: 5760 })).toBe(true)
  })

  it('is not a vehicle on the network, a serial port, a connection with no host, or none at all', () => {
    expect(isSimulatorLink({ transport: 'tcp', host: '192.168.1.20', port: 5760 })).toBe(false)
    expect(isSimulatorLink({ transport: 'tcp', host: '127.0.0.1.example.com', port: 5760 })).toBe(false)
    expect(isSimulatorLink({ transport: 'udp', port: 14550 })).toBe(false)
    expect(isSimulatorLink({ transport: 'serial', device: '/dev/ttyUSB0', baud: 115200 })).toBe(false)
    expect(isSimulatorLink(null)).toBe(false)
  })
})

describe('whether control may be turned on', () => {
  it('may, when it is allowed, the link is a simulator, a pad is live, the mapping is calibrated and the vehicle agrees', () => {
    expect(controlBlock(GOOD)).toBeNull()
  })

  it('says why not, in this order: the setting, the link, the pad, the mapping, the vehicle', () => {
    const serial: ConnectRequest = { transport: 'serial', device: 'x', baud: 1 }
    const wrong: ControlInput = { ...GOOD, allowed: false, request: serial, padLive: false, profile: null }

    expect(controlBlock(wrong)).toBe('off')
    expect(controlBlock({ ...wrong, allowed: true })).toBe('link')
    expect(controlBlock({ ...wrong, allowed: true, request: SIM })).toBe('pad')
    expect(controlBlock({ ...wrong, allowed: true, request: SIM, padLive: true })).toBe('mapping')
    expect(controlBlock({ ...GOOD, vehicle: [{ code: 'arm', channel: 5, blocks: true }] })).toBe('vehicle')
  })

  it('is not stopped by a warning, and is stopped by a mapping that is not calibrated or has a problem', () => {
    expect(controlBlock({ ...GOOD, vehicle: [{ code: 'zone', channel: 3, blocks: false }] })).toBeNull()
    expect(controlBlock({ ...GOOD, profile: suggestedProfile('pad', null) })).toBe('mapping')
    const { rows } = GOOD.profile!
    const twice = { ...GOOD.profile!, rows: [...rows, rows[0]!] }

    expect(controlBlock({ ...GOOD, profile: twice })).toBe('mapping')
  })
})
