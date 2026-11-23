import { expect, it } from 'vitest'
import { DETECT_CODES, likelyPath } from './detect'

it('names the port the backend would use, and none when it could not tell', () => {
  expect(likelyPath([{ path: '/dev/ttyS0' }, { path: '/dev/ttyACM0', board: 'CubePilot', likely: true }])).toBe('/dev/ttyACM0')
  expect(likelyPath([{ path: '/dev/ttyS0' }])).toBeNull()
  expect(likelyPath([])).toBeNull()
})

it('knows the reasons a detection fails', () => {
  expect(DETECT_CODES).toEqual(['NO_SERIAL_PORT', 'NO_AUTOPILOT_PORT', 'PORT_GONE', 'NO_MAVLINK'])
})
