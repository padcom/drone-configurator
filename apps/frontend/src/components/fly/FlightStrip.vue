<template>
  <section id="flight-strip" class="flight-strip" :aria-label="t('strip.title')">
    <p id="strip-checks" class="strip-checks muted" role="status">{{ t(`strip.checks.${checks}`) }}</p>
    <div v-if="state !== 'disarmed'" class="strip-actions">
      <CommandButton command="vehicle.disarm" look="flight" icon-position="none" />
      <Menu :label="t('strip.more')" :items="moreItems" @select="more" />
    </div>
  </section>
</template>

<script setup lang="ts">
// The controls of a flight that are not in the top bar, above the map (a notice comes up at the bottom left of the window: it
// must never cover them). Drawn only while there is a vehicle. What it SHOWS is what the vehicle says (its pre-arm bit). ARMING
// and the FLIGHT MODE are the top bar's (the STATE and MODE cells): one place for each. An armed vehicle, or one whose state is
// not known (which counts as armed: so is a vehicle that has just been asked to arm, until its heartbeat says), has "Disarm" (a
// hold) and, under "More", the EMERGENCY STOP (a hold, red): there and nowhere else, always reachable.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import Menu from '@/components/ui/Menu.vue'
import { useArmGrace } from '@/composables/useArmGrace'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { checksOf } from '@/lib/fly/prearm'
import type { MenuItem } from '@/lib/ui/menuKeys'

/**
 * Which controls fit the state of the vehicle.
 *
 * @param armed whether it is armed, or undefined when that is not known
 * @returns `disarmed` (none), or `armed` or `unknown` (disarm, and the stop)
 */
function stateOf(armed: boolean | undefined): 'armed' | 'disarmed' | 'unknown' {
  if (armed === undefined) {
    return 'unknown'
  }

  return armed ? 'armed' : 'disarmed'
}

const { t } = useI18n()
const { fields } = useConfigurator()
const run = useCommandRunner()
const { armed } = useArmGrace()

const state = computed(() => stateOf(armed.value))
const checks = computed(() => checksOf(fields.telemetry.value))
const moreItems = computed<MenuItem[]>(() => [{ id: 'stop', label: t('strip.stop'), danger: true }])

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
