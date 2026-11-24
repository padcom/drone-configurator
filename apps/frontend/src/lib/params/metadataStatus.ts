// The line in Settings that says where the parameter metadata in use came from: ArduPilot's server, for which vehicle and
// version, whether it is that version's or the latest (and why), when, and whether it came from this computer's cache (and how
// fast); or a file the user loaded; or why nothing was downloaded. A diagnostic, not a choice.
import type { DownloadedMetadata, MetadataSource } from '@/composables/useMetadata'
import type { MetadataProgress } from '@/generated/app'
import type { Format } from '@/i18n/useFormat'

/** Looks a message up (vue-i18n's `t`). */
type Say = (key: string, named?: Record<string, unknown>) => string

/** What the line is about. */
export interface MetadataState {
  /** Where the metadata in use came from. */
  source: MetadataSource
  /** What the last download gave. */
  downloaded: DownloadedMetadata | null
  /** Why the last download gave nothing. */
  downloadError: string | null
  /** Whether a download runs. */
  downloading: boolean
  /** How far a download from the server is, when it says. */
  progress?: MetadataProgress | null
}

/**
 * Which file the download gave: the version's, the latest for a version the server has none for, or the latest for a vehicle that
 * said no released version.
 *
 * @param got what was downloaded
 * @param t looks a message up
 * @param f formats the date
 * @returns the first sentence
 */
function whichFile(got: DownloadedMetadata, t: Say, f: Format): string {
  const vehicle = t(`settings.metadata.vehicle.${got.vehicle}`)
  const named = { vehicle, version: got.version, date: f.dateTime(new Date(got.fetchedAt)) }
  if (got.exact) {
    return t('settings.metadata.status.exact', named)
  }

  return t(got.version === undefined ? 'settings.metadata.status.latest' : 'settings.metadata.status.latestFor', named)
}

/**
 * How the file came: from the cache (and how fast), and whether it may be out of date.
 *
 * @param got what was downloaded
 * @param t looks a message up
 * @param f formats the seconds
 * @returns the sentences, or '' when it came from the server just now
 */
function howItCame(got: DownloadedMetadata, t: Say, f: Format): string {
  const cache = got.fromCache ? ` ${t('settings.metadata.status.fromCache', { seconds: f.number(got.loadMs / 1000, 2) })}` : ''

  return got.stale ? `${cache} ${t('settings.metadata.status.stale')}` : cache
}

/**
 * How far a download from the server is, in megabytes.
 *
 * @param progress the bytes received and the size of the file
 * @param t looks a message up
 * @param f formats the numbers
 * @returns the line
 */
function howFar(progress: MetadataProgress, t: Say, f: Format): string {
  const mb = (bytes: number) => f.number(bytes / 1_000_000, 1)

  return t('settings.metadata.status.downloadingPart', { received: mb(progress.received), total: mb(progress.total) })
}

/**
 * The line that names no file: a download that runs (and how far it is, when it says), or a file the user loaded.
 *
 * @param state where the metadata came from
 * @param t looks a message up
 * @param f formats the numbers
 * @returns the line, or null
 */
function fixedLine(state: MetadataState, t: Say, f: Format): string | null {
  if (state.downloading) {
    return state.progress ? howFar(state.progress, t, f) : t('settings.metadata.status.downloading')
  }

  return state.source === 'file' ? t('settings.metadata.status.file') : null
}

/**
 * The line when nothing was downloaded: why, or that nothing was tried yet.
 *
 * @param error why the last download gave nothing
 * @param t looks a message up
 * @returns the line
 */
function nothing(error: string | null, t: Say): string {
  return error === null ? t('settings.metadata.status.none') : t('settings.metadata.status.failed', { error })
}

/**
 * The line.
 *
 * @param state where the metadata came from, and how the last download went
 * @param t looks a message up
 * @param f formats numbers and dates in the user's language
 * @returns the line
 */
export function metadataStatus(state: MetadataState, t: Say, f: Format): string {
  const fixed = fixedLine(state, t, f)
  if (fixed !== null) {
    return fixed
  }
  const got = state.source === 'download' ? state.downloaded : null

  return got ? `${whichFile(got, t, f)}${howItCame(got, t, f)}` : nothing(state.downloadError, t)
}
