<template>
  <!-- Always in the page, empty when there is nothing to say: a status that appears together with its text is often not
       announced by a screen reader, one that is already there and then changes is. -->
  <p id="settings-notice" class="warn" :class="{ 'has-text': settings.notice.value }" role="status">
    <template v-if="settings.notice.value">
      {{ settings.notice.value }}
      <Button id="dismiss-settings-notice" @click="settings.dismissNotice()">{{ t('settings.dismiss') }}</Button>
    </template>
  </p>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import { useConfigurator } from './useConfigurator'

// What the backend says about the settings file: that it could not be read and was set aside, that a newer version wrote
// it, or that it cannot be written to (so what is chosen is lost when the app closes). The text is the backend's own.
const { t } = useI18n()
const { settings } = useConfigurator()
</script>
