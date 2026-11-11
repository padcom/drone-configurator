<template>
  <p id="connection" class="visually-hidden" role="status"><span>{{ t(stateKey) }}</span>{{ found }}
    <span v-if="retrying">{{ retrying }}</span>
    <span v-if="resumed">{{ t('connection.resumed') }}</span>
    <span v-if="fields.error.value">{{ fields.error.value }}</span>
    <span v-if="fields.notice.value">{{ fields.notice.value }}</span></p>
  <!-- The end of a parameter download, said to the ear from here because the Parameters screen may not be open when it ends
       (the connection was made from another screen, or it is the automatic download after a link came back). Always there. -->
  <p id="download-announcement" class="visually-hidden" role="status">{{ downloadText }}</p>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isRebooting, rebootProgress } from '@/lib/fly/reboot'
import { useConfigurator } from '@/composables/useConfigurator'
import { useConnectDialog } from '@/composables/useConnectDialog'
import { useToasts } from '@/composables/toasts'
import { useDownloadText } from '@/composables/useDownloadText'

// What the link is doing and why it last failed, said to a screen reader: a live region that is always in the page (in the
// top bar, out of sight), so a change of the connection is read out. The top bar's vehicle cell shows the state, the
// vehicle and the tries to the eye; what does not fit there is a toast: the backend's own error (unless the Connect dialog,
// which shows it itself, is open) and its notice. That a link that came back is the same vehicle is said here, to the ear.
const { t } = useI18n()
const { fields } = useConfigurator()
const dialog = useConnectDialog()
const toasts = useToasts()
const downloadText = useDownloadText()
const state = computed(() => fields.connection.value.state)
// The vehicle went quiet because it was told to reboot: said as that, not as a lost link.
const quiet = computed(() => isRebooting(fields.connection.value))
const stateKey = computed(() => (quiet.value ? 'connection.rebooting' : `connection.state.${state.value}`))
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

// The notice toast is tied to the notice: it stays (sticky: "Connect again to continue" must not be missed) until the notice
// is gone (Connect clears it) or the link is up again, and a newer notice replaces it, so they do not pile up.
let noticeToast: number | undefined

/** Removes the toast of the notice, if there is one. */
function clearNoticeToast(): void {
  if (noticeToast !== undefined) {
    toasts.dismiss(noticeToast)
    noticeToast = undefined
  }
}

watch(fields.notice, message => {
  clearNoticeToast()

  if (message) {
    noticeToast = toasts.push({ severity: 'warning', text: message, sticky: true })
  }
})
watch(state, now => {
  if (now === 'connected') {
    clearNoticeToast()
  }
})

// A vehicle that was rebooting and is the same vehicle again is welcome back: a toast, since the cell only says "connected".
let rebooting = false

watch(fields.connection, connection => {
  const { rebooting: now, back } = rebootProgress(rebooting, connection)
  rebooting = now

  if (back) {
    const vehicle = connection.vehicle?.type ?? ''
    toasts.push({ id: 'reboot-back', severity: 'success', text: t('palette.vehicle.reboot.back', { vehicle }) })
  }
})
</script>
