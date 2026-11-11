<template>
  <Dialog v-if="dialog.open.value" :title="t('connect.title')" @close="dialog.hide()">
    <p class="connect-intro">{{ t('connect.intro') }}</p>
    <form id="connect" class="connect-form" @submit.prevent="connect">
      <div id="transport" class="connect-tabs" role="group" :aria-label="t('connection.transport.label')">
        <button
          v-for="transport in TRANSPORTS"
          :id="`transport-${transport}`"
          :key="transport"
          type="button"
          class="connect-tab"
          :aria-pressed="form.transport === transport ? 'true' : 'false'"
          @click="form.transport = transport"
        >
          {{ t(`connection.transport.${transport}`) }}
        </button>
      </div>
      <p v-if="form.transport === 'simulator'" class="connect-note">{{ t('connect.simulator') }}</p>
      <template v-else-if="serial">
        <label class="connect-field">{{ t('connection.device') }}
          <Select id="device" v-model="form.device" :options="devices" />
        </label>
        <label class="connect-field">{{ t('connection.baud') }}
          <Select id="baud" v-model="form.baud" :options="bauds" />
        </label>
      </template>
      <template v-else>
        <label class="connect-field">{{ t('connection.host') }}
          <TextInput id="host" v-model="form.host" mono large placeholder="127.0.0.1" />
        </label>
        <label class="connect-field">{{ t('connection.port') }}
          <TextInput id="port" v-model="form.port" mono large placeholder="14550" inputmode="numeric" />
        </label>
      </template>
    </form>
    <Banner v-if="failure" id="connect-error" tone="error" urgent>
      {{ failure }} {{ t(`connect.next.${form.transport}`) }}
    </Banner>
    <p class="connect-note">{{ t('connect.last') }}</p>
    <template #actions>
      <Button id="connect-cancel" @click="dialog.hide()">{{ t('connect.cancel') }}</Button>
      <Button id="connect-button" form="connect" type="submit" variant="primary" data-initial-focus>
        {{ t('connection.connect') }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type ConnectionForm, LAST_KEY, TRANSPORTS, deviceAmong, parseLast, requestFor } from '@/lib/app/connectionForm'
import type { SerialPort } from '@/generated/app'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useConnectDialog } from '@/composables/useConnectDialog'

// The Connect dialog, opened from the top bar's vehicle cell: a tab for each kind of link (UDP, TCP, Serial, Simulator),
// the fields of the one chosen, and Connect. The last connection that was made is kept in the settings and is what the
// dialog shows next time, so Enter is usually all it takes. It closes itself when the link is up. When the attempt fails, the
// backend's own words are shown with what to try next.
const BAUD_RATES = ['57600', '115200', '230400', '460800', '921600']

const { t } = useI18n()
const { vehicle, fields, settings } = useConfigurator()
const dialog = useConnectDialog()
const form = reactive<ConnectionForm>({ transport: 'simulator', host: '', port: '', device: '', baud: '115200' })
const serial = computed(() => form.transport === 'serial')
const state = computed(() => fields.connection.value.state)
const bauds = BAUD_RATES.map(rate => ({ value: rate, label: rate }))

/**
 * How a serial port is listed: its path, and the description the system gives it.
 *
 * @param port the port
 * @returns the text of its option
 */
function portText(port: SerialPort): string {
  return port.description ? t('connection.portWithDescription', { path: port.path, description: port.description }) : port.path
}

// The ports the backend's machine has, or one line saying there are none.
const devices = computed(() => {
  const ports = fields.ports.value.map(port => ({ value: port.path, label: portText(port) }))

  return ports.length > 0 ? ports : [{ value: '', label: t('connection.noPorts') }]
})

// The error that was on screen when the dialog was opened: it is an old one, and is not shown again.
const seenError = ref<string | null | undefined>(undefined)
// Why the last attempt failed, while the link is not up and the dialog is where the user is trying again.
const failure = computed(() => {
  const error = fields.error.value

  return state.value === 'disconnected' && error !== seenError.value ? (error ?? '') : ''
})

/**
 * The five fields of a form, and nothing else.
 *
 * @param from a form, or something read from the settings
 * @returns a plain copy of the five fields
 */
function pick(from: ConnectionForm): ConnectionForm {
  return { transport: from.transport, host: from.host, port: from.port, device: from.device, baud: from.baud }
}

// What Connect was last pressed with: it becomes the last connection only once the link is up.
let attempted = ''

/** Asks the backend to connect to what the form says. */
function connect(): void {
  attempted = JSON.stringify(pick(form))
  // Whatever fails after this press is shown, even with the same words as the failure that was hidden on opening.
  seenError.value = undefined
  void vehicle.connect(requestFor(form))
}

// The dialog opens on the last connection that was made, with no failure left over from before.
watch(dialog.open, open => {
  const last = open ? parseLast(settings.uiValue(LAST_KEY)) : null
  seenError.value = open ? fields.error.value : undefined

  if (last) {
    Object.assign(form, pick(last))
  }
})

// Serial ports are listed when the user chooses serial; the device stays chosen while it is still listed.
watch(() => form.transport, transport => {
  if (transport === 'serial') {
    void vehicle.listPorts()
  }
})
watch(fields.ports, ports => {
  form.device = deviceAmong(form.device, ports)
}, { immediate: true })

// With the link up there is nothing more to ask, and what was connected to is kept as the last connection (a mistyped
// address that never connected is not).
watch(state, next => {
  if (next === 'connected') {
    dialog.hide()

    if (attempted) {
      void settings.setUi(LAST_KEY, attempted)
      attempted = ''
    }
  }
})
</script>
