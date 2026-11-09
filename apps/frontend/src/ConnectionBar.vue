<template>
  <form id="connect" @submit.prevent="connect">
    <select id="transport" v-model="form.transport" :aria-label="t('connection.transport.label')">
      <option value="simulator">{{ t('connection.transport.simulator') }}</option>
      <option value="udp">{{ t('connection.transport.udp') }}</option>
      <option value="tcp">{{ t('connection.transport.tcp') }}</option>
      <option value="serial">{{ t('connection.transport.serial') }}</option>
    </select>
    <input id="host" v-model="form.host" placeholder="127.0.0.1" :aria-label="t('connection.host')" :hidden="serial">
    <input
      id="port"
      v-model="form.port"
      placeholder="14550"
      inputmode="numeric"
      :aria-label="t('connection.port')"
      :hidden="serial"
    >
    <select id="device" v-model="form.device" :aria-label="t('connection.device')" :hidden="!serial">
      <option v-for="port in fields.ports.value" :key="port.path" :value="port.path">{{ portText(port) }}</option>
      <option v-if="fields.ports.value.length === 0" value="">{{ t('connection.noPorts') }}</option>
    </select>
    <select id="baud" v-model="form.baud" :aria-label="t('connection.baud')" :hidden="!serial">
      <option v-for="rate in BAUD_RATES" :key="rate">{{ rate }}</option>
    </select>
    <button id="connect-button" type="submit">{{ t('connection.connect') }}</button>
    <button id="disconnect-button" type="button" :disabled="state !== 'connected'" @click="app.disconnect()">
      {{ t('connection.disconnect') }}
    </button>
  </form>
  <p id="connection" role="status"><span class="badge" :class="state">{{ t(`connection.state.${state}`) }}</span>{{ vehicle }}
    <span v-if="fields.error.value" class="error">{{ fields.error.value }}</span>
    <span v-if="fields.notice.value" class="warn">{{ fields.notice.value }}</span></p>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type ConnectionForm, deviceAmong, requestFor } from './connectionForm'
import type { SerialPort } from './generated/app'
import { useConfigurator } from './useConfigurator'

const BAUD_RATES = ['57600', '115200', '230400', '460800', '921600']

const { t } = useI18n()
const { app, fields } = useConfigurator()
const form = reactive<ConnectionForm>({ transport: 'simulator', host: '', port: '', device: '', baud: '115200' })
const serial = computed(() => form.transport === 'serial')
const state = computed(() => fields.connection.value.state)
// The vehicle's type and autopilot are the protocol's names, shown as they are.
const vehicle = computed(() => {
  const found = fields.connection.value.vehicle

  return found ? t('connection.vehicle', { ...found }) : ''
})

/**
 * How a serial port is listed: its path, and the description the system gives it.
 *
 * @param port the port
 * @returns the text of its option
 */
function portText(port: SerialPort): string {
  return port.description ? t('connection.portWithDescription', { path: port.path, description: port.description }) : port.path
}

/** Asks the backend to connect to what the form says. */
function connect() {
  void app.connect(requestFor(form))
}

// Serial ports are listed when the user chooses serial; the device stays chosen while it is still listed.
watch(() => form.transport, transport => {
  if (transport === 'serial') {
    void app.listPorts()
  }
})
watch(fields.ports, ports => {
  form.device = deviceAmong(form.device, ports)
}, { immediate: true })
</script>
