import { expect, it } from 'vitest'
import { deviceAmong, portLabel, requestFor, vehicleText } from './connectionForm'

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

it('describes the vehicle, or nothing', () => {
  const vehicle = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' }

  expect(vehicleText(vehicle)).toBe(' · system 1/1 · QUADROTOR · ARDUPILOTMEGA')
  expect(vehicleText(undefined)).toBe('')
})

it('lists a port by its path and description', () => {
  expect(portLabel({ path: '/dev/ttyACM0', description: 'Pixhawk' })).toBe('/dev/ttyACM0 (Pixhawk)')
  expect(portLabel({ path: 'COM3' })).toBe('COM3')
})

it('keeps the chosen device while it is listed, else takes the first', () => {
  const ports = [{ path: 'a' }, { path: 'b' }]

  expect(deviceAmong('b', ports)).toBe('b')
  expect(deviceAmong('gone', ports)).toBe('a')
  expect(deviceAmong('a', [])).toBe('')
})
