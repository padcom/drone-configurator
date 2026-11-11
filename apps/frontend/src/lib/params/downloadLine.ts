// The one muted line under the parameter list that says how the last download came: "Parameters: 1370 · by file transfer in
// 0.8 s", or by the list and why not by file transfer. A diagnostic, not a choice for the user.
import type { DownloadInfo } from '@/composables/useParams'

/** Looks a message up (vue-i18n's `t`). */
type Say = (key: string, named?: Record<string, unknown>) => string

/** The reasons the backend gives for not using the file transfer that the interface has words for. */
const REASONS = ['unsupported', 'timeout', 'protocol', 'incomplete', 'disabled']

/**
 * The line about a download that came by the list.
 *
 * @param fallback why the file transfer was not used, if the backend says
 * @param named the count of parameters and the time in seconds
 * @param t looks a message up
 * @returns the line (a reason the interface has no words for is not made up: the line is the plain one)
 */
function byList(fallback: string | undefined, named: Record<string, unknown>, t: Say): string {
  if (fallback === undefined || !REASONS.includes(fallback)) {
    return t('params.progress.info.list', named)
  }

  return t('params.progress.info.listBecause', { ...named, reason: t(`params.progress.fallback.${fallback}`) })
}

/**
 * Whether a download says how it came and how long it took.
 *
 * @param info how it came, or null before the first download
 * @returns true when there is a way and a time to speak of
 */
function known(info: DownloadInfo | null): info is DownloadInfo & { elapsedMs: number } {
  return info?.source !== undefined && info.elapsedMs !== undefined
}

/**
 * The line about a download.
 *
 * @param info how it came, or null before the first download
 * @param count how many parameters there are
 * @param t looks a message up
 * @returns the line, or null when there is nothing to say (no download yet, or a backend that does not say how it came)
 */
export function downloadLine(info: DownloadInfo | null, count: number, t: Say): string | null {
  if (!known(info)) {
    return null
  }
  const named = { count, seconds: (info.elapsedMs / 1000).toFixed(1) }

  return info.source === 'ftp' ? t('params.progress.info.ftp', named) : byList(info.fallback, named, t)
}
