<template>
  <section class="setup-home" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.home.heading') }}</h3>
    <p class="muted">{{ t('setup.home.summary') }}</p>
    <p v-if="listing" class="muted" id="setup-loading">{{ t('setup.home.loading') }}</p>
    <template v-else>
      <ProgressBar :value="progress" :label="progressText" />
      <p id="setup-progress" class="setup-progress">{{ progressText }}</p>
      <RouterLink v-if="status.next" id="setup-next" class="setup-next" :to="{ name: sectionRouteName('setup', status.next.id) }">
        <span class="setup-label">{{ t('setup.home.next') }}</span>
        <span class="setup-next-title">{{ t(`setup.section.${status.next.id}`) }}</span>
        <span>{{ fact(status.next.value) }}</span>
      </RouterLink>
      <p v-else-if="status.required > 0" id="setup-next" class="muted">{{ t('setup.home.allSet') }}</p>
      <div class="setup-cards">
        <RouterLink
          v-for="step in status.steps"
          :key="step.id"
          class="setup-card"
          :class="step.state"
          :to="{ name: sectionRouteName('setup', step.id) }"
        >
          <span class="setup-card-head">
            <span>{{ t(`setup.section.${step.id}`) }}</span>
            <span class="setup-mark" :class="step.state" aria-hidden="true">{{ GLYPH[step.state] }}</span>
            <span class="visually-hidden">{{ t(`setup.state.${step.state}`) }}</span>
          </span>
          <span class="setup-card-value">{{ fact(step.value) }}</span>
          <!-- What was looked at: the card says how it knows, and never that the work is verified. -->
          <span class="muted setup-card-checked">{{ fact(step.checked) }}</span>
        </RouterLink>
      </div>
    </template>
    <aside class="setup-facts" :aria-label="t('setup.home.facts')">
      <h3 class="setup-label">{{ t('setup.home.thisVehicle') }}</h3>
      <dl>
        <template v-for="row in facts" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
      <h3 class="setup-label">{{ t('setup.home.also') }}</h3>
      <RouterLink v-for="id in ALSO" :key="id" class="setup-also" :to="{ name: sectionRouteName('setup', id) }">
        {{ t(`setup.section.${id}`) }}
      </RouterLink>
    </aside>
  </section>
</template>

<script setup lang="ts">
// The Setup home: how many of the steps the parameters can speak of look set up, the first that does not (NEXT), a card for
// each step with its value and WHAT WAS CHECKED to say so, and the facts of the vehicle. It is read from the parameters, so it
// is a guess and says so: no card says "verified", "valid" or "calibrated" (ArduPilot has no such flag over MAVLink).
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useSetupStatus } from '@/composables/useSetupStatus'
import { sectionRouteName } from '@/screens/registry'
import type { VehicleInfo } from '@/generated/app'
import type { Fact, StepState } from '@/lib/setup/setupStatus'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const status = useSetupStatus(handle)
const GLYPH: Record<StepState, string> = { done: '✓', open: '!', unknown: '–' }
const ALSO = ['serial', 'devices', 'info'] as const
const listing = computed(() => handle.parameters.list.value === 'loading' || handle.parameters.list.value === 'none')
const progress = computed(() => status.value.required === 0 ? 0 : status.value.done / status.value.required)
const progressText = computed(() => t('setup.home.progress', { done: status.value.done, required: status.value.required }))

/**
 * A fact in words.
 *
 * @param what the message and what fills it
 * @returns the text
 */
function fact(what: Fact): string {
  return t(what.key, what.params ?? {})
}

/**
 * What the vehicle says of itself, as labelled rows.
 *
 * @param vehicle the vehicle the connection found
 * @param parameters how many parameters it has
 * @returns the rows (none without a vehicle)
 */
function factsOf(vehicle: VehicleInfo | undefined, parameters: number): { label: string, value: string }[] {
  if (!vehicle) {
    return []
  }

  return [
    { label: t('setup.fact.type'), value: vehicle.type },
    { label: t('setup.fact.autopilot'), value: vehicle.autopilot },
    { label: t('setup.fact.system'), value: `${vehicle.sysid}/${vehicle.compid}` },
    { label: t('setup.fact.parameters'), value: String(parameters) },
  ]
}

const facts = computed(() => factsOf(handle.fields.connection.value.vehicle, handle.parameters.params.value.length))
</script>
