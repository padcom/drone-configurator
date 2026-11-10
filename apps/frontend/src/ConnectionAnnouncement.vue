<template>
  <p id="connection" class="visually-hidden" role="status"><span>{{ t(`connection.state.${state}`) }}</span>{{ found }}
    <span v-if="retrying">{{ retrying }}</span>
    <span v-if="resumed">{{ t('connection.resumed') }}</span>
    <span v-if="fields.error.value">{{ fields.error.value }}</span>
    <span v-if="fields.notice.value">{{ fields.notice.value }}</span></p>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from './useConfigurator'
import { useConnectDialog } from './useConnectDialog'
import { useToasts } from './toasts'

// What the link is doing and why it last failed, said to a screen reader: a live region that is always in the page (in the
// top bar, out of sight), so a change of the connection is read out. The top bar's vehicle cell shows the state, the
// vehicle and the tries to the eye; what does not fit there is a toast: the backend's own error (unless the Connect dialog,
// which shows it itself, is open) and its notice. That a link that came back is the same vehicle is said here, to the ear.
const { t } = useI18n()
const { fields } = useConfigurator()
const dialog = useConnectDialog()
const toasts = useToasts()
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

watch(fields.error, message => {
  if (message && !dialog.open.value) {
    toasts.push({ severity: 'error', text: message })
  }
})
watch(fields.notice, message => {
  if (message) {
    // Sticky: the old line stayed until the next Connect, and "Connect again to continue" must not be missed.
    toasts.push({ severity: 'warning', text: message, sticky: true })
  }
})
</script>
