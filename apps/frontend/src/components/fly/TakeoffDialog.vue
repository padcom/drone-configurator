
<template>
  <Dialog v-if="takeoff.open.value" :title="t('takeoff.title')" @close="takeoff.hide()">
    <p id="takeoff-what">{{ whatText }}</p>
    <label class="takeoff-field" for="takeoff-altitude">
      <span>{{ t('takeoff.altitude') }}</span>
      <TextInput
        id="takeoff-altitude"
        v-model="takeoff.typed.value"
        mono
        inputmode="decimal"
        autocomplete="off"
        :invalid="problem !== null"
        aria-describedby="takeoff-limits takeoff-problem"
      />
    </label>
    <p id="takeoff-limits" class="muted">{{ limitsText }}</p>
    <p id="takeoff-problem" class="takeoff-problem" role="alert">{{ problemText }}</p>
    <template #actions>
      <!-- Cancel has the focus: the safe answer is the one that is given by a key pressed by mistake. -->
      <Button id="takeoff-cancel" data-initial-focus @click="takeoff.hide()">{{ t('confirm.cancel') }}</Button>
      <Button id="takeoff-go" variant="primary" :disabled="problem !== null" @click="go">{{ t('takeoff.go') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The dialog of "Take off": how high (metres above home, within the limits: 2 m up to the user's setting, and never above the
// vehicle's fence when it limits the altitude) and a button that goes ahead. It is a PLAIN button, not a hold (the leader's
// decision): the hold is asked for by what it starts when the vehicle is disarmed (the arm). What the button does is in
// lib/commands/takeoffFlow.ts: GUIDED, arm if disarmed, take off; it stops at the first step that does not go.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCommandContext } from '@/composables/useCommands'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { useTakeoff } from '@/composables/useTakeoff'
import { useTakeoffCeiling } from '@/composables/useTakeoffCeiling'
import { takeOff } from '@/lib/commands/takeoffFlow'
import { altitudeOf, fenceCeilingOf, limitsOf, problemOf } from '@/lib/fly/takeoff'

const { t } = useI18n()
const takeoff = useTakeoff()
const { fields } = useConfigurator()
const { ceiling } = useTakeoffCeiling()
const ctx = useCommandContext()
const run = useCommandRunner()

/**
 * The value of one of the vehicle's parameters.
 *
 * @param id its name
 * @returns the value, or undefined when the list has none
 */
function parameter(id: string): number | undefined {
  return fields.params.value.find(param => param.id === id)?.value
}

const fence = computed(() => fenceCeilingOf(parameter))
const limits = computed(() => limitsOf(ceiling.value, fence.value))
const altitude = computed(() => altitudeOf(takeoff.typed.value))
const problem = computed(() => problemOf(altitude.value, limits.value))
const disarmed = computed(() => fields.telemetry.value?.armed !== true)

const whatText = computed(() => t(disarmed.value ? 'takeoff.whatDisarmed' : 'takeoff.whatArmed'))
const limitsText = computed(() => t(`takeoff.limits.${limits.value.by}`, { min: limits.value.min, max: limits.value.max }))
const named = computed(() => ({ min: limits.value.min, max: limits.value.max }))
const problemText = computed(() => (problem.value === null ? '' : t(`takeoff.problem.${problem.value}`, named.value)))

/** Runs the arm command: its hold, and the answer it tells. */
async function armIt(): Promise<void> {
  await run('vehicle.arm')
}

/** The button: the takeoff goes ahead (the dialog is closed, and what happens is told in notices). */
function go(): void {
  if (problem.value === null) {
    const metres = altitude.value
    takeoff.hide()
    void takeOff(ctx, metres, armIt)
  }
}
</script>
