<template>
  <section id="import-panel" class="review" :hidden="!shown">
    <div id="import">
      <p v-if="fields.importError.value" class="error" role="alert">{{ fields.importError.value }}</p>
      <template v-else-if="review">
        <header class="review-head">
          <h3>{{ words?.heading }}</h3>
          <p>{{ t('import.summary', { differ: review.changes.length, same: review.unchanged }) }}</p>
        </header>
        <p v-if="review.vehicleWarning" class="review-warning" role="alert">
          {{ t('import.itWas', { warning: review.vehicleWarning }) }}
        </p>
        <ul v-if="review.notes.length > 0" class="review-notes" :aria-label="t('import.notes')">
          <li v-for="note in review.notes" :key="note">{{ note }}</li>
        </ul>
        <div class="review-scroll">
          <table class="review-table">
            <thead>
              <tr>
                <th scope="col"><span class="visually-hidden">{{ t('import.column.apply') }}</span></th>
                <th scope="col">{{ t('params.column.name') }}</th>
                <th scope="col" class="num">{{ t('import.column.vehicle') }}</th>
                <th scope="col">{{ words?.column }}</th>
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
                <td class="num old">{{ row.change.from === null ? t('import.noValue') : showNumber(row.change.from) }}</td>
                <td class="new">→ {{ showNumber(row.change.to) }}</td>
                <td class="result" :class="row.result.tone">{{ row.result.text }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
    <div class="review-actions">
      <!-- Always in the page, so that what it says is read out as it changes. -->
      <p class="review-status" role="status" :class="{ ok: polite.tone === 'ok', quiet: !polite.text }">{{ polite.text }}</p>
      <!-- A write that stopped is said at once. -->
      <p class="review-status warn" role="alert" :class="{ quiet: assertive.text === '' }">{{ assertive.text }}</p>
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
import { saveText, snapshotFileName } from '@/lib/app/files'
import Button from '@/components/ui/Button.vue'
import { showNumber } from '@/lib/params/paramValue'
import { canApply, panelShown, resultOf, sourceWords, statusOf, stoppedEarly } from '@/lib/params/snapshotImport'
import { useConfigurator } from '@/composables/useConfigurator'

// A snapshot or a parameter file under review, as the design's review has it: a table of what it would change (the value on
// the vehicle, the value in the snapshot or file, and the result of each write in words with a mark), what the file has that
// is not a change (notes), a line that says what is ticked or how it ended, and the buttons. Nothing is ticked at first; the
// changes that cannot be made say why and cannot be ticked, and a value the metadata finds unusual says so but can be ticked.
// A write goes one by one, is refused while the vehicle may be armed, and stops at the first the vehicle does not read back.
const { t } = useI18n()
const { snapshots, fields, parameters } = useConfigurator()
const review = computed(() => fields.importReview.value)
const words = computed(() => review.value ? sourceWords(review.value.source, t) : null)
// Nothing is written while the vehicle is armed or may be (as a Setup write): the line says so, and the button does nothing.
const armed = computed(() => snapshots.mayBeArmed())
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
  armed: armed.value,
}, t))
const none = { tone: '', text: '' } as const
const urgent = computed(() => status.value.tone === 'warn')
const polite = computed(() => urgent.value ? none : status.value)
const assertive = computed(() => urgent.value ? status.value : none)
const applicable = computed(() => !parameters.lock.busy.value && canApply({
  picked: fields.picked.value,
  applying: fields.applying.value,
  connection: fields.connection.value,
  armed: armed.value,
}))

/** Saves the parameters as they were before the snapshot was applied. */
function saveBackup() {
  saveText(snapshots, fields.backup.value ?? '', snapshotFileName('backup', fields.connection.value.vehicle))
}
</script>
