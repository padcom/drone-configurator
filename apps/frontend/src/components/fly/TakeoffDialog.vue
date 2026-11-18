
<template>
  <Dialog v-if="takeoff.open.value" :title="t('takeoff.title')" :close-label="t('confirm.cancel')" @close="takeoff.hide()">
    <p id="takeoff-vehicle" class="takeoff-vehicle">{{ vehicleName || t('safety.noVehicle') }}</p>
    <p id="takeoff-what">{{ whatText }}</p>
    <label class="takeoff-field" for="takeoff-altitude">
      <span>{{ t('takeoff.altitude') }}</span>
      <TextInput
        id="takeoff-altitude"
        v-model="takeoff.typed.value"
        data-initial-focus
        mono
        inputmode="decimal"
        autocomplete="off"
        :invalid="problem !== null"
        aria-describedby="takeoff-limits takeoff-problem"
      />
    </label>
    <p id="takeoff-limits" class="muted">{{ limitsText }}</p>
    <p id="takeoff-fence" class="takeoff-problem" role="alert">{{ fenceText }}</p>
    <p id="takeoff-problem" class="takeoff-problem" role="alert">{{ problemText }}</p>
    <template #actions>
      <!-- Only the button that goes ahead (and the cross, and Escape): the focus is on the altitude, which a key pressed by
           mistake does not send. -->
      <Button id="takeoff-go" variant="primary" :disabled="!mayGo" :data-armed="ready" @click="go">
        {{ t('takeoff.go') }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The dialog of "Take off": how high (metres above home, within the limits: 2 m up to the user's setting, and never above the
// vehicle's fence when it limits the altitude) and a button that goes ahead, and nothing else but the cross in the corner (and
// Escape) that turns it down. It is a PLAIN button, not a hold (the leader's
// decision): the hold is asked for by what it starts when the vehicle is disarmed (the arm). What the button does is in
// lib/commands/takeoffFlow.ts: GUIDED, arm if disarmed, take off; it stops at the first step that does not go.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useCommandContext } from '@/composables/useCommands'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { useTakeoff } from '@/composables/useTakeoff'
import { useTakeoffCeiling } from '@/composables/useTakeoffCeiling'
import { namedVehicle } from '@/lib/commands/arming'
import { TakeOff } from '@/lib/commands/takeoff'
import { type ArmOutcome, takeOff } from '@/lib/commands/takeoffFlow'
import { IGNORE_MS } from '@/lib/app/safety'
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

const fence = computed(() => fenceCeilingOf(parameter, fields.list.value === 'complete'))
// A fence that cannot be read is not "no fence": the button stays off, and the dialog says why.
const fenceUnknown = computed(() => fence.value === 'unknown')
const limits = computed(() => limitsOf(ceiling.value, fence.value === 'unknown' ? null : fence.value))
const vehicleName = computed(() => namedVehicle(ctx))
const fenceText = computed(() => (fenceUnknown.value ? t('takeoff.problem.fenceUnknown') : ''))
// Nothing is confirmed in the first moments after the dialog appears: a click or key meant for what was under it (an ARMED
// vehicle takes off at the press), as for every question of the app (SafetyConfirm).
const ready = ref(false)
let readyTimer: ReturnType<typeof setTimeout> | undefined

watch(() => takeoff.open.value, open => {
  clearTimeout(readyTimer)
  ready.value = false

  if (open) {
    readyTimer = setTimeout(() => {
      ready.value = true
    }, IGNORE_MS)
  }
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(readyTimer))
const altitude = computed(() => altitudeOf(takeoff.typed.value))
const problem = computed(() => problemOf(altitude.value, limits.value))
const disarmed = computed(() => fields.telemetry.value?.armed !== true)

const whatText = computed(() => t(disarmed.value ? 'takeoff.whatDisarmed' : 'takeoff.whatArmed'))
const limitsText = computed(() => t(`takeoff.limits.${limits.value.by}`, { min: limits.value.min, max: limits.value.max }))
const named = computed(() => ({ min: limits.value.min, max: limits.value.max }))
/** Whether the altitude and the fence let the button go ahead (not whether its first moments are over). */
const mayGo = computed(() => problem.value === null && !fenceUnknown.value)
const problemText = computed(() => (problem.value === null ? '' : t(`takeoff.problem.${problem.value}`, named.value)))

/**
 * Runs the arm command: its hold, and what came of it. A hold that was not held to the end (the cross, Escape), a command that
 * could not run and one that failed are all "cancelled": nothing is assumed of an arm that was not asked for.
 *
 * @returns what the arm came to
 */
async function armIt(): Promise<ArmOutcome> {
  const result = await run('vehicle.arm')

  return result.status === 'done' ? result.outcome.answer ?? 'not-sent' : 'cancelled'
}

/**
 * The button: the takeoff goes ahead (the dialog is closed, and what happens is told in notices). The vehicle is looked at again
 * first: the fix or the EKF may have gone while the dialog was open.
 */
function go(): void {
  if (!ready.value || !mayGo.value) {
    return
  }
  const available = new TakeOff().isEnabled(ctx)
  const metres = altitude.value
  takeoff.hide()

  if (available.enabled) {
    void takeOff(ctx, metres, armIt)
  } else {
    ctx.toast({ id: 'takeoff', severity: 'warning', long: true, text: ctx.say(available.reasonKey, available.reasonParams) })
  }
}
</script>
