// The map's tile service of the mock backend: the sources, what a cache of a few tiles holds, and clearing it. The mock reads the
// same settings entries the real backend does (`map.enabled`, `map.offline`, `map.source`, `map.customUrl`, `map.cacheMb`), and
// says what it makes of them (an address that cannot be used, the host of one that can). It serves no tile: the map engine's
// tests bring their own.
import type { Envelope } from '@pico-desktop/protocol'
import type { MapSource, MapSources, Settings } from '@/generated/app'
import { MAP_CACHE_SIZES_MB, MAP_SOURCES, flagOf, pickOf } from '@/lib/map/mapPrefs'

type Reply = (p: Envelope['p']) => void

/** What the mock's cache holds at the start: 40 tiles of 12 KB. */
const TILES = 40
const TILE_BYTES = 12_000

/** An address the mock takes as a custom source: https with the three placeholders, or http to this computer. */
const USABLE = /^(?:https:\/\/[^@/]+|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)\/\S*\{z\}\S*\{x\}\S*\{y\}/u

/**
 * The value of a settings entry.
 *
 * @param settings the settings
 * @param key the key
 * @returns its value, or undefined
 */
function entry(settings: Settings, key: string): string | undefined {
  return settings.ui.find(one => one.key === key)?.value
}

/**
 * Why an address cannot be a custom source, as the backend says it (in short: https, or http to this computer, with the three
 * placeholders).
 *
 * @param url the address
 * @returns the reason, or null
 */
function problemOf(url: string): string | null {
  if (url === '') {
    return 'no address is set'
  }

  return USABLE.test(url) ? null : 'the address must start with https:// and have {z}, {x} and {y}'
}

/**
 * The sources the mock lists: the built-in one, and the custom one with its host when its address can be used.
 *
 * @param url the custom address
 * @param usable whether it can be used
 * @returns the sources
 */
function sourcesOf(url: string, usable: boolean): MapSource[] {
  const osm = {
    id: 'osm',
    name: 'OpenStreetMap',
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    allowOffline: false,
    custom: false,
  }
  const custom = { id: 'custom', name: 'Custom', attribution: '', attributionUrl: '', allowOffline: true, custom: true }

  return [osm, usable ? { ...custom, host: new URL(url.replace(/\{[xyz]\}/gu, '1')).hostname } : custom]
}

/** The mock's tile service. */
export class MockMap {
  tiles = TILES

  /**
   * The sources, and what the settings come to.
   *
   * @param settings the settings the mock holds
   * @param ok sends the answer
   */
  sources(settings: Settings, ok: Reply): void {
    const source = pickOf(entry(settings, 'map.source'), MAP_SOURCES, 'osm')
    const url = entry(settings, 'map.customUrl') ?? ''
    const problem = problemOf(url)
    const answer: MapSources = {
      sources: sourcesOf(url, problem === null),
      source,
      enabled: flagOf(entry(settings, 'map.enabled'), true),
      offline: flagOf(entry(settings, 'map.offline'), false),
      cacheMb: Number(pickOf(entry(settings, 'map.cacheMb'), MAP_CACHE_SIZES_MB, '500')),
      cacheBytes: this.tiles * TILE_BYTES,
      counted: true,
    }
    if (source === 'custom' && problem !== null) {
      answer.customError = problem
    }
    ok(answer)
  }

  /**
   * Clears the cache.
   *
   * @param ok sends the answer
   */
  clear(ok: Reply): void {
    ok({ files: this.tiles, bytes: this.tiles * TILE_BYTES })
    this.tiles = 0
  }
}
