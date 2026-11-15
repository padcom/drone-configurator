// The preferences about the map's tiles, as the settings keep them (strings in the settings' `ui` entries). The BACKEND reads the
// same entries when it is asked for a tile, so these keys and values are a contract with it (apps/backend/maptiles.pi): the page
// only edits them, and cannot make the backend do what the settings do not allow.

/** The keys of the settings entries. */
export const MAP_ENABLED_KEY = 'map.enabled'

export const MAP_OFFLINE_KEY = 'map.offline'

export const MAP_SOURCE_KEY = 'map.source'

export const MAP_URL_KEY = 'map.customUrl'

export const MAP_CACHE_KEY = 'map.cacheMb'

/**
 * The User-Agent the backend sends to a tile server (it names the project and its repository, not a person). The backend has its
 * own copy (apps/backend/maptiles.pi); the page shows it so that the user knows what the server is told.
 */
export const MAP_USER_AGENT = 'DroneConfigurator/0.1.0 (+https://github.com/padcom/drone-configurator)'

/** The sources: the built-in one and the one the user gives an address for. */
export const MAP_SOURCES = ['osm', 'custom'] as const

/** The sizes of the cache that can be chosen (megabytes). */
export const MAP_CACHE_SIZES_MB = ['50', '200', '500', '1000', '2000', '5000'] as const

/** What is chosen until the settings say otherwise: tiles on, online, the built-in source, 500 MB. */
export const MAP_DEFAULT_CACHE = '500'

/**
 * A switch as the settings hold it ("true" or "false").
 *
 * @param text what the settings hold, if anything
 * @param otherwise what a missing or unknown entry means
 * @returns the switch
 */
export function flagOf(text: string | undefined, otherwise: boolean): boolean {
  if (text === 'true' || text === 'false') {
    return text === 'true'
  }

  return otherwise
}

/**
 * A choice among the ones offered.
 *
 * @param text what the settings hold, if anything
 * @param choices what can be chosen
 * @param fallback what a missing or unknown entry means
 * @returns the choice
 */
export function pickOf(text: string | undefined, choices: readonly string[], fallback: string): string {
  return text !== undefined && choices.includes(text) ? text : fallback
}
