<template>
  <section id="flight-strip" class="flight-strip" :aria-label="t('strip.title')">
    <p id="strip-state" class="strip-state" role="status">
      <strong>{{ t(`strip.state.${state}`) }}</strong>
      <span class="muted">{{ t(`strip.checks.${checks}`) }}</span>
    </p>
    <div class="strip-mode">
      <label for="strip-mode">{{ t('strip.mode') }}</label>
      <select id="strip-mode" class="kit-select" :disabled="!canPickMode" :value="current" @change="pick">
        <option v-for="name in names" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>
    <div class="strip-actions">
      <CommandButton v-if="state === 'disarmed'" command="vehicle.review" look="primary" icon-position="none" />
      <CommandButton v-else command="vehicle.disarm" look="flight" icon-position="none" />
      <Menu v-if="state !== 'disarmed'" :label="t('strip.more')" :items="items" @select="more" />
    </div>
  </section>
</template>

<script setup lang="ts">
// The controls of a flight, under the map. Drawn only while there is a vehicle. What it SHOWS is what the vehicle says (its
// heartbeat: armed or not, its mode; its pre-arm bit): a button never changes it. A disarmed vehicle has "Review and arm" (the
// review of what the vehicle says of its checks, then the hold). An armed one (or one whose state is not known, which counts as
// armed) has "Disarm" (a hold) and, under "More", the EMERGENCY STOP (a hold, red): there and nowhere else. The mode is chosen
// in the list; the list shows the mode the heartbeat names, and goes back to it at once (the heartbeat is what changes it).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import Menu from '@/components/ui/Menu.vue'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { armedOf } from '@/lib/app/armed'
import { ChangeFlightMode } from '@/lib/commands/arming'
import { checksOf } from '@/lib/fly/prearm'
import type { MenuItem } from '@/lib/ui/menuKeys'

/**
 * The words for a state of the vehicle.
 *
 * @param armed whether it is armed, or undefined when that is not known
 * @returns the key of its words
 */
function stateOf(armed: boolean | undefined): 'armed' | 'disarmed' | 'unknown' {
  if (armed === undefined) {
    return 'unknown'
  }

  return armed ? 'armed' : 'disarmed'
}

/**
 * The modes to list: the vehicle kind's, and the one the heartbeat names even if the kind has no name for it.
 *
 * @param known the kind's modes
 * @param now the mode the heartbeat names ('' when it names none)
 * @returns the names
 */
function withCurrent(known: string[], now: string): string[] {
  return now === '' || known.includes(now) ? known : [now, ...known]
}

const { t } = useI18n()
const { fields, setup } = useConfigurator()
const run = useCommandRunner()

const armed = computed(() => armedOf(fields.telemetry.value))
const state = computed(() => stateOf(armed.value))
const checks = computed(() => checksOf(fields.telemetry.value))
const current = computed(() => fields.telemetry.value?.mode ?? '')
// The modes of the vehicle's kind, by their names; the one the heartbeat names is always in the list.
const names = computed(() => withCurrent(setup.modes.value?.modes.map(mode => mode.name) ?? [], current.value))
const canPickMode = computed(() => fields.connection.value.state === 'connected' && setup.modes.value !== null)
const items = computed<MenuItem[]>(() => [{ id: 'stop', label: t('strip.stop'), danger: true }])

/**
 * A mode was picked: the list goes back to what the heartbeat says (it is the heartbeat that changes it), and the command asks
 * what it must before it sends.
 *
 * @param event the change
 */
function pick(event: Event): void {
  const list = event.target as HTMLSelectElement
  const name = list.value
  list.value = current.value
  void run(new ChangeFlightMode(name))
}

/**
 * An item of "More" was chosen.
 *
 * @param id the item
 */
function more(id: string): void {
  if (id === 'stop') {
    void run('vehicle.emergencyStop')
  }
}
</script>
