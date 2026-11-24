// The serial bridge's words and the local port as typed (lib/setup/bridge.ts).
import { expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import {
  BRIDGE_DEVICES, BRIDGE_OFF, addressOf, deviceName, endedKey, endedWhy, holdsPort, localPortOf, refusalKey,
} from './bridge'

/**
 * Whether a message key has English words.
 *
 * @param key the key
 * @returns true when it has
 */
function inEnglish(key: string): boolean {
  return i18n.global.te(key, 'en')
}

it('offers every port SERIAL_CONTROL can reach, each with a name', () => {
  expect(BRIDGE_DEVICES).toHaveLength(14)
  expect(deviceName('GPS1')).toEqual({ key: 'setup.bridge.name.gps', params: { n: 1 } })
  expect(deviceName('TELEM2')).toEqual({ key: 'setup.bridge.name.telem', params: { n: 2 } })
  expect(deviceName('SERIAL0')).toEqual({ key: 'setup.bridge.name.serial', params: { n: 0 } })
  expect(BRIDGE_DEVICES.every(device => inEnglish(deviceName(device).key))).toBe(true)
})

it('takes a local port from 1 to 65535, or none for any free one', () => {
  expect(localPortOf('5770')).toBe(5770)
  expect(localPortOf(' 65535 ')).toBe(65535)
  expect(localPortOf('')).toBe(0)
  expect(localPortOf('0')).toBeNull()
  expect(localPortOf('65536')).toBeNull()
  expect(localPortOf('57.7')).toBeNull()
  expect(localPortOf('port')).toBeNull()
})

it('has words for each refusal and each end, and for one it does not know', () => {
  for (const code of ['ARMED', 'STATE_UNKNOWN', 'NOT_CONNECTED', 'BUSY', 'PORT_UNAVAILABLE', 'INVALID_VALUE', 'WHATEVER']) {
    expect(inEnglish(refusalKey(code))).toBe(true)
  }
  expect(refusalKey('WHATEVER')).toBe('setup.bridge.refused.other')

  for (const why of ['STOPPED', 'DISCONNECTED', 'LINK_LOST', 'ARMED', 'LISTEN_FAILED', 'WHATEVER']) {
    expect(inEnglish(endedKey(why))).toBe(true)
  }
  expect(endedKey('WHATEVER')).toBe('setup.bridge.ended.other')
})

it('holds a port while a bridge runs or gives it back, and says how the last one ended once it is off', () => {
  const running = { ...BRIDGE_OFF, state: 'running' as const, device: 'GPS1' as const, address: '127.0.0.1', port: 5770 }
  expect(holdsPort(null)).toBe(false)
  expect(holdsPort(BRIDGE_OFF)).toBe(false)
  expect(holdsPort(running)).toBe(true)
  expect(holdsPort({ ...running, state: 'releasing' })).toBe(true)
  expect(addressOf(running)).toBe('127.0.0.1:5770')
  expect(endedWhy({ ...running, why: 'ARMED' })).toBeUndefined()
  expect(endedWhy({ ...running, state: 'off', why: 'ARMED' })).toBe('ARMED')
})
