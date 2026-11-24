// What the Flights list says of a recording this app made of a connection (#30): the library lists it with when it started
// (`started`) and whether it is being made now (`live`). The other recordings (`source` tlog, no `started`) were imported.
import type { LocalLog } from '@/generated/app'

/** How a log in the library came to be: from a vehicle, imported, or recorded by this app. */
export type LogOrigin = 'vehicle' | 'imported' | 'recorded'

/**
 * Where a log in the library came from.
 *
 * @param log the log
 * @returns its origin
 */
export function originOf(log: LocalLog): LogOrigin {
  if (log.source === 'dataflash') {
    return 'vehicle'
  }

  return log.started === undefined ? 'imported' : 'recorded'
}

/**
 * When a recording started, in the language of the interface.
 *
 * @param log the recording
 * @param locale the language
 * @returns the date and time
 */
export function startedText(log: LocalLog, locale: string): string {
  return new Date(Number(log.started ?? 0)).toLocaleString(locale)
}

/** The words for the state of a recording: being made, ended (verified) and not ended (cut short, or changed since). */
const RECORDED_STATES = {
  live: 'logs.flights.stateRecording',
  ended: 'logs.flights.stateRecorded',
  unfinished: 'logs.flights.stateRecordedUnfinished',
} as const

/**
 * The key of the words for the state of a recording this app made.
 *
 * @param log the recording
 * @returns the i18n key, or null when nothing is known of it yet (it was not read and is not being made)
 */
export function recordedStateKey(log: LocalLog): string | null {
  if (log.live === true) {
    return RECORDED_STATES.live
  }
  if (log.summary === undefined) {
    return null
  }

  return log.summary.verified ? RECORDED_STATES.ended : RECORDED_STATES.unfinished
}
