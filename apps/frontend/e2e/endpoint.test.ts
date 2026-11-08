import { describe, expect, it } from 'vitest'
import { parseEndpoint } from './endpoint'

describe('parseEndpoint', () => {
  it('reads TCP and UDP endpoints', () => {
    expect(parseEndpoint('tcp:127.0.0.1:5760')).toEqual({ transport: 'tcp', host: '127.0.0.1', port: 5760 })
    expect(parseEndpoint('udp:localhost:14550')).toEqual({ transport: 'udp', host: 'localhost', port: 14_550 })
  })

  it.each(['', '127.0.0.1:5760', 'serial:/dev/ttyACM0:115200', 'tcp:127.0.0.1', 'tcp::5760', 'tcp:127.0.0.1:0', 'tcp:127.0.0.1:65536', 'tcp:127.0.0.1:port'])(
    'refuses %j',
    text => {
      expect(() => parseEndpoint(text)).toThrow('not an endpoint')
    },
  )
})
