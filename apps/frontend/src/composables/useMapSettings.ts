// The map's tile settings and what the backend says about its tiles: the switch, offline mode, the source and its address, the
// cap of the cache, and what the cache holds. The settings are kept in the settings document, which the BACKEND reads itself when
// it is asked for a tile (so what is chosen here is what it does); this model edits the entries, shows a choice at once, and asks
// the backend (`map.sources`) what it makes of them: which sources there are, why a custom address is not usable, how big the
// cache is.
// It also keeps the last `map.status` (backing off, offline, switched off) and the result of clearing the cache.
import { type ComputedRef, type Ref, type ShallowRef, computed, ref, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import type { MapSources, MapStatus } from '@/generated/app'
import {
  MAP_CACHE_KEY,
  MAP_CACHE_SIZES_MB,
  MAP_DEFAULT_CACHE,
  MAP_ENABLED_KEY,
  MAP_OFFLINE_KEY,
  MAP_SOURCES,
  MAP_SOURCE_KEY,
  MAP_URL_KEY,
  flagOf,
  pickOf,
} from '@/lib/map/mapPrefs'
import type { SettingsModel } from './useSettings'

/** What the model needs. */
export interface MapSettingsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The settings, whose `ui` entries hold the preferences. */
  settings: SettingsModel
}

/** The map's tile settings. */
export interface MapSettingsModel {
  /** Whether tiles are loaded from the internet at all (on by default). */
  readonly enabled: ComputedRef<boolean>
  /** Whether only the tiles that were kept are used. */
  readonly offline: ComputedRef<boolean>
  /** The source in use: `osm` or `custom`. */
  readonly source: ComputedRef<string>
  /** The address of the custom source, as typed (the user's own text). */
  readonly customUrl: ComputedRef<string>
  /** The cap of the cache, in megabytes. */
  readonly cacheMb: ComputedRef<string>
  /** What the backend says of the sources and the cache, or null before it has been asked. */
  readonly info: ShallowRef<MapSources | null>
  /** The last state the backend sent of its tiles, or null. */
  readonly status: ShallowRef<MapStatus | null>
  /** What clearing the cache removed, or null. */
  readonly cleared: ShallowRef<{ files: number, bytes: number } | null>
  /** Whether a call is under way. */
  readonly busy: Readonly<Ref<boolean>>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** Chooses a setting (it shows at once), and asks the backend again what it makes of it. */
  choose: (key: string, value: string) => Promise<void>
  /** Asks the backend about the sources and the cache. */
  refresh: () => Promise<void>
  /** Removes every kept tile. */
  clear: () => Promise<void>
}

/** What was chosen and the settings have not answered for yet: shown at once. */
const pending = shallowRef<Record<string, string>>({})

/** Forgets the choices the settings have not answered for (for the tests: they are shared by the whole page). */
export function forgetMapChoices(): void {
  pending.value = {}
}

/** The model. */
class MapSettings implements MapSettingsModel {
  readonly enabled: ComputedRef<boolean>
  readonly offline: ComputedRef<boolean>
  readonly source: ComputedRef<string>
  readonly customUrl: ComputedRef<string>
  readonly cacheMb: ComputedRef<string>
  readonly info = shallowRef<MapSources | null>(null)
  readonly status = shallowRef<MapStatus | null>(null)
  readonly cleared = shallowRef<{ files: number, bytes: number } | null>(null)
  readonly busy = ref(false)
  readonly error = shallowRef<string | null>(null)

  /**
   * Makes the model, and listens to the state of the tiles.
   *
   * @param deps the client and the settings
   */
  constructor(private readonly deps: MapSettingsDeps) {
    const held = (key: string) => pending.value[key] ?? deps.settings.uiValue(key)
    this.enabled = computed(() => flagOf(held(MAP_ENABLED_KEY), true))
    this.offline = computed(() => flagOf(held(MAP_OFFLINE_KEY), false))
    this.source = computed(() => pickOf(held(MAP_SOURCE_KEY), MAP_SOURCES, 'osm'))
    this.customUrl = computed(() => held(MAP_URL_KEY) ?? '')
    this.cacheMb = computed(() => pickOf(held(MAP_CACHE_KEY), MAP_CACHE_SIZES_MB, MAP_DEFAULT_CACHE))
    deps.client.onEvent('map.status', status => {
      this.status.value = status
    })
  }

  async choose(key: string, value: string): Promise<void> {
    pending.value = { ...pending.value, [key]: value }
    await this.deps.settings.setUi(key, value)

    if (pending.value[key] === value) {
      const rest = { ...pending.value }
      delete rest[key]
      pending.value = rest
    }
    await this.refresh()
  }

  async refresh(): Promise<void> {
    try {
      this.info.value = await this.deps.client.call('map.sources', null)
      this.error.value = null
    } catch (error) {
      this.error.value = describeError(error)
    }
  }

  async clear(): Promise<void> {
    this.busy.value = true

    try {
      const done = await this.deps.client.call('map.clear', null)
      this.cleared.value = { files: done.files, bytes: Number(done.bytes) }
      this.error.value = null
      await this.refresh()
    } catch (error) {
      this.error.value = describeError(error)
    } finally {
      this.busy.value = false
    }
  }
}

/**
 * The map's tile settings.
 *
 * @param deps the client and the settings
 * @returns the model
 */
export function useMapSettings(deps: MapSettingsDeps): MapSettingsModel {
  return new MapSettings(deps)
}
