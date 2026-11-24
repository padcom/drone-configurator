<template>
  <Dialog v-if="dialog.open.value" :title="t('connect.title')" @close="dialog.hide()">
    <p class="connect-intro">{{ t('connect.intro') }}</p>
    <form id="connect" class="connect-form" @submit.prevent="connect">
      <div id="transport" class="connect-tabs" role="group" :aria-label="t('connection.transport.label')">
        <button
          v-for="tab in ALL_TABS"
          :id="`transport-${tab}`"
          :key="tab"
          type="button"
          class="connect-tab"
          :aria-pressed="shown === tab ? 'true' : 'false'"
          @click="choose(tab)"
        >
          {{ t(`connection.transport.${tab}`) }}
        </button>
      </div>
      <ConnectFound v-if="shown === 'found'" @pick="connectTo" />
      <p v-else-if="form.transport === 'simulator'" class="connect-note">{{ t('connect.simulator') }}</p>
      <template v-else-if="serial">
        <label class="connect-field">{{ t('connection.device') }}
          <Select id="device" v-model="form.device" :options="devices" />
        </label>
        <p v-if="fields.ports.value.length === 0" class="connect-note">{{ t('connection.noPorts') }}</p>
        <label class="connect-field">{{ t('connection.baud') }}
          <Select id="baud" v-model="form.baud" :options="bauds" />
        </label>
      </template>
      <template v-else>
        <div id="link-role" class="connect-field">
          <SegmentedControl v-model="form.transport" :label="t('connect.role.label')" :options="roles" />
          <span class="connect-note">{{ t(`connect.role.note.${form.transport}`) }}</span>
        </div>
        <label v-if="!listening" class="connect-field">{{ t('connection.host') }}
          <TextInput id="host" v-model="form.host" mono large placeholder="127.0.0.1" />
        </label>
        <label class="connect-field">{{ t('connection.port') }}
          <TextInput
            id="port" v-model="form.port" mono large :placeholder="DEFAULT_PORTS[form.transport]" inputmode="numeric"
          />
        </label>
        <div v-if="listening" class="connect-field">
          <Checkbox id="all-interfaces" v-model="everywhere">{{ t('connect.everywhere') }}</Checkbox>
          <span id="exposure" class="connect-note">{{ exposure }}</span>
        </div>
      </template>
    </form>
    <Banner v-if="failure" id="connect-error" tone="error" urgent>
      {{ failure }} {{ nextStep }}
    </Banner>
    <p class="connect-note">{{ t('connect.last') }}</p>
    <template #actions>
      <Button id="connect-cancel" @click="dialog.hide()">{{ t('connect.cancel') }}</Button>
      <Button v-if="shown !== 'found'" id="connect-button" form="connect" type="submit" variant="primary" data-initial-focus>
        {{ t('connection.connect') }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ALL_INTERFACES, type ConnectionForm, DEFAULT_PORTS, FIRST_FORM, LAST_KEY, ROLES, TABS, type Tab, deviceAmong, listens,
  parseLast, requestFor, tabOf, transportFor,
} from '@/lib/app/connectionForm'
import { DETECT_CODES, likelyPath } from '@/lib/app/detect'
import type { DiscoveredService, SerialPort } from '@/generated/app'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Dialog from '@/components/ui/Dialog.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import ConnectFound from './ConnectFound.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useConnectDialog } from '@/composables/useConnectDialog'

// The Connect dialog, opened from the top bar's vehicle cell: a tab for what was found on the network (#197, ConnectFound.vue)
// and one for each kind of link (UDP, TCP, Serial, Simulator), the fields of the one chosen, and Connect. UDP and TCP each go
// both ways round (#197): the backend listens and the vehicle sends or connects to it, or the backend goes to the vehicle. A
// port the backend listens on is on this computer only unless the user chooses every network interface, and is told that this
// exposes it. The last connection that was made is kept in the settings and is what the
// dialog shows next time, so Enter is usually all it takes (and the `connect.last` command makes it one key from anywhere).
// Before the first connection it is UDP on the default port. For serial, the port and the rate may be left to the backend,
// which finds the autopilot by its USB identity and tries the common rates (#27). It closes itself when the link is up. When
// the attempt fails, the backend's own words are shown with what to try next.
const BAUD_RATES = ['57600', '115200', '230400', '460800', '921600']

