<template>
  <form id="connect" @submit.prevent="connect">
    <select id="transport" v-model="form.transport" aria-label="Transport">
      <option value="simulator">Simulator</option>
      <option value="udp">UDP</option>
      <option value="tcp">TCP</option>
      <option value="serial">Serial</option>
    </select>
    <input id="host" v-model="form.host" placeholder="127.0.0.1" aria-label="Host" :hidden="serial">
    <input
      id="port"
      v-model="form.port"
      placeholder="14550"
      inputmode="numeric"
      aria-label="Port"
      :hidden="serial"
    >
    <select id="device" v-model="form.device" aria-label="Serial port" :hidden="!serial">
      <option v-for="port in fields.ports.value" :key="port.path" :value="port.path">{{ portLabel(port) }}</option>
      <option v-if="fields.ports.value.length === 0" value="">No serial ports</option>
    </select>
    <select id="baud" v-model="form.baud" aria-label="Baud rate" :hidden="!serial">
      <option v-for="rate in BAUD_RATES" :key="rate">{{ rate }}</option>
    </select>
    <button id="connect-button" type="submit">Connect</button>
    <button id="disconnect-button" type="button" :disabled="state !== 'connected'" @click="app.disconnect()">
      Disconnect
    </button>
  </form>
  <p id="connection" role="status"><span class="badge" :class="state">{{ state }}</span>{{ vehicle }}
    <span v-if="fields.error.value" class="error">{{ fields.error.value }}</span>
    <span v-if="fields.notice.value" class="warn">{{ fields.notice.value }}</span></p>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { type ConnectionForm, deviceAmong, portLabel, requestFor, vehicleText } from './connectionForm'
import { useConfigurator } from './useConfigurator'

const BAUD_RATES = ['57600', '115200', '230400', '460800', '921600']

const { app, fields } = useConfigurator()
const form = reactive<ConnectionForm>({ transport: 'simulator', host: '', port: '', device: '', baud: '115200' })
const serial = computed(() => form.transport === 'serial')
const state = computed(() => fields.connection.value.state)
const vehicle = computed(() => vehicleText(fields.connection.value.vehicle))

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
