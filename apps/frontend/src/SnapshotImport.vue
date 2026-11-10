<template>
  <section id="import-panel" class="review" :hidden="!shown">
    <div id="import">
      <p v-if="fields.importError.value" class="error" role="alert">{{ fields.importError.value }}</p>
      <template v-else-if="review">
        <header class="review-head">
          <h3>{{ t('import.from', { savedAt: review.snapshot.savedAt }) }}</h3>
          <p>{{ t('import.summary', { differ: review.changes.length, same: review.unchanged }) }}</p>
        </header>
        <p v-if="review.vehicleWarning" class="review-warning" role="alert">
          {{ t('import.itWas', { warning: review.vehicleWarning }) }}
        </p>
        <div class="review-scroll">
          <table class="review-table">
            <thead>
              <tr>
                <th scope="col"><span class="visually-hidden">{{ t('import.column.apply') }}</span></th>
                <th scope="col">{{ t('params.column.name') }}</th>
                <th scope="col" class="num">{{ t('import.column.vehicle') }}</th>
                <th scope="col">{{ t('import.column.snapshot') }}</th>
                <th scope="col">{{ t('import.column.result') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.change.id" :class="row.result.tone">
                <td>
                  <input
                    type="checkbox"
                    :data-pick="row.change.id"
                    :aria-label="t('import.apply', { id: row.change.id })"
                    :checked="fields.picked.value.includes(row.change.id)"
                    :disabled="row.change.problem !== null || fields.applying.value"
                    @change="snapshots.toggle(row.change.id)"
                  >
                </td>
                <th scope="row" class="name">{{ row.change.id }}</th>
                <td class="num old">{{ row.change.from ?? t('import.noValue') }}</td>
                <td class="new">→ {{ row.change.to }}</td>
                <td class="result" :class="row.result.tone">{{ row.result.text }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
    <div class="review-actions">
      <!-- Always in the page, so that what it says is read out as it changes. -->
      <p class="review-status" role="status" :class="status.tone">{{ status.text }}</p>
      <Button id="backup" :hidden="fields.backup.value === null" @click="saveBackup">{{ t('import.backup') }}</Button>
      <Button id="close-import" @click="snapshots.close()">{{ t('import.close') }}</Button>
      <Button id="apply" variant="primary" :disabled="!applicable" @click="snapshots.apply()">
        {{ t('import.write', { count: fields.picked.value.length }) }}
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { saveText, snapshotFileName } from './files'
import Button from './kit/Button.vue'
import { canApply, panelShown, resultOf, statusOf, stoppedEarly } from './snapshotImport'
import { useConfigurator } from './useConfigurator'

// A snapshot under review, as the design's review has it: a table of what it would change (the value on the vehicle, the value
// in the snapshot, and the result of each write in words with a mark), a line that says what is ticked or how it ended, and the
// buttons. Nothing is ticked at first; the changes that cannot be made say why and cannot be ticked. A write goes one by one
// and stops at the first the vehicle does not read back.
const { t } = useI18n()
const { snapshots, fields, parameters } = useConfigurator()
const review = computed(() => fields.importReview.value)
const shown = computed(() => panelShown(fields.importReview.value, fields.importError.value))
const stopped = computed(() => stoppedEarly(fields.applied.value, fields.applying.value))
const rows = computed(() => (review.value?.changes ?? []).map(change => {
  const progress = { applied: fields.applied.value, stopped: stopped.value, picked: fields.picked.value.includes(change.id) }

  return { change, result: resultOf(change, progress, t) }
}))
const status = computed(() => statusOf({
  picked: fields.picked.value,
  applied: fields.applied.value,
  applying: fields.applying.value,
}, t))
const applicable = computed(() => !parameters.lock.busy.value && canApply({
  picked: fields.picked.value,
  applying: fields.applying.value,
  connection: fields.connection.value,
}))

/** Saves the parameters as they were before the snapshot was applied. */
function saveBackup() {
  saveText(snapshots, fields.backup.value ?? '', snapshotFileName('backup', fields.connection.value.vehicle))
}
</script>
