<template>
  <section class="setup-page-body single" :aria-labelledby="`${uid}-title`">
    <div class="setup-main setup-bridge">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.bridge') }}</h3>
      <p class="muted">{{ t('setup.bridge.summary') }}</p>
      <template v-if="held">
        <!-- While a port is locked it is said first, with the way to give it back next to it. -->
        <Banner id="setup-bridge-locked" tone="warn">
          <strong>{{ lockedText }}</strong>
          <template #actions>
            <Button id="setup-bridge-stop" variant="primary" :disabled="releasing" @click="stop">
              {{ t('setup.bridge.stop') }}
            </Button>
          </template>
        </Banner>
        <dl class="setup-bridge-facts">
          <dt>{{ t('setup.bridge.fact.program') }}</dt>
          <dd id="setup-bridge-client">{{ clientText }}</dd>
          <dt>{{ t('setup.bridge.fact.toVehicle') }}</dt>
          <dd id="setup-bridge-to">{{ current.toVehicle }}</dd>
          <dt>{{ t('setup.bridge.fact.fromVehicle') }}</dt>
          <dd id="setup-bridge-from">{{ current.fromVehicle }}</dd>
          <dt>{{ t('setup.bridge.fact.dropped') }}</dt>
          <dd>{{ current.dropped }}</dd>
          <dt>{{ t('setup.bridge.fact.refused') }}</dt>
          <dd id="setup-bridge-refused-count">{{ current.refused }}</dd>
        </dl>
      </template>
      <div v-else class="setup-bridge-form">
        <label :for="`${uid}-device`">{{ t('setup.bridge.port') }}</label>
        <Select :id="`${uid}-device`" v-model="device" :options="deviceOptions" data-bridge="device" />
        <label :for="`${uid}-baud`">{{ t('setup.bridge.baud') }}</label>
        <Select :id="`${uid}-baud`" v-model="baud" :options="baudOptions" data-bridge="baud" />
        <label :for="`${uid}-port`">{{ t('setup.bridge.localPort') }}</label>
        <TextInput
          :id="`${uid}-port`"
          v-model="localPort"
          mono
          inputmode="numeric"
          data-bridge="port"
          :invalid="port === null"
          :aria-describedby="`${uid}-port-help`"
        />
        <p :id="`${uid}-port-help`" class="muted setup-bridge-help">
          {{ t(port === null ? 'setup.bridge.portInvalid' : 'setup.bridge.portHelp') }}
        </p>
        <div class="setup-bridge-start">
          <Button id="setup-bridge-start" variant="primary" :disabled="!canStart" @click="start">
            {{ t('setup.bridge.start') }}
          </Button>
        </div>
        <p v-if="blockedText" id="setup-bridge-blocked" class="muted">{{ blockedText }}</p>
      </div>
      <p id="setup-bridge-said" class="setup-status" role="status">{{ saidText }}</p>
      <Banner v-if="releaseFailed" id="setup-bridge-unreleased" tone="error">
        {{ t('setup.bridge.releaseFailed', { port: portName }) }}
      </Banner>
    </div>
  </section>
</template>

<script setup lang="ts">
// The serial bridge (#198): a port of the vehicle (its GPS, a telemetry radio, SERIALn) reached by a program on this computer
// through a local TCP port, so that a GPS configuration tool or a radio's own program can talk to the device behind the
// autopilot. The backend takes the port with MAVLink's SERIAL_CONTROL and gives it back when the bridge ends, by whichever way;
// it refuses a vehicle that is armed or may be. While a port is locked the page says which, first, with Stop beside it (the top
// bar says it too, on every screen), and how the bridge is doing: the program connected, the bytes each way. One program at a
// time.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { armedOf } from '@/lib/app/armed'
import type { SerialBridgeDevice, SerialBridgeStart } from '@/generated/app'
import {
  BRIDGE_BAUDS,
  BRIDGE_DEVICES,
  BRIDGE_OFF,
  DEFAULT_LOCAL_PORT,
  addressOf,
  deviceName,
  endedKey,
  endedWhy,
  holdsPort,
  localPortOf,
  refusalKey,
} from '@/lib/setup/bridge'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const bridge = handle.serialBridge
const current = computed(() => bridge.state.value ?? BRIDGE_OFF)
const device = ref<string>('GPS1')
const baud = ref<string>('0')
const localPort = ref<string>(DEFAULT_LOCAL_PORT)
const port = computed(() => localPortOf(localPort.value))
const held = computed(() => holdsPort(bridge.state.value))
const releasing = computed(() => bridge.pending.value || current.value.state === 'releasing')
const armed = computed(() => armedOf(handle.fields.telemetry.value))

/**
 * A port of the vehicle by its name.
 *
 * @param id the port
 * @returns "GPS 1", "Serial 4"
 */
function nameOf(id: SerialBridgeDevice): string {
  const name = deviceName(id)

  return t(name.key, name.params)
}

/**
 * A speed as the list says it.
 *
 * @param speed bits a second, 0 for the port's own
 * @returns its label
 */
function baudLabel(speed: number): string {
  return speed === 0 ? t('setup.bridge.baudUnchanged') : t('setup.bridge.baudValue', { baud: speed })
}

const deviceOptions = computed(() => BRIDGE_DEVICES.map(id => ({ value: id, label: nameOf(id) })))
const baudOptions = computed(() => BRIDGE_BAUDS.map(speed => ({ value: String(speed), label: baudLabel(speed) })))
const portName = computed(() => nameOf(current.value.device ?? (device.value as SerialBridgeDevice)))
const lockedKey = computed(() => (current.value.state === 'releasing' ? 'setup.bridge.releasing' : 'setup.bridge.locked'))
const lockedText = computed(() => t(lockedKey.value, { port: portName.value, address: addressOf(current.value) }))
const clientText = computed(() => (current.value.client
  ? t('setup.bridge.connected', { address: current.value.clientAddress ?? '' })
  : t('setup.bridge.waiting')))
/** Why a bridge cannot start now: an armed vehicle, or one whose state is not known (the backend refuses them too). */
const blockedText = computed(() => {
  if (armed.value === false) {
    return ''
  }

  return t(armed.value ? 'setup.bridge.armed' : 'setup.bridge.unknown')
})
const canStart = computed(() => port.value !== null && armed.value === false && !bridge.pending.value)
const releaseFailed = computed(() => current.value.state === 'off' && current.value.releaseFailed === true)

/**
 * How the last bridge ended, and whether the port is the vehicle's own again.
 *
 * @param why the backend's reason
 * @returns the words
 */
function endedText(why: string): string {
  const ended = t(endedKey(why))

  return releaseFailed.value ? ended : `${ended} ${t('setup.bridge.released', { port: portName.value })}`
}

/**
 * What the page says of the last thing that happened: a start that was refused, or how the last bridge ended.
 *
 * @returns the words, or '' for nothing
 */
function said(): string {
  const refusal = bridge.refusal.value
  if (refusal !== null) {
    return t(refusalKey(refusal))
  }
  const why = endedWhy(current.value)

  return why === undefined ? '' : endedText(why)
}

const saidText = computed(said)

/** Asks for the bridge, as chosen. */
async function start(): Promise<void> {
  const ask: SerialBridgeStart = { device: device.value as SerialBridgeDevice, port: port.value ?? 0 }
  const speed = Number(baud.value)
  await bridge.start(speed > 0 ? { ...ask, baudrate: speed } : ask)
}

/** Ends the bridge: the port goes back to the vehicle. */
async function stop(): Promise<void> {
  await bridge.stop()
}
</script>
