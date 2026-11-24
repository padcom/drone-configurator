<template>
  <!-- Always in the page (v-show), so that its words are read out when a recording fails: a status that appears together with
       its text is often not announced. -->
  <Banner v-show="failure" id="recording-notice" tone="warn">
    <template v-if="failure">
      {{ t('recording.stopped', { reason: t(failureKey(failure)) }) }}
      {{ t('recording.linkCarriesOn') }}
      {{ t(`recording.next.${failure.code}`) }}
    </template>
    <template #actions>
      <Button v-if="failure" id="recording-notice-settings" @click="openSettings()">{{ t('recording.openSettings') }}</Button>
      <Button v-if="failure" id="dismiss-recording-notice" @click="recording.dismiss()">{{ t('settings.dismiss') }}</Button>
    </template>
  </Banner>
</template>

<script setup lang="ts">
// A recording of the connection that stopped (#30): a full disk, a write error, a folder that cannot be made, or the recording
// reaching the limit by itself. It is said under the top bar, on every screen, with an icon and words, until it is dismissed or
// the next recording starts; the link to the vehicle is not touched by it, and the notice says so.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { failureKey } from '@/lib/recording/recordingPrefs'

const { t } = useI18n()
const router = useRouter()
const { recording } = useConfigurator()
const failure = computed(() => recording.state.value?.failure)

/** Opens Settings, where the folder and the limit are. */
function openSettings(): void {
  void router.push('/settings')
}
</script>
