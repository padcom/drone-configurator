// What the LINK cell and its details say of the link's quality (#29), from `link.stats` alone (no DOM). The backend counts the
// packets lost from their sequence numbers and times a TIMESYNC round trip; this says how good that is. A link is weak from 5 %
// lost, half a second of latency or two seconds without a packet, and poor from 20 % lost, two seconds of latency or five seconds
// of silence (when the backend takes the vehicle for gone).
import type { LinkStats } from '@/generated/app'
import type { Translate } from './telemetryCards'
import type { Format } from '@/i18n/useFormat'

/** How good the link is: good, weak (warn) or poor (error). */
export type LinkLevel = 'ok' | 'warn' | 'error'

/** From this much loss (%), and the latency and silence after it (ms), the link is weak. */
export const WEAK = { loss: 5, latencyMs: 500, silentMs: 2000 }

/** From this much, the link is poor. */
export const POOR = { loss: 20, latencyMs: 2000, silentMs: 5000 }

/** One line of the details. */
export interface LinkDetail {
  /** Which one. */
  id: 'quality' | 'loss' | 'latency' | 'received' | 'sent' | 'silent' | 'total'
  /** Its name. */
  label: string
  /** Its value, already formatted. */
  value: string
}

/**
 * The share of the packets sent in the window that never arrived.
 *
 * @param stats the link's stats
 * @returns percent, 0 to 100 (0 when nothing was sent)
 */
export function lossPercent(stats: LinkStats): number {
  const sent = stats.lost + stats.received

  return sent === 0 ? 0 : stats.lost * 100 / sent
}

/**
 * The link's quality as the cell shows it: the share of the packets that arrived.
 *
 * @param stats the link's stats
 * @returns percent, a whole number
 */
export function qualityOf(stats: LinkStats): number {
  return Math.round(100 - lossPercent(stats))
}

/**
 * Whether a measure has reached a threshold.
 *
 * @param stats the link's stats
 * @param limits the thresholds
 * @returns true when any of loss, latency or silence reaches its threshold
 */
function reaches(stats: LinkStats, limits: typeof WEAK): boolean {
  return lossPercent(stats) >= limits.loss || (stats.latencyMs ?? 0) >= limits.latencyMs || stats.silentMs >= limits.silentMs
}

/**
 * How good the link is.
 *
 * @param stats the link's stats
 * @returns its level
 */
export function levelOf(stats: LinkStats): LinkLevel {
  if (reaches(stats, POOR)) {
    return 'error'
  }

  return reaches(stats, WEAK) ? 'warn' : 'ok'
}

/**
 * A rate, in packets and bytes a second.
 *
 * @param packets packets a second
 * @param bytes bytes a second
 * @param t looks up a message
 * @param f formats numbers
 * @returns for example "42 packets/s · 1.6 kB/s"
 */
function rateText(packets: number, bytes: number, t: Translate, f: Format): string {
  const kilo = bytes >= 1000

  return t('topBar.link.rate', {
    packets: f.number(packets, packets < 10 ? 1 : 0),
    bytes: kilo ? f.quantity(bytes / 1000, 'kB/s', 1) : f.quantity(bytes, 'B/s', 0),
  })
}

/**
 * The latency, or that no ping was answered.
 *
 * @param stats the link's stats
 * @param t looks up a message
 * @param f formats numbers
 * @returns for example "68 ms"
 */
function latencyText(stats: LinkStats, t: Translate, f: Format): string {
  return stats.latencyMs === undefined ? t('topBar.link.noLatency') : f.quantity(stats.latencyMs, 'ms', 0)
}

/**
 * The value of the LINK cell.
 *
 * @param stats the link's stats
 * @param f formats numbers
 * @returns for example "98%"
 */
export function linkValue(stats: LinkStats, f: Format): string {
  return `${f.number(qualityOf(stats))}%`
}

/**
 * The lines of the details, in order.
 *
 * @param stats the link's stats
 * @param t looks up a message
 * @param f formats numbers
 * @returns the lines
 */
export function linkDetails(stats: LinkStats, t: Translate, f: Format): LinkDetail[] {
  const line = (id: LinkDetail['id'], value: string): LinkDetail => ({ id, label: t(`topBar.link.${id}`), value })
  const total = stats.totalLost + stats.totalReceived

  return [
    line('quality', `${linkValue(stats, f)} · ${t(`topBar.link.level.${levelOf(stats)}`)}`),
    line('loss', t('topBar.link.lossValue', {
      percent: f.number(lossPercent(stats), 1), lost: f.number(stats.lost), sent: f.number(stats.lost + stats.received),
    })),
    line('latency', latencyText(stats, t, f)),
    line('received', rateText(stats.rxRate, stats.rxBytes, t, f)),
    line('sent', rateText(stats.txRate, stats.txBytes, t, f)),
    line('silent', t('topBar.link.silentValue', { seconds: f.number(stats.silentMs / 1000, 1) })),
    line('total', t('topBar.link.totalValue', { lost: f.number(stats.totalLost), sent: f.number(total) })),
  ]
}
