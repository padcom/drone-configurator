<template>
  <section class="settings-recording" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('settings.recording.title') }}</h3>
    <p class="muted">{{ t('settings.recording.acts') }}</p>
    <div class="settings-row">
      <Toggle id="recording-enabled" v-model="enabled" :aria-describedby="`${uid}-enabled-help`">
        {{ t('settings.recording.enabled') }}
      </Toggle>
      <p :id="`${uid}-enabled-help`" class="muted">{{ t('settings.recording.enabledHelp') }}</p>
    </div>
    <div class="settings-row">
      <label :for="`${uid}-folder`">{{ t('settings.recording.folder') }}</label>
      <TextInput
        id="recording-folder"
        v-model="folderText"
        mono
        :aria-describedby="`${uid}-folder-help`"
        @change="keepFolder"
      />
      <p :id="`${uid}-folder-help`" class="muted">{{ folderHelp }}</p>
    </div>
    <div class="settings-row">
      <label :for="`${uid}-limit`">{{ t('settings.recording.limit') }}</label>
      <Select :id="`${uid}-limit`" v-model="limit" :options="limitOptions" :aria-describedby="`${uid}-limit-help`" />
      <p :id="`${uid}-limit-help`" class="muted">{{ t('settings.recording.limitHelp') }}</p>
    </div>
    <p id="recording-status" class="muted" role="status">{{ statusText }}</p>
    <p v-if="removedText" id="recording-removed" class="muted">{{ removedText }}</p>
    <Banner v-if="recording.error.value" id="recording-error" tone="error">{{ recording.error.value }}</Banner>
  </section>
</template>

<script setup lang="ts">
// "Recording" in Settings (#30): whether every connection is recorded to a tlog (on by default), the folder (empty for the app's
// data folder, which is shown), and the limit of the recordings together. These are entries of the settings document, which the
// backend reads at each connection, so the page only edits them, and says that they apply from the next connection. Below, what
// the recording is doing now, and how many old recordings the limit has removed. A recording that failed is said by the notice
// under the top bar, on every screen (RecordingNotice.vue), and here in the status line.
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { RecordingState } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { sizeText } from '@/lib/logs/vehicleLogs'
import {
  RECORDING_ENABLED_KEY,
  RECORDING_FOLDER_KEY,
  RECORDING_LIMITS_MB,
  RECORDING_LIMIT_KEY,
  failureKey,
  recordingPhase,
} from '@/lib/recording/recordingPrefs'

const { t } = useI18n()
const { number } = useFormat()
const { recording } = useConfigurator()
const uid = useId()

const enabled = computed({
  get: () => recording.enabled.value,
  set: (next: boolean) => void recording.choose(RECORDING_ENABLED_KEY, String(next)),
})
const limit = computed({
  get: () => recording.limitMb.value,
  set: (next: string) => void recording.choose(RECORDING_LIMIT_KEY, next),
})
/** What is typed in the folder field: kept when the settings change it under the user's hands. */
const folderText = ref(recording.folder.value)
watch(recording.folder, next => {
  folderText.value = next
})

/** Keeps the folder that was typed (empty: the default one). */
function keepFolder(): void {
  void recording.choose(RECORDING_FOLDER_KEY, folderText.value.trim())
}

const limitOptions = computed(() => RECORDING_LIMITS_MB.map(value => ({
  value,
  label: value === '0' ? t('settings.recording.noLimit') : sizeText(Number(value) * 1_000_000, number),
})))
const folderHelp = computed(() => {
  const inUse = recording.state.value?.folder ?? ''

  return inUse === '' ? t('settings.recording.folderHelp') : t('settings.recording.folderInUse', { path: inUse })
})

/**
 * The name of the file being recorded to.
 *
 * @param path its path
 * @returns its name
 */
function fileOf(path: string): string {
  return path.split(/[/\\]/u).pop() ?? path
}

/**
 * What the recording is doing, in words.
 *
 * @param state what the backend said
 * @returns the words
 */
function statusOf(state: RecordingState): string {
  if (state.failure) {
    return t('recording.stopped', { reason: t(failureKey(state.failure)) })
  }
  if (state.path !== undefined) {
    return t('settings.recording.now', { file: fileOf(state.path), size: sizeText(Number(state.bytes), number) })
  }

  return t(`settings.recording.${recordingPhase(state)}`)
}

/** What the recording is doing now, in words (nothing before the backend has said). */
const statusText = computed(() => (recording.state.value ? statusOf(recording.state.value) : ''))
const removedText = computed(() => {
  const state = recording.state.value

  return state && state.removed > 0
    ? t('settings.recording.removed', { count: state.removed, size: sizeText(Number(state.removedBytes), number) })
    : ''
})

onMounted(() => {
  void recording.refresh()
})
</script>
