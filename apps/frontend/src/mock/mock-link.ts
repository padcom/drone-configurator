// The link's quality as the mock backend says it (`link.stats`, #29): what the real one (apps/backend/linkstats.pi) sends once a
// second while a vehicle is connected. A healthy link of the simulator by default, with a little loss now and then; a test sets
// what it wants instead (`MockControl.link`).
import type { LinkStats } from '@/generated/app'

export type { LinkStats }

/** The packets a second the mock vehicle sends, and what we send it. */
const RX_RATE = 42
const TX_RATE = 6

/**
 * The n-th sample of the mock's link: a link that loses a packet every few seconds, with a round trip that moves a little.
 *
 * @param n which sample (0, 1, 2 ...)
 * @returns the stats
 */
export function linkStatsAt(n: number): LinkStats {
  const lost = n % 4 === 3 ? 1 : 0
  const received = RX_RATE * 5 - lost

  return {
    windowMs: 5000,
    received,
    lost,
    rxRate: received / 5,
    txRate: TX_RATE,
    rxBytes: received / 5 * 38,
    txBytes: TX_RATE * 24,
    latencyMs: 60 + (n % 5) * 4,
    silentMs: 20,
    totalReceived: RX_RATE * (n + 1),
    totalLost: Math.floor((n + 1) / 4),
  }
}
