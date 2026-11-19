import { describe, expect, it } from 'vitest'
import { confirmed } from './confirm'
import { type ControlInput, controlBlock, isSimulatorLink, sticksUnread } from './gate'
import { newRow, suggestedProfile } from './suggest'
import { NO_SOURCE, type PadLayout } from './types'
import { TX16S_LAYOUT, confirmedSuggestion } from '@/testing/rcProfiles'
import type { ConnectRequest } from '@/generated/app'

const SIM: ConnectRequest = { transport: 'simulator' }
const STICKS = { roll: 1, pitch: 2, throttle: 3, yaw: 4 }
const GOOD: ControlInput = {
  allowed: true,
  request: SIM,
  padLive: true,
  profile: confirmedSuggestion('pad', 'centred'),
  layout: TX16S_LAYOUT,
  sticks: STICKS,
  mode: 'ALT_HOLD',
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

  it('is TCP or UDP with no host: the dialog\'s blank field means the default, and the default is this computer', () => {
    expect(isSimulatorLink({ transport: 'tcp' })).toBe(true)
    expect(isSimulatorLink({ transport: 'tcp', port: 5760 })).toBe(true)
    expect(isSimulatorLink({ transport: 'udp', port: 14550 })).toBe(true)
  })

  it('is not a vehicle on the network, a host with a port in it, a serial port, or no connection at all', () => {
    expect(isSimulatorLink({ transport: 'tcp', host: '192.168.1.20', port: 5760 })).toBe(false)
    expect(isSimulatorLink({ transport: 'tcp', host: '127.0.0.1.example.com', port: 5760 })).toBe(false)
    expect(isSimulatorLink({ transport: 'tcp', host: '127.0.0.1:5760' })).toBe(false)
    expect(isSimulatorLink({ transport: 'tcp', host: '' })).toBe(false)
    expect(isSimulatorLink({ transport: 'serial', device: '/dev/ttyUSB0', baud: 115200 })).toBe(false)
    expect(isSimulatorLink(null)).toBe(false)
  })
})

describe('whether control may be turned on', () => {
  it('may, when it is allowed, a simulator, a pad is live, the mapping is confirmed, the vehicle agrees, the mode fits', () => {
    expect(controlBlock(GOOD)).toBeNull()
  })

  it('says why not, in this order: the setting, the link, the pad, the mapping, the reading, the vehicle, the mode', () => {
    const serial: ConnectRequest = { transport: 'serial', device: 'x', baud: 1 }
    const wrong: ControlInput = { ...GOOD, allowed: false, request: serial, padLive: false, profile: null }

    expect(controlBlock(wrong)).toBe('off')
    expect(controlBlock({ ...wrong, allowed: true })).toBe('link')
    expect(controlBlock({ ...wrong, allowed: true, request: SIM })).toBe('pad')
    expect(controlBlock({ ...wrong, allowed: true, request: SIM, padLive: true })).toBe('mapping')
    expect(controlBlock({ ...GOOD, vehicle: [{ code: 'arm', channel: 5, blocks: true }] })).toBe('vehicle')
    expect(controlBlock({ ...GOOD, mode: 'STABILIZE', vehicle: [{ code: 'zone', channel: 5, blocks: true }] })).toBe('vehicle')
    expect(controlBlock({ ...GOOD, mode: 'STABILIZE' })).toBe('mode')
  })

  it('is not stopped by a warning, and is stopped by a mapping that is not confirmed or has a problem', () => {
    expect(controlBlock({ ...GOOD, vehicle: [{ code: 'zone', channel: 3, blocks: false }] })).toBeNull()
    expect(controlBlock({ ...GOOD, profile: suggestedProfile('pad', null) })).toBe('mapping')
    const { rows } = GOOD.profile!
    const twice = { ...GOOD.profile!, rows: [...rows, rows[0]!] }

    expect(controlBlock({ ...GOOD, profile: twice })).toBe('mapping')
    // (confirmed for another pad: the layout is part of what was confirmed)
    const fewer = [...TX16S_LAYOUT.slice(0, 8), ...Array.from({ length: 8 }, () => null)]

    expect(controlBlock({ ...GOOD, layout: fewer })).toBe('mapping')
    expect(controlBlock({ ...GOOD, layout: null })).toBe('mapping')
  })
})

describe('whether control may be turned on: the link', () => {
  it('leaves a request that is not known to the backend only when it is asked to, and a known one is never left', () => {
    const unknown: ControlInput = { ...GOOD, request: null }
    const serial: ConnectRequest = { transport: 'serial', device: 'x', baud: 1 }

    expect(controlBlock(unknown)).toBe('link')
    expect(controlBlock({ ...unknown, letBackendDecide: true })).toBeNull()
    expect(controlBlock({ ...unknown, letBackendDecide: false })).toBe('link')
    expect(controlBlock({ ...GOOD, request: serial, letBackendDecide: true })).toBe('link')
  })

  it('is stopped by a row that has no control yet: it makes nothing, and the mapping is wrong', () => {
    const rows = [...GOOD.profile!.rows, newRow(8, NO_SOURCE)]

    expect(controlBlock({ ...GOOD, profile: { ...GOOD.profile!, rows } })).toBe('mapping')
  })
})

describe('whether a stick of the vehicle is read', () => {
  const layout = (kinds: Record<number, 'button'>): PadLayout => TX16S_LAYOUT.map((kind, index) => kinds[index + 1] ?? kind)

  it('wants each of the four sticks on an axis of the pad: a button is not proportional enough for a stick', () => {
    expect(sticksUnread(GOOD.profile!, TX16S_LAYOUT, STICKS)).toBe(false)
    expect(sticksUnread(GOOD.profile!, layout({ 3: 'button' }), STICKS)).toBe(true)
  })

  it('wants a row for each: a stick that no row drives is not read', () => {
    const rows = GOOD.profile!.rows.filter(row => row.channel !== 2)

    expect(sticksUnread({ ...GOOD.profile!, rows }, TX16S_LAYOUT, STICKS)).toBe(true)
  })

  it('stops the control with the reason "reading" when a stick is a button, and not when the sticks are not known', () => {
    const asButton = layout({ 3: 'button' })
    const sure = confirmed(GOOD.profile!, asButton)

    expect(controlBlock({ ...GOOD, layout: asButton, profile: sure })).toBe('reading')
    expect(controlBlock({ ...GOOD, layout: asButton, profile: sure, sticks: null })).toBeNull()
  })
})
