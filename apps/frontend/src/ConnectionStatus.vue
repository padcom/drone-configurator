<template>
  <p id="connection" role="status"><span class="badge" :class="state">{{ t(`connection.state.${state}`) }}</span>{{ found }}
    <span v-if="retrying" class="warn">{{ retrying }}</span>
    <span v-if="resumed" class="ok">{{ t('connection.resumed') }}</span>
    <span v-if="fields.error.value" class="error">{{ fields.error.value }}</span>
    <span v-if="fields.notice.value" class="warn">{{ fields.notice.value }}</span></p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from './useConfigurator'

// What the link is doing and why it last failed, as text under the top bar. A live region that is always in the page, so a
// change of the connection is read out. (The top bar's vehicle cell says the same in two lines; this one carries what does
// not fit there: the backend's own error and notice, and that a link that came back is the same vehicle.)
const { t } = useI18n()
const { fields } = useConfigurator()
const state = computed(() => fields.connection.value.state)
// Said only while the link is up: `resumed` describes the `connected` that followed a reconnect, not a later state.
const resumed = computed(() => state.value === 'connected' && fields.connection.value.resumed === true)
// While the backend brings the link back: which try this is, and how long until the next.
const retrying = computed(() => {
  const { attempt, nextRetryMs } = fields.connection.value

  return state.value === 'reconnecting'
    ? t('connection.retrying', { attempt: attempt ?? 1, seconds: Math.ceil((nextRetryMs ?? 0) / 1000) })
    : ''
})
// The vehicle's type and autopilot are the protocol's names, shown as they are.
const found = computed(() => {
  const info = fields.connection.value.vehicle

  return info ? t('connection.vehicle', { ...info }) : ''
})
</script>
