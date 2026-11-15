// What the map says in words: the credit of the source (always, linked), and the one line about why tiles are missing. The
// words are the interface's (a message of the dictionary); the reasons the backend gives are English, for people, and are shown
// as they are only where a message has a place for them.
import type { MapSources, MapStatus } from '@/generated/app'

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

/**
 * Why tiles are not coming, as the server or the backend said it (or the code, when it did not).
 *
 * @param state what the map knows
 * @param code the code of the failure
 * @returns the reason
 */
function reasonOf(state: ChipState, code: string): string {
  return state.status?.reason ?? code
}

/**
 * The line about a switch: the tiles are off, or the server asked to slow down.
 *
 * @param state what the map knows
 * @param say looks up a message
 * @returns the line, or nothing
 */
function switchLine(state: ChipState, say: Say): string {
  if (!state.enabled) {
    return say('map.chip.disabled')
  }

  return state.status?.state === 'backing-off' ? say('map.chip.backingOff') : ''
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
  if (code === undefined) {
    return ''
  }

  return say(code === 'OFFLINE_MISS' ? 'map.chip.offlineMiss' : 'map.chip.unavailable', { reason: reasonOf(state, code) })
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
