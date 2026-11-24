import { expect, it } from 'vitest'
import { FIRST_FORM, TRANSPORTS, deviceAmong, lastRequest, listens, requestFor, tabOf, transportFor } from './connectionForm'

const form = { transport: 'tcp' as const, host: '', port: '', device: '', baud: '115200' }

it('asks for the defaults when nothing is typed, and trims what is', () => {
  expect(requestFor({ ...form, transport: 'simulator' })).toEqual({ transport: 'simulator' })
  expect(requestFor({ ...form, host: ' 10.0.0.2 ', port: ' 5760 ' })).toEqual({ transport: 'tcp', host: '10.0.0.2', port: 5760 })
  // A port that is not a positive number is left to the default.
  expect(requestFor({ ...form, port: 'abc' })).toEqual({ transport: 'tcp' })
  expect(requestFor({ ...form, port: '0' })).toEqual({ transport: 'tcp' })
})

it('sends the device and baud rate for a serial link, and ignores host and port', () => {
  const serial = { ...form, transport: 'serial' as const, host: 'x', port: '1', baud: '57600' }

  expect(requestFor({ ...serial, device: '/dev/ttyUSB0' })).toEqual({ transport: 'serial', device: '/dev/ttyUSB0', baud: 57600 })
  expect(requestFor(serial)).toEqual({ transport: 'serial', baud: 57600 })
})

it('leaves the device and the baud rate to the backend when they are not chosen', () => {
  const serial = { ...form, transport: 'serial' as const, baud: '' }

  expect(requestFor(serial)).toEqual({ transport: 'serial' })
  expect(requestFor({ ...serial, device: '/dev/ttyACM0' })).toEqual({ transport: 'serial', device: '/dev/ttyACM0' })
})

it('starts on UDP at the default port, with the serial port and rate found by the backend', () => {
  expect(requestFor(FIRST_FORM)).toEqual({ transport: 'udp' })
  expect(requestFor({ ...FIRST_FORM, transport: 'serial' })).toEqual({ transport: 'serial' })
})

it('reconnects to the last connection that was kept, and to nothing when none was', () => {
  const last = { ...form, host: '10.0.0.2', port: '5760' }

  expect(lastRequest(JSON.stringify(last))).toEqual({ transport: 'tcp', host: '10.0.0.2', port: 5760 })
  expect(lastRequest(undefined)).toBeNull()
  expect(lastRequest('{"transport":"tcp"}')).toBeNull()
})

it('keeps the chosen device while it is listed, else leaves it to the backend', () => {
  const ports = [{ path: 'a' }, { path: 'b' }]

  expect(deviceAmong('b', ports)).toBe('b')
  expect(deviceAmong('gone', ports)).toBe('')
  expect(deviceAmong('', ports)).toBe('')
  expect(deviceAmong('a', [])).toBe('')
})

it('sends a host for a link that goes to the vehicle, and for one that listens only every interface (#197)', () => {
  expect(requestFor({ ...form, transport: 'udp-client', host: ' 10.0.0.2 ', port: '14551' }))
    .toEqual({ transport: 'udp-client', host: '10.0.0.2', port: 14551 })
  expect(requestFor({ ...form, transport: 'tcp-server', host: '10.0.0.2' })).toEqual({ transport: 'tcp-server' })
  expect(requestFor({ ...form, transport: 'tcp-server', host: '0.0.0.0', port: '5770' }))
    .toEqual({ transport: 'tcp-server', host: '0.0.0.0', port: 5770 })
  expect(requestFor({ ...form, transport: 'udp', host: '127.0.0.1' })).toEqual({ transport: 'udp' })
})

it('puts each kind of link under its tab, and a tab keeps the way round that is chosen', () => {
  expect(TRANSPORTS.map(tabOf)).toEqual(['udp', 'udp', 'tcp', 'tcp', 'serial', 'simulator'])
  expect(transportFor('udp', 'udp-client')).toBe('udp-client')
  expect(transportFor('tcp', 'udp-client')).toBe('tcp')
  expect(transportFor('serial', 'tcp-server')).toBe('serial')
  expect([listens('udp'), listens('tcp-server'), listens('udp-client'), listens('tcp')]).toEqual([true, true, false, false])
})

it('reconnects to a last connection of the new kinds', () => {
  const last = { ...form, transport: 'tcp-server' as const, host: '0.0.0.0', port: '5770' }

  expect(lastRequest(JSON.stringify(last))).toEqual({ transport: 'tcp-server', host: '0.0.0.0', port: 5770 })
})
