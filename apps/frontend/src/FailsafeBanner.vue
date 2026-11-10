<template>
  <Banner v-if="messages.failsafe.value" id="failsafe-banner" class="failsafe" tone="warn" urgent>
    <strong>{{ messages.failsafe.value.text }}</strong>
    <template #actions>
      <Button id="failsafe-dismiss" @click="messages.dismissFailsafe()">{{ t('messages.dismiss') }}</Button>
    </template>
  </Banner>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Banner from './kit/Banner.vue'
import Button from './kit/Button.vue'
import { useConfigurator } from './useConfigurator'

// A failsafe that has taken over (a critical message that says so, such as "Battery failsafe: returning home"), told over the
// map in the urgent style until it is dismissed. It is an alert, so a screen reader reads it out when it appears.
const { t } = useI18n()
const { messages } = useConfigurator()
</script>
