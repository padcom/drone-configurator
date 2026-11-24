import { describe, expect, it } from 'vitest'
import type { LinkStats } from '@/generated/app'
import { translate as t } from '@/testing/testing'
import { useFormat } from '@/i18n/useFormat'
import { levelOf, linkDetails, linkValue, lossPercent, qualityOf } from './linkQuality'

const format = useFormat()

/**
 * A link's stats: a healthy one unless something is changed.
 *
 * @param change what differs
 * @returns the stats
 */
function stats(change: Partial<LinkStats> = {}): LinkStats {
  return {
    windowMs: 5000, received: 200, lost: 0, rxRate: 40, txRate: 6, rxBytes: 1520, txBytes: 144, latencyMs: 68, silentMs: 20,
    totalReceived: 1200, totalLost: 3, ...change,
  }
}

describe('the quality of a link', () => {
  it('is the share of the packets that arrived', () => {
    expect(lossPercent(stats({ received: 150, lost: 50 }))).toBe(25)
    expect(qualityOf(stats({ received: 150, lost: 50 }))).toBe(75)
    expect(linkValue(stats({ received: 196, lost: 4 }), format)).toBe('98%')
  })

  it('is whole when nothing was sent, not a division by zero', () => {
    expect(lossPercent(stats({ received: 0, lost: 0 }))).toBe(0)
    expect(qualityOf(stats({ received: 0, lost: 0 }))).toBe(100)
  })

  it('is good, weak from 5 % lost, half a second of latency or 2 s of silence, and poor from 20 %, 2 s or 5 s', () => {
    expect(levelOf(stats())).toBe('ok')
    expect(levelOf(stats({ received: 96, lost: 4 }))).toBe('ok')
    expect(levelOf(stats({ received: 95, lost: 5 }))).toBe('warn')
    expect(levelOf(stats({ latencyMs: 500 }))).toBe('warn')
    expect(levelOf(stats({ silentMs: 2000 }))).toBe('warn')
    expect(levelOf(stats({ received: 80, lost: 20 }))).toBe('error')
    expect(levelOf(stats({ latencyMs: 2000 }))).toBe('error')
    expect(levelOf(stats({ silentMs: 5000 }))).toBe('error')
    // a vehicle that does not answer the ping is not a bad link by that alone
    expect(levelOf(stats({ latencyMs: undefined }))).toBe('ok')
  })
})

describe('the details of a link', () => {
  it('say its loss, latency, rates both ways, silence and totals in words', () => {
    const lines = linkDetails(stats({ received: 150, lost: 50, rxRate: 30, rxBytes: 1140, txRate: 6, txBytes: 144 }), t, format)

    expect(lines.map(line => [line.label, line.value])).toEqual([
      ['Quality', '75% · poor'],
      ['Packet loss', '25.0% (50 of 200 packets)'],
      ['Latency', '68 ms'],
      ['Received', '30 packets/s · 1.1 kB/s'],
      ['Sent', '6.0 packets/s · 144 B/s'],
      ['Last packet', '0.0 s ago'],
      ['Since connecting', '3 of 1,203 packets lost'],
    ])
  })

  it('say that the ping was not answered, rather than a latency', () => {
    const latency = linkDetails(stats({ latencyMs: undefined }), t, format).find(line => line.id === 'latency')

    expect(latency?.value).toBe('No answer to the ping')
  })
})
