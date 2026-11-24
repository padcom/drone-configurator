// The endpoints of the forwarding as the settings keep them: read as the backend reads them (only the ones that make sense, at
// most 16), written back, and checked before one is added.
import { describe, expect, it } from 'vitest'
import { MAX_ENDPOINTS, endpointKey, endpointsText, parseEndpoints, problemOf } from './endpoints'

describe('the endpoints in the settings', () => {
  it('are none when there is no entry, or it is not a list', () => {
    expect(parseEndpoints(undefined)).toEqual([])
    expect(parseEndpoints('not json')).toEqual([])
    expect(parseEndpoints('{"kind":"udp"}')).toEqual([])
  })

  it('keeps only the endpoints that make sense, in order', () => {
    expect(parseEndpoints(JSON.stringify([null, 3]))).toEqual([])
    const text = JSON.stringify([
      { kind: 'udp', host: '127.0.0.1', port: 14550, on: true },
      { kind: 'serial', host: 'x', port: 1, on: true },
      { kind: 'tcp', host: '', port: 5760, on: true },
      { kind: 'tcp', host: 'h', port: 70_000, on: true },
      { kind: 'tcp', host: 'gcs.local', port: 5762 },
      { kind: 'tcp', host: 'gcs.local', port: 5763, on: false },
    ])

    expect(parseEndpoints(text).map(endpointKey)).toEqual(['udp:127.0.0.1:14550', 'tcp:gcs.local:5763'])
  })
})

describe('the endpoints, at most and written back', () => {
  it('takes at most 16', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'udp', host: '127.0.0.1', port: 15_000 + i, on: true }))

    expect(parseEndpoints(JSON.stringify(many))).toHaveLength(MAX_ENDPOINTS)
  })

  it('writes back only what the backend reads', () => {
    const extra = { kind: 'udp' as const, host: 'h', port: 1, on: false, note: 'x' }

    expect(endpointsText([extra])).toBe('[{"kind":"udp","host":"h","port":1,"on":false}]')
    expect(parseEndpoints(endpointsText([extra]))).toEqual([{ kind: 'udp', host: 'h', port: 1, on: false }])
  })
})

describe('adding an endpoint', () => {
  const list = [{ kind: 'udp' as const, host: '127.0.0.1', port: 14_550, on: true }]

  it('takes a host and a port', () => {
    expect(problemOf(list, { kind: 'tcp', host: ' 10.0.0.2 ', port: ' 5760 ' })).toBeNull()
  })

  it('says what is wrong with the host or the port', () => {
    expect(problemOf(list, { kind: 'udp', host: '', port: '14551' })).toBe('host')
    expect(problemOf(list, { kind: 'udp', host: 'a b', port: '14551' })).toBe('host')
    expect(problemOf(list, { kind: 'udp', host: 'h', port: '0' })).toBe('port')
    expect(problemOf(list, { kind: 'udp', host: 'h', port: '65536' })).toBe('port')
    expect(problemOf(list, { kind: 'udp', host: 'h', port: '1.5' })).toBe('port')
  })

  it('refuses the same program twice, and a full list', () => {
    expect(problemOf(list, { kind: 'udp', host: '127.0.0.1', port: '14550' })).toBe('duplicate')
    // The same host and port over the other protocol is another endpoint.
    expect(problemOf(list, { kind: 'tcp', host: '127.0.0.1', port: '14550' })).toBeNull()
    const full = Array.from({ length: MAX_ENDPOINTS }, (_, i) => ({ kind: 'udp' as const, host: 'h', port: i + 1, on: true }))
    expect(problemOf(full, { kind: 'udp', host: 'other', port: '1' })).toBe('full')
  })
})
