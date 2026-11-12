
<template>
  <section class="logs-tools" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="logs-tools-title">{{ t('logs.setup.title') }}</h3>
    <p id="setup-status" class="visually-hidden" role="status">{{ statusText }}</p>
    <EmptyState
      v-if="!logging.available.value"
      id="setup-none"
      :title="t('logs.setup.none.title')"
      :help="t('logs.setup.none.help')"
      :level="4"
    />
    <template v-else>
      <Banner v-if="logging.armed.value" id="setup-armed" tone="warn">{{ t('logs.setup.armed') }}</Banner>
      <Banner v-if="!logging.editable.value" id="setup-not-editable" tone="warn">{{ t('logs.setup.notEditable') }}</Banner>
      <Banner id="setup-fills" tone="warn">{{ t('logs.setup.fills') }}</Banner>

      <fieldset class="setup-group">
        <legend>{{ t('logs.setup.streams') }}</legend>
        <p v-if="!logging.named.value" id="setup-unnamed" class="muted">
          {{ t('logs.setup.unnamed') }}
          <Button id="setup-load-metadata" @click="metadata.openFile()">{{ t('logs.setup.loadMetadata') }}</Button>
        </p>
        <ul class="setup-list">
          <li v-for="row in logging.streams.value" :key="row.bit">
            <Checkbox
              :model-value="row.on"
              :data-bit="row.bit"
              :disabled="locked"
              @update:model-value="tick('LOG_BITMASK', row.bit, $event)"
            >
              {{ row.name ?? t('logs.setup.bit', { bit: row.bit }) }}
            </Checkbox>
          </li>
        </ul>
      </fieldset>

      <fieldset v-if="hasBatch" class="setup-group">
        <legend>{{ t('logs.setup.batch') }}</legend>
        <p class="muted">{{ t('logs.setup.batchHelp') }}</p>
        <ul class="setup-list">
          <li v-for="row in logging.imus.value" :key="`imu${row.bit}`">
            <Checkbox
              :model-value="row.on"
              :data-bit="row.bit"
              :disabled="locked"
              @update:model-value="tick('INS_LOG_BAT_MASK', row.bit, $event)"
            >
              {{ row.name ?? t('logs.setup.bit', { bit: row.bit }) }}
            </Checkbox>
          </li>
        </ul>
        <p class="muted">{{ t('logs.setup.batchReboot') }}</p>
      </fieldset>

      <section class="setup-estimate" :aria-label="t('logs.setup.estimate.title')">
        <h4>{{ t('logs.setup.estimate.title') }}</h4>
        <p id="setup-measured">{{ measuredText }}</p>
        <p id="setup-batch">{{ batchText }}</p>
        <p class="muted">{{ t('logs.setup.estimate.assumes') }}</p>
      </section>

      <div class="setup-actions">
        <Button
          id="setup-queue"
          variant="primary"
          :aria-disabled="canQueue ? undefined : 'true'"
          :aria-describedby="logging.armed.value ? 'setup-armed' : undefined"
          @click="queue()"
        >
          {{ t('logs.setup.queue', { count: logging.changes.value.length }, logging.changes.value.length) }}
        </Button>
        <Button id="setup-revert" :aria-disabled="canRevert ? undefined : 'true'" @click="logging.revert()">
          {{ t('logs.setup.revert') }}
        </Button>
      </div>
      <StagedChanges />
    </template>
  </section>
</template>

<script setup lang="ts">
// "Tools": the logging setup. The streams the vehicle logs (the bits of LOG_BITMASK, named by the parameter metadata when it is
// loaded and numbered when it is not), and the batch sampling that the Spectrum needs. Ticking changes nothing on the vehicle:
// "Add to the changes" puts the new values in the list of parameter changes, written from there after one question and read back.
// The page says that more logging fills the vehicle's storage faster, gives a size it labels as an estimate and says what it
// rests on, and queues nothing while the vehicle is armed (or may be).
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import StagedChanges from '@/components/params/StagedChanges.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useLoggingSetup } from '@/composables/useLoggingSetup'
import { useFormat } from '@/i18n/useFormat'
import { BATCH_MASK, megabytes } from '@/lib/logs/loggingSetup'

defineProps<{
  /** The part of the Logs screen (the router gives it). */
  section: string
}>()

const { t } = useI18n()
const { number } = useFormat()
const uid = useId()
const { parameters, metadata, flights, staged, fields } = useConfigurator()

const logging = useLoggingSetup({
  params: () => parameters.params.value,
  metadata: () => metadata.metadata.value,
  telemetry: () => fields.telemetry.value,
  logs: () => flights.logs.value,
  stage: targets => staged.stage(targets),
})

const hasBatch = computed(() => parameters.params.value.some(param => param.id === BATCH_MASK))
const canRevert = computed(() => logging.changes.value.length > 0)
/** Nothing is ticked or queued while the vehicle is armed (or may be), or when a mask is not an int32. */
const locked = computed(() => logging.armed.value || !logging.editable.value)
const canQueue = computed(() => !locked.value && logging.changes.value.length > 0)
const statusText = computed(() => (logging.armed.value ? t('logs.setup.armed') : ''))

const measuredText = computed(() => {
  const { measured } = logging.estimate.value

  return measured === null
    ? t('logs.setup.estimate.noLog')
    : t('logs.setup.estimate.measured', { mb: number(megabytes(measured), 1) })
})

const batchText = computed(() => {
  const { batch, batchNow } = logging.estimate.value
  const mb = number(megabytes(batch), 1)

  if (batch === 0) {
    return t('logs.setup.estimate.batchOff')
  }

  const now = number(megabytes(batchNow), 1)

  return batch === batchNow ? t('logs.setup.estimate.batch', { mb }) : t('logs.setup.estimate.batchChange', { mb, now })
})

/**
 * A tick.
 *
 * @param id the parameter
 * @param bit the position
 * @param on whether it is ticked
 */
function tick(id: string, bit: number, on: boolean): void {
  if (!locked.value) {
    logging.set(id, bit, on)
  }
}

/** Adds the changes to the queue (not while armed). */
function queue(): void {
  if (canQueue.value) {
    logging.queue()
  }
}
</script>
