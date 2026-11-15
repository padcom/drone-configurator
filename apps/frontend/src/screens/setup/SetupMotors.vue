<template>
  <section class="setup-page-body single" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.motors') }}</h3>
      <p class="muted">{{ t('setup.motors.summary') }}</p>
      <!-- The test and the outputs are side by side when the column is wide enough to hold both. -->
      <div class="setup-motors-pair">
        <SetupMotorTest />
        <div class="setup-motors-outputs">
          <h4 class="setup-label">{{ t('setup.motors.outputs') }}</h4>
          <EmptyState
            v-if="rows.length === 0"
            :id="old ? 'setup-outputs-old' : undefined"
            :title="t(old ? 'setup.motors.outputsOld' : 'setup.motors.noOutputs')"
            :help="t(old ? 'setup.motors.outputsOldHelp' : 'setup.motors.noOutputsHelp')"
            :level="4"
          />
          <table v-else id="setup-outputs" class="setup-outputs">
            <tbody>
              <tr v-for="row in rows" :key="row.output" :data-output="row.output">
                <th scope="row">{{ t('setup.motors.output', { n: row.output }) }}</th>
                <td><ProgressBar :value="row.fraction" :label="t('setup.motors.output', { n: row.output })" /></td>
                <td class="setup-output-pulse">{{ t('setup.motors.pulse', { us: row.pulse }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// The motors: the test of each motor (the section SetupMotorTest, held buttons, locked until it is unlocked) and, beside it, the
// live outputs of the vehicle (SERVO_OUTPUT_RAW through the `servo` telemetry group, not shown once they are old): a table that
// is only READ (it sends nothing to a motor). The page writes no parameter: the ESC protocol and the spin thresholds are on the
// ESCs' page.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SetupMotorTest from './SetupMotorTest.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { outputRows, outputsOld } from '@/lib/setup/motors'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const rows = computed(() => outputRows(handle.vehicle.telemetry.value?.servo))
const old = computed(() => outputsOld(handle.vehicle.telemetry.value?.servo))
</script>
