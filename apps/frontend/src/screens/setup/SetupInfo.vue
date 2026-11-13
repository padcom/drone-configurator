<template>
  <section class="setup-page-body single" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.info') }}</h3>
      <p class="muted">{{ t('setup.info.summary') }}</p>
      <Banner v-if="error" id="setup-info-error" tone="error">{{ error }}</Banner>
      <p v-if="!details && !error" id="setup-info-loading" class="muted">{{ t('setup.info.loading') }}</p>
      <template v-if="details">
        <dl class="setup-facts-list">
          <template v-for="row in rows" :key="row.id">
            <dt>{{ t(`setup.info.${row.id}`) }}</dt>
            <dd>{{ row.valueKey ? t(row.valueKey) : row.value }}</dd>
          </template>
        </dl>
        <h4 class="setup-label">{{ t('setup.info.sensors') }}</h4>
        <p v-if="!details.sensors" id="setup-info-nosensors" class="muted">{{ t('setup.info.noSensors') }}</p>
        <table v-else class="setup-sensors">
          <thead>
            <tr>
              <th scope="col">{{ t('setup.info.sensor') }}</th>
              <th scope="col">{{ t('setup.info.present') }}</th>
              <th scope="col">{{ t('setup.info.enabled') }}</th>
              <th scope="col">{{ t('setup.info.healthy') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sensor in details.sensors" :key="sensor.id" :data-sensor="sensor.id">
              <th scope="row">{{ t(`setup.sensor.${sensor.id}`) }}</th>
              <td>{{ yes(sensor.present) }}</td>
              <td>{{ yes(sensor.enabled) }}</td>
              <td :class="{ bad: !sensor.healthy }">{{ yes(sensor.healthy) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
      <Button id="setup-info-refresh" :disabled="handle.setup.loadingDetails.value" @click="handle.setup.loadDetails()">
        {{ t('setup.info.refresh') }}
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
// Vehicle information: what the board says of itself (AUTOPILOT_VERSION: firmware version, its kind and git hash, board and
// vendor ids, the unique id) and which sensors it has, uses and finds healthy (SYS_STATUS). A field the vehicle did not give
// is not shown: a dash would look like a value, and a zero like a fact. It is read when the page is shown and when asked.
import { computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { infoRows } from '@/lib/setup/vehicleInfo'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const details = computed(() => handle.setup.details.value)
const error = computed(() => handle.setup.error.value)
const rows = computed(() => details.value ? infoRows(details.value) : [])

/**
 * Yes or no, in words.
 *
 * @param value the answer
 * @returns the word
 */
function yes(value: boolean): string {
  return t(value ? 'setup.info.yes' : 'setup.info.no')
}

onMounted(() => {
  void handle.setup.loadDetails()
})
</script>
