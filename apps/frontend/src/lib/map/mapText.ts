// What the map says in words: the credit of the source (always, linked), and the one line about why tiles are missing. The
// words are the interface's (a message of the dictionary); the reasons the backend gives are English, for people, and are shown
// as they are only where a message has a place for them.
import type { MapSources, MapStatus } from '@/generated/app'
import type { VehicleMark } from './track'

/** The credit the built-in source must carry (the tile usage policy of OpenStreetMap), until the backend has said its own. */
export const OSM_CREDIT = { text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }

/** Looks up a message (with the values it has). */
export type Say = (key: string, named?: Record<string, unknown>) => string

/** What the map knows of its tiles. */
export interface ChipState {
  /** The tiles switch of the settings. */
  enabled: boolean
  /** Offline mode of the settings. */
  offline: boolean
  /** The last state the backend sent, if any. */
  status: MapStatus | null
  /** The codes of the failures of the tiles that are wanted now. */
  problems: readonly string[]
}

/**
 * The credit to show with the map: the one of the source in use. The built-in source's is known without asking (the map never
 * shows tiles of it without it); a custom source says its own, and may say none.
 *
 * @param info what the backend says of the sources, if it has said
 * @param source the source in use
 * @returns the words and the address they link to (no words when the source asks for none)
 */
export function creditOf(info: MapSources | null, source: string): { text: string, url: string } {
  const found = info?.sources.find(one => one.id === source)
  if (found) {
    return { text: found.attribution, url: found.attributionUrl }
  }

  return source === 'osm' ? OSM_CREDIT : { text: '', url: '' }
}

/** The failures that have a sentence of their own (the others are "not available"). */
const SENTENCES: Readonly<Record<string, string>> = {
  OFFLINE_MISS: 'map.chip.offlineMiss',
  BAD_REQUEST: 'map.chip.code.BAD_REQUEST',
  TOO_BIG: 'map.chip.code.TOO_BIG',
  BAD_TYPE: 'map.chip.code.BAD_TYPE',
  RATE_LIMITED: 'map.chip.code.RATE_LIMITED',
  UNAVAILABLE: 'map.chip.code.UNAVAILABLE',
}

/**
 * The line about the server's trouble: what the backend said of it (no time is promised: the backend decides when it asks
 * again, and that is anything from a moment to minutes).
 *
 * @param state what the map knows
 * @param say looks up a message
 * @returns the line
 */
function pausedLine(state: ChipState, say: Say): string {
  const reason = state.status?.reason

  return reason ? say('map.chip.backingOff', { reason }) : say('map.chip.backingOffPlain')
}

/**
 * The line about a switch: the tiles are off, or the backend is holding back after trouble.
 *
 * @param state what the map knows
 * @param say looks up a message
 * @returns the line, or nothing
 */
function switchLine(state: ChipState, say: Say): string {
  if (!state.enabled) {
    return say('map.chip.disabled')
  }

  return state.status?.state === 'backing-off' ? pausedLine(state, say) : ''
}

/**
 * What the backend said of why the server could not be reached (only for that failure).
 *
 * @param state what the map knows
 * @param code the code of the failure
 * @returns the reason, or nothing
 */
function unreachableReason(state: ChipState, code: string): string | undefined {
  return code === 'UNAVAILABLE' ? state.status?.reason : undefined
}

/**
 * The sentence for the code of a tile that failed: the reason the backend gave when the server could not be reached, else one
 * short sentence for the codes the map keeps (never a bare code).
 *
 * @param state what the map knows
 * @param code the code
 * @param say looks up a message
 * @returns the sentence
 */
function codeLine(state: ChipState, code: string, say: Say): string {
  const reason = unreachableReason(state, code)
  if (reason) {
    return say('map.chip.unavailable', { reason })
  }

  return say(SENTENCES[code] ?? 'map.chip.generic')
}

/**
 * The line about the tiles that have failed: the first code that is not a missing tile (a tile the server does not have is
 * nothing to say), told once for all of them.
 *
 * @param state what the map knows
 * @param say looks up a message
 * @returns the line, or nothing when no tile failed
 */
function failureLine(state: ChipState, say: Say): string {
  const code = state.problems.find(problem => problem !== 'NOT_FOUND')

  return code === undefined ? '' : codeLine(state, code, say)
}

/**
 * The one line about the tiles, or nothing when they are fine. A switch is said before a failure, a failure before offline mode.
 *
 * @param state what the map knows
 * @param say looks up a message
 * @returns the line
 */
export function chipOf(state: ChipState, say: Say): string {
  return switchLine(state, say) || failureLine(state, say) || (state.offline ? say('map.chip.offline') : '')
}

/**
 * How long ago the vehicle was heard, in words.
 *
 * @param mark the vehicle on the map
 * @param say looks up a message
 * @returns for example "last heard 5 s ago"
 */
export function lastHeardText(mark: VehicleMark, say: Say): string {
  return say('map.vehicle.lastHeard', { seconds: Math.round(mark.ageMs / 1000) })
}

/**
 * What a marker of the vehicle says to a screen reader: where it is, the way it heads and how high it is above home (each only
 * when the vehicle said it), and (when its position is old) how long ago it was heard.
 *
 * @param mark the vehicle on the map
 * @param say looks up a message
 * @returns the words
 */
export function vehicleLabel(mark: VehicleMark, say: Say): string {
  const parts = [
    say('map.vehicle.at', { lat: mark.lat.toFixed(5), lon: mark.lon.toFixed(5) }),
    mark.heading === undefined ? '' : say('map.vehicle.heading', { heading: Math.round(mark.heading) }),
    mark.height === undefined ? '' : say('map.vehicle.above', { height: Math.round(mark.height) }),
  ]
  const where = parts.filter(Boolean).join(', ')

  return mark.stale ? `${where} ${lastHeardText(mark, say)}` : where
}
