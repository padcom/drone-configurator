<template>
  <Dialog v-if="dialog.open.value" :title="t('guided.altitude.title')" @close="dialog.hide()">
    <p id="altitude-vehicle" class="takeoff-vehicle">{{ vehicleName || t('safety.noVehicle') }}</p>
    <p id="altitude-what">{{ t('guided.altitude.what') }}<template v-if="switches"> {{ t('guided.altitude.mode') }}</template></p>
    <label class="takeoff-field" for="altitude-field">
      <span>{{ t('guided.altitude.field') }}</span>
      <TextInput
        id="altitude-field"
        v-model="dialog.typed.value"
        mono
        inputmode="decimal"
        autocomplete="off"
        :invalid="problem !== null"
        aria-describedby="altitude-limits altitude-problem"
      />
    </label>
    <p id="altitude-limits" class="muted">{{ t('guided.altitude.limits', limits) }}</p>
    <p id="altitude-problem" class="takeoff-problem" role="alert">{{ problemText }}</p>
    <template #actions>
      <!-- Cancel has the focus: the safe answer is the one that is given by a key pressed by mistake. -->
      <Button id="altitude-cancel" data-initial-focus @click="dialog.hide()">{{ t('confirm.cancel') }}</Button>
      <Button id="altitude-go" variant="primary" :disabled="problem !== null" :data-armed="ready" @click="go">
        {{ t('guided.altitude.go') }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The dialog of "Change altitude": how high (metres above home, from 2 m to the user's highest) and a button that goes ahead.
// It is a PLAIN
// button, not a hold: the vehicle goes to the altitude where it is and holds there, which is one deliberate press, and it
// ignores presses in its
// first moments like every question. What the button does is in lib/commands/changeAltitudeFlow.ts.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useChangeAltitude } from '@/composables/useChangeAltitude'
import { useCommandContext } from '@/composables/useCommands'
import { useConfigurator } from '@/composables/useConfigurator'
import { useGuidedPreferences } from '@/composables/useGuidedPreferences'
import { namedVehicle } from '@/lib/commands/arming'
import { ChangeAltitude } from '@/lib/commands/changeAltitude'
import { changeAltitude } from '@/lib/commands/changeAltitudeFlow'
import { IGNORE_MS } from '@/lib/app/safety'
import { MIN_ALTITUDE_M, altitudeProblem, altitudeToKeep } from '@/lib/fly/guided'
import { altitudeOf } from '@/lib/fly/takeoff'

const { t } = useI18n()
const dialog = useChangeAltitude()
const { fields } = useConfigurator()
const { prefs } = useGuidedPreferences()
const ctx = useCommandContext()

const vehicleName = computed(() => namedVehicle(ctx))
const altitude = computed(() => altitudeOf(dialog.typed.value))
const problem = computed(() => altitudeProblem(altitude.value, prefs.value))
const limits = computed(() => ({ min: MIN_ALTITUDE_M, max: prefs.value.maxAltitude }))
const problemText = computed(() => (problem.value === null ? '' : t(`guided.altitude.problem.${problem.value}`, limits.value)))
/** Whether the vehicle is in another mode: a change of altitude then switches it to GUIDED first. */
const switches = computed(() => fields.telemetry.value !== null && fields.telemetry.value.mode !== 'GUIDED')

// Nothing is confirmed in the first moments after the dialog appears: a click or key meant for what was under it.
const ready = ref(false)
let readyTimer: ReturnType<typeof setTimeout> | undefined

watch(() => dialog.open.value, open => {
  clearTimeout(readyTimer)
  ready.value = false

  if (open) {
    // (the altitude the vehicle is at is what is proposed)
    dialog.typed.value = String(altitudeToKeep(fields.telemetry.value))
    readyTimer = setTimeout(() => {
      ready.value = true
    }, IGNORE_MS)
  }
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(readyTimer))

/**
 The button: the change goes ahead (the dialog is closed, and what happens is told in notices). The vehicle is looked at
/** again first.
 */
function go(): void {
  if (!ready.value || problem.value !== null) {
    return
  }
  const metres = altitude.value
  const available = new ChangeAltitude().isEnabled(ctx)
  dialog.hide()

  if (available.enabled) {
    void changeAltitude(ctx, metres)
  } else {
    const text = ctx.say(available.reasonKey, available.reasonParams)
    ctx.toast({ id: 'altitude-stopped', severity: 'warning', long: true, text })
  }
}
</script>
