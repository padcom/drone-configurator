<template>
  <p v-if="settings.notice.value" id="settings-notice" class="warn" role="status">
    {{ settings.notice.value }}
    <Button id="dismiss-settings-notice" @click="settings.dismissNotice()">{{ t('settings.dismiss') }}</Button>
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
