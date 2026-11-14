<template>
  <section class="settings-map" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('settings.map.title') }}</h3>
    <p id="map-privacy" class="muted">{{ t('settings.map.privacy', { agent: MAP_USER_AGENT }) }}</p>
    <Banner v-if="map.info.value?.notice" id="map-notice" tone="warn">{{ t('settings.map.defaults') }}</Banner>
    <div class="settings-row">
      <Toggle id="map-enabled" v-model="enabled" :aria-describedby="`${uid}-enabled-help`">
        {{ t('settings.map.enabled') }}
      </Toggle>
      <p :id="`${uid}-enabled-help`" class="muted">{{ t('settings.map.enabledHelp') }}</p>
    </div>
    <div class="settings-row">
      <Toggle id="map-offline" v-model="offline" :aria-describedby="`${uid}-offline-help`">
        {{ t('settings.map.offline') }}
      </Toggle>
      <p :id="`${uid}-offline-help`" class="muted">{{ t('settings.map.offlineHelp') }}</p>
    </div>
    <p id="map-state" class="muted" role="status">{{ stateText }}</p>
    <div class="settings-row">
      <label :for="`${uid}-source`">{{ t('settings.map.source') }}</label>
      <Select :id="`${uid}-source`" v-model="source" :options="sourceOptions" :aria-describedby="`${uid}-attribution`" />
      <p :id="`${uid}-attribution`" class="muted">{{ attributionText }}</p>
    </div>
    <div v-if="source === 'custom'" class="settings-row">
      <label :for="`${uid}-url`">{{ t('settings.map.url') }}</label>
      <TextInput :id="`${uid}-url`" v-model="urlText" mono :aria-describedby="`${uid}-url-help`" @change="keepUrl" />
      <p :id="`${uid}-url-help`" class="muted">{{ urlHelp }}</p>
      <Banner v-if="map.info.value?.customError" id="map-url-error" tone="error">
        {{ t('settings.map.urlProblem', { reason: map.info.value.customError }) }}
      </Banner>
    </div>
    <div class="settings-row">
      <label :for="`${uid}-cache`">{{ t('settings.map.cache') }}</label>
      <Select :id="`${uid}-cache`" v-model="cacheMb" :options="cacheOptions" />
      <p id="map-cache-used" class="muted">{{ usedText }}</p>
      <Button id="map-clear" :disabled="map.busy.value" @click="map.clear()">{{ t('settings.map.clear') }}</Button>
      <p v-if="map.cleared.value" id="map-cleared" class="muted" role="status">{{ clearedText }}</p>
    </div>
    <Banner v-if="map.error.value" id="map-error" tone="error">{{ map.error.value }}</Banner>
  </section>
</template>

<script setup lang="ts">
// "Map" in Settings: whether the map's tiles are loaded from the internet at all (on by default: the area the map shows, the IP
// address and the User-Agent are known to the tile server then, and the text says so), offline mode (only the tiles that were
// kept), the source (OpenStreetMap, or an address of the user's own: https anywhere, http only to this computer), the size of the
// cache and clearing it. These are entries of the settings document, which the backend reads itself when it is asked for a tile,
// so the page only edits them. Only the HOST of a custom address is ever shown back (the rest of it may hold a key).
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'
import { sizeText } from '@/lib/logs/vehicleLogs'
import {
  MAP_CACHE_KEY,
  MAP_CACHE_SIZES_MB,
  MAP_ENABLED_KEY,
  MAP_OFFLINE_KEY,
  MAP_SOURCE_KEY,
  MAP_URL_KEY,
  MAP_USER_AGENT,
} from '@/lib/map/mapPrefs'

const { t } = useI18n()
const { number } = useFormat()
const { map } = useConfigurator()
const uid = useId()

const enabled = computed({
  get: () => map.enabled.value,
  set: (next: boolean) => void map.choose(MAP_ENABLED_KEY, String(next)),
})
const offline = computed({
  get: () => map.offline.value,
  set: (next: boolean) => void map.choose(MAP_OFFLINE_KEY, String(next)),
})
const source = computed({
  get: () => map.source.value,
  set: (next: string) => void map.choose(MAP_SOURCE_KEY, next),
})
const cacheMb = computed({
  get: () => map.cacheMb.value,
  set: (next: string) => void map.choose(MAP_CACHE_KEY, next),
})
/** What is typed in the address field: kept when the settings change it under the user's hands. */
const urlText = ref(map.customUrl.value)
watch(map.customUrl, next => {
  urlText.value = next
})

/** Keeps the address that was typed (the backend says at once whether it can be used). */
function keepUrl(): void {
  void map.choose(MAP_URL_KEY, urlText.value)
}

const sourceOptions = computed(() => (map.info.value?.sources ?? [
  { id: 'osm', name: 'OpenStreetMap' },
  { id: 'custom', name: t('settings.map.custom') },
]).map(one => ({ value: one.id, label: one.id === 'custom' ? t('settings.map.custom') : one.name })))
const cacheOptions = MAP_CACHE_SIZES_MB.map(value => ({ value, label: sizeText(Number(value) * 1_000_000, number) }))

/** What the source in use must be credited with. */
const attributionText = computed(() => {
  const found = map.info.value?.sources.find(one => one.id === source.value)

  if (found === undefined || found.attribution === '') {
    return t('settings.map.noAttribution')
  }

  return t('settings.map.attribution', { text: found.attribution, url: found.attributionUrl })
})
const urlHelp = computed(() => {
  const host = map.info.value?.sources.find(one => one.id === 'custom')?.host

  return host === undefined ? t('settings.map.urlHelp') : t('settings.map.urlHost', { host })
})
const usedText = computed(() => {
  const info = map.info.value
  if (info === null) {
    return ''
  }
  const bytes = sizeText(Number(info.cacheBytes), number)

  return info.counted ? t('settings.map.used', { size: bytes }) : t('settings.map.counting', { size: bytes })
})
const clearedText = computed(() => {
  const done = map.cleared.value ?? { files: 0, bytes: 0 }

  return t('settings.map.cleared', { count: done.files, size: sizeText(done.bytes, number) })
})
/**
 * What the settings come to: tiles off, offline, or online.
 *
 * @returns `disabled`, `offline` or `online`
 */
function settledKey(): string {
  if (!enabled.value) {
    return 'disabled'
  }

  return offline.value ? 'offline' : 'online'
}

/**
 * Whether the backend is staying away from the server: what it last said counts only while the settings leave the server to be
 * asked at all (tiles on, not offline).
 *
 * @returns true if it is
 */
function backingOff(): boolean {
  return map.status.value?.state === 'backing-off' && map.enabled.value && !map.offline.value
}

/**
 * What the tiles are doing, as the key of its words: what the settings come to, unless the backend said it is backing off.
 *
 * @returns `backingOff`, `disabled`, `offline` or `online`
 */
function stateKey(): string {
  return backingOff() ? 'backingOff' : settledKey()
}

/** What the tiles are doing now, in words. */
const stateText = computed(() => t(`settings.map.state.${stateKey()}`, { reason: map.status.value?.reason ?? '' }))

onMounted(() => {
  void map.refresh()
})
</script>
