<template>
  <section class="settings-forward" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('settings.forward.title') }}</h3>
    <p class="muted">{{ t('settings.forward.help') }}</p>
    <ul v-if="rows.length > 0" id="forward-list" class="forward-list">
      <li v-for="row in rows" :key="row.key" class="forward-row" :data-key="row.key">
        <span class="forward-name">{{ row.name }}</span>
        <Badge class="forward-state" :tone="row.tone">{{ row.stateText }}</Badge>
        <Toggle
          class="forward-on"
          :model-value="row.on"
          :aria-label="t('settings.forward.onFor', { name: row.name })"
          @update:model-value="turn(row.key, $event)"
        >
          {{ t('settings.forward.on') }}
        </Toggle>
        <Button
          class="forward-remove"
          :aria-label="t('settings.forward.removeFor', { name: row.name })"
          @click="remove(row.key)"
        >
          {{ t('settings.forward.remove') }}
        </Button>
        <p class="forward-counts muted">{{ row.counts }}</p>
        <p v-if="row.error" class="forward-error muted">{{ row.error }}</p>
      </li>
    </ul>
    <p v-else id="forward-empty" class="muted">{{ t('settings.forward.none') }}</p>
    <form class="forward-add" :aria-label="t('settings.forward.addTitle')" @submit.prevent="add">
      <div class="forward-field">
        <label :for="`${uid}-kind`">{{ t('settings.forward.kind') }}</label>
        <Select :id="`${uid}-kind`" v-model="kind" :options="kindOptions" />
      </div>
      <div class="forward-field forward-host">
        <label :for="`${uid}-host`">{{ t('settings.forward.host') }}</label>
        <TextInput :id="`${uid}-host`" v-model="host" mono :invalid="problem === 'host'" />
      </div>
      <div class="forward-field forward-port">
        <label :for="`${uid}-port`">{{ t('settings.forward.port') }}</label>
        <TextInput :id="`${uid}-port`" v-model="port" mono inputmode="numeric" :invalid="problem === 'port'" />
      </div>
      <Button id="forward-add" type="submit">{{ t('settings.forward.add') }}</Button>
    </form>
    <Banner v-if="problem" id="forward-problem" tone="error">
      {{ t(`settings.forward.problems.${problem}`, { max: MAX_ENDPOINTS }) }}
    </Banner>
  </section>
</template>

<script setup lang="ts">
// "Forward MAVLink" in Settings (#34): the programs the vehicle's MAVLink is forwarded to (a second ground station, a logger),
// each UDP or TCP, a host and a port, on or off, with what the backend says it is doing (up, refused, dropping frames because it
// reads too slowly) and its counts. None until one is added: nothing is forwarded by default. The list is an entry of the
// settings, which the backend reads itself. Every action is a native button or field, so all of it works from the keyboard
// (Enter in a field adds).
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Badge from '@/components/ui/Badge.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { ForwardEndpoint, ForwardState } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import {
  type EndpointProblem, type EndpointSetting, type ForwardKindName, MAX_ENDPOINTS, endpointKey,
} from '@/lib/forward/endpoints'

const { t } = useI18n()
const { number } = useFormat()
const { forwarding } = useConfigurator()
const uid = useId()

const kind = ref('udp')
const host = ref('127.0.0.1')
const port = ref('14550')
const problem = ref<EndpointProblem | null>(null)
const kindOptions = [{ value: 'udp', label: 'UDP' }, { value: 'tcp', label: 'TCP' }]

/** How a state is drawn. */
type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'error'

/** How each state is drawn: the colour goes with the words, never alone. */
const TONES: Record<ForwardState, Tone> = {
  off: 'neutral', idle: 'neutral', connecting: 'info', up: 'ok', refused: 'error', dropping: 'warn',
}

/** One line of the list. */
interface Row {
  key: string
  name: string
  on: boolean
  tone: Tone
  stateText: string
  counts: string
  error: string
}

/**
 * The state of an endpoint: what the backend said, else what its switch says (before the backend has answered).
 *
 * @param e the endpoint
 * @param said what the backend said of it, if anything
 * @returns the state
 */
function stateOf(e: EndpointSetting, said: ForwardEndpoint | undefined): ForwardState {
  if (!e.on) {
    return 'off'
  }

  return said?.on === true ? said.state : 'idle'
}

/**
 * The counts of an endpoint, in words.
 *
 * @param said what the backend said of it, if anything
 * @returns the line
 */
function countsOf(said: ForwardEndpoint | undefined): string {
  const counts = said ?? { sent: 0, dropped: 0, received: 0 }

  const { sent, dropped, received } = counts

  return t('settings.forward.counts', { sent: number(sent), dropped: number(dropped), received: number(received) })
}

/**
 * Why an endpoint was refused, in words ('' when it was not).
 *
 * @param state its state
 * @param said what the backend said of it, if anything
 * @returns the line
 */
function errorOf(state: ForwardState, said: ForwardEndpoint | undefined): string {
  const reason = state === 'refused' ? said?.error : undefined

  return reason ? t('settings.forward.refused', { reason }) : ''
}

/**
 * A line of the list.
 *
 * @param e the endpoint
 * @returns the line
 */
function rowOf(e: EndpointSetting): Row {
  const key = endpointKey(e)
  const said = forwarding.states.value.get(key)
  const state = stateOf(e, said)

  return {
    key,
    name: `${e.kind.toUpperCase()} ${e.host}:${e.port}`,
    on: e.on,
    tone: TONES[state],
    stateText: t(`settings.forward.states.${state}`),
    counts: countsOf(said),
    error: errorOf(state, said),
  }
}

const rows = computed<Row[]>(() => forwarding.endpoints.value.map(rowOf))

/** Adds what was typed, or says why it cannot be added. */
async function add(): Promise<void> {
  const chosen: ForwardKindName = kind.value === 'tcp' ? 'tcp' : 'udp'
  problem.value = await forwarding.add({ kind: chosen, host: host.value, port: port.value })
}

/**
 * Turns an endpoint on or off.
 *
 * @param key which
 * @param on whether frames go to it
 */
function turn(key: string, on: boolean): void {
  void forwarding.turn(key, on)
}

/**
 * Removes an endpoint.
 *
 * @param key which
 */
function remove(key: string): void {
  void forwarding.remove(key)
}

onMounted(() => forwarding.watch())
onUnmounted(() => forwarding.unwatch())
</script>
