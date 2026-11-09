<template>
  <form id="connect" @submit.prevent="connect">
    <Select id="transport" v-model="chosenTransport" :aria-label="t('connection.transport.label')" :options="transports" />
    <TextInput id="host" v-model="form.host" placeholder="127.0.0.1" :aria-label="t('connection.host')" :hidden="serial" />
    <TextInput
      id="port"
      v-model="form.port"
      placeholder="14550"
      inputmode="numeric"
      :aria-label="t('connection.port')"
      :hidden="serial"
    />
    <Select id="device" v-model="form.device" :aria-label="t('connection.device')" :hidden="!serial" :options="devices" />
    <Select id="baud" v-model="form.baud" :aria-label="t('connection.baud')" :hidden="!serial" :options="bauds" />
    <Button id="connect-button" type="submit" variant="primary">{{ t('connection.connect') }}</Button>
    <Button id="disconnect-button" :disabled="state !== 'connected'" @click="vehicle.disconnect()">
      {{ t('connection.disconnect') }}
    </Button>
  </form>
  <p id="connection" role="status"><span class="badge" :class="state">{{ t(`connection.state.${state}`) }}</span>{{ found }}
    <span v-if="fields.error.value" class="error">{{ fields.error.value }}</span>
    <span v-if="fields.notice.value" class="warn">{{ fields.notice.value }}</span></p>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type ConnectionForm, deviceAmong, requestFor } from './connectionForm'
import type { SerialPort } from './generated/app'
import Button from './kit/Button.vue'
import Select from './kit/Select.vue'
import TextInput from './kit/TextInput.vue'
import { useConfigurator } from './useConfigurator'

const BAUD_RATES = ['57600', '115200', '230400', '460800', '921600']
const TRANSPORTS = ['simulator', 'udp', 'tcp', 'serial'] as const

const { t } = useI18n()
const { vehicle, fields } = useConfigurator()
const form = reactive<ConnectionForm>({ transport: 'simulator', host: '', port: '', device: '', baud: '115200' })
const serial = computed(() => form.transport === 'serial')
/**
 * How a serial port is listed: its path, and the description the system gives it.
 *
 * @param port the port
 * @returns the text of its option
 */
function portText(port: SerialPort): string {
  return port.description ? t('connection.portWithDescription', { path: port.path, description: port.description }) : port.path
}

// The select speaks strings; the form's transport is one of four.
const chosenTransport = computed({
  get: () => form.transport,
  set: (next: string) => {
    form.transport = next as ConnectionForm['transport']
  },
})
const transports = computed(() => TRANSPORTS.map(value => ({ value, label: t(`connection.transport.${value}`) })))
const bauds = BAUD_RATES.map(rate => ({ value: rate, label: rate }))
// The ports the backend's machine has, or one line saying there are none.
const devices = computed(() => {
  const ports = fields.ports.value.map(port => ({ value: port.path, label: portText(port) }))

  return ports.length > 0 ? ports : [{ value: '', label: t('connection.noPorts') }]
})
const state = computed(() => fields.connection.value.state)
// The vehicle's type and autopilot are the protocol's names, shown as they are.
const found = computed(() => {
  const info = fields.connection.value.vehicle

  return info ? t('connection.vehicle', { ...info }) : ''
})

/** Asks the backend to connect to what the form says. */
function connect() {
  void vehicle.connect(requestFor(form))
}

// Serial ports are listed when the user chooses serial; the device stays chosen while it is still listed.
watch(() => form.transport, transport => {
  if (transport === 'serial') {
    void vehicle.listPorts()
  }
})
watch(fields.ports, ports => {
  form.device = deviceAmong(form.device, ports)
}, { immediate: true })
</script>