const { t } = useI18n()
const { vehicle, fields, settings } = useConfigurator()
const dialog = useConnectDialog()
const form = reactive<ConnectionForm>({ ...FIRST_FORM })
const serial = computed(() => form.transport === 'serial')
const listening = computed(() => listens(form.transport))
// The Found tab is shown over the form, which keeps what it holds.
const finding = ref(false)
const shown = computed<Tab | 'found'>(() => (finding.value ? 'found' : tabOf(form.transport)))
const roles = computed(() => (form.transport.startsWith('udp') ? ROLES.udp : ROLES.tcp)
  .map(transport => ({ value: transport, label: t(`connect.role.${transport}`) })))
// Whether a port the backend listens on is open to the network.
const everywhere = computed({
  get: () => form.host.trim() === ALL_INTERFACES,
  set: (on: boolean) => {
    form.host = on ? ALL_INTERFACES : ''
  },
})
const exposure = computed(() => {
  const port = form.port.trim() || DEFAULT_PORTS[form.transport]

  return everywhere.value ? t('connect.exposed', { port }) : t('connect.loopback', { port })
})
const state = computed(() => fields.connection.value.state)
const bauds = computed(() => [
  { value: '', label: t('connect.detect.baud') },
  ...BAUD_RATES.map(rate => ({ value: rate, label: rate })),
])

/**
 * How a serial port is listed: its path, and what its USB identity says it is (else the description the system gives it).
 *
 * @param port the port
 * @returns the text of its option
 */
function portText(port: SerialPort): string {
  const description = port.board ?? port.description

  return description ? t('connection.portWithDescription', { path: port.path, description }) : port.path
}

// The ports the backend's machine has, after the choice to let the backend find the autopilot (naming the port it would use).
const devices = computed(() => {
  const likely = likelyPath(fields.ports.value)
  const detect = likely ? t('connect.detect.deviceFound', { path: likely }) : t('connect.detect.device')

  return [{ value: '', label: detect }, ...fields.ports.value.map(port => ({ value: port.path, label: portText(port) }))]
})

// What to try next after a failure: for a serial port or rate that was not found, what the backend could not find.
const nextStep = computed(() => {
  const code = fields.connection.value.errorCode

  return code && DETECT_CODES.includes(code) ? t(`connect.detect.next.${code}`) : t(`connect.next.${form.transport}`)
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

/** The tabs, in the order of the design: what was found first. */
const ALL_TABS = ['found', ...TABS] as const

/**
 * Shows a tab: the Found tab over the form, or the form on a kind of link of the tab.
 *
 * @param tab the tab
 */
function choose(tab: Tab | 'found'): void {
  finding.value = tab === 'found'

  if (tab !== 'found') {
    form.transport = transportFor(tab, form.transport)
  }
}

/** Asks the backend to connect to what the form says. */
function connect(): void {
  attempted = JSON.stringify(pick(form))
  // Whatever fails after this press is shown, even with the same words as the failure that was hidden on opening.
  seenError.value = undefined
  void vehicle.connect(requestFor(form))
}

/**
 * Connects to a service that was found on the network, as if it had been typed: it is kept as the last connection once the link
 * is up, so Connect again goes back to it.
 *
 * @param service what was found
 */
function connectTo(service: DiscoveredService): void {
  Object.assign(form, { transport: service.transport, host: service.host, port: String(service.port) })
  connect()
}

// The dialog opens on the last connection that was made, with no failure left over from before.
watch(dialog.open, open => {
  finding.value = false
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
