import { expect, it } from 'vitest'
import { parseLast } from './connectionForm'

const form = { transport: 'serial', host: '', port: '', device: '/dev/ttyACM0', baud: '115200' }

it('reads back a connection that was kept', () => {
  expect(parseLast(JSON.stringify(form))).toEqual(form)
})

it('uses nothing that is not what was written: missing, not JSON, another shape, an unknown kind of link', () => {
  expect(parseLast(undefined)).toBeNull()
  expect(parseLast('not json')).toBeNull()
  expect(parseLast('null')).toBeNull()
  expect(parseLast('[]')).toBeNull()
  expect(parseLast(JSON.stringify({ ...form, transport: 'carrier-pigeon' }))).toBeNull()
  expect(parseLast(JSON.stringify({ ...form, baud: 115_200 }))).toBeNull()
  expect(parseLast(JSON.stringify({ transport: 'udp' }))).toBeNull()
})
