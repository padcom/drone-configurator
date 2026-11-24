import { expect, it } from 'vitest'
import { FIRST_FORM, deviceAmong, lastRequest, requestFor } from './connectionForm'

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
