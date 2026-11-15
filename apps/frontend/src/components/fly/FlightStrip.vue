<template>
  <section id="flight-strip" class="flight-strip" :aria-label="t('strip.title')">
    <p id="strip-checks" class="strip-checks muted" role="status">{{ t(`strip.checks.${checks}`) }}</p>
    <div id="strip-mode" class="strip-mode">
      <Menu :label="t('strip.mode', { mode: current === '' ? '–' : current })" :items="modeItems" @select="pick" />
    </div>
    <div class="strip-actions">
      <CommandButton v-if="state === 'disarmed'" command="vehicle.review" look="primary" icon-position="none" />
      <CommandButton v-else command="vehicle.disarm" look="flight" icon-position="none" />
      <Menu v-if="state !== 'disarmed'" :label="t('strip.more')" :items="moreItems" @select="more" />
    </div>
  </section>
</template>

<script setup lang="ts">
// The controls of a flight, above the map (a notice comes up at the bottom left of the window: it must never cover them). Drawn
// only while there is a vehicle. What it SHOWS is what the vehicle says (its pre-arm bit; the armed state and the mode are the
// top bar's, not repeated here): a button never changes it. A disarmed vehicle has "Review and arm" (the review of what the
// vehicle says of its checks, then the hold). An armed one, or one whose state is
// not known (which counts as armed: so is a vehicle that has just been asked to arm, until its heartbeat says), has "Disarm" (a
// hold) and, under "More", the EMERGENCY STOP (a hold, red): there and nowhere else. The mode is chosen from a MENU, never from a
// list that changes its value as keys move over it: a key that moves over the items sends nothing, and a mode is asked for only
// by choosing its item.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import Menu from '@/components/ui/Menu.vue'
import { useArmGrace } from '@/composables/useArmGrace'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { ChangeFlightMode } from '@/lib/commands/arming'
import { checksOf } from '@/lib/fly/prearm'
import type { MenuItem } from '@/lib/ui/menuKeys'

/**
 * Which controls fit the state of the vehicle.
 *
 * @param armed whether it is armed, or undefined when that is not known
 * @returns `disarmed` (the review), or `armed` or `unknown` (disarm, and the stop)
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
const { armed } = useArmGrace()

const state = computed(() => stateOf(armed.value))
const checks = computed(() => checksOf(fields.telemetry.value))
const current = computed(() => fields.telemetry.value?.mode ?? '')
const canPickMode = computed(() => fields.connection.value.state === 'connected' && setup.modes.value !== null)
// The modes of the vehicle's kind, by their names; the one the heartbeat names is always there, and cannot be chosen again.
const modeItems = computed<MenuItem[]>(() => withCurrent(setup.modes.value?.modes.map(mode => mode.name) ?? [], current.value)
  .map(name => ({
    id: name,
    label: name,
    hint: name === current.value ? t('strip.current') : undefined,
    disabled: !canPickMode.value || name === current.value,
  })))
const moreItems = computed<MenuItem[]>(() => [{ id: 'stop', label: t('strip.stop'), danger: true }])

/**
 * A mode was chosen: the command asks what it must before it sends. What the vehicle is in is what its heartbeat says.
 *
 * @param name the mode
 */
function pick(name: string): void {
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
