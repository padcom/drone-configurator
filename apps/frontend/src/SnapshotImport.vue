<template>
  <section id="import-panel" :hidden="!shown">
    <div id="import">
      <p v-if="fields.importError.value" class="error">{{ fields.importError.value }}</p>
      <template v-else-if="review">
        <h3>{{ t('import.from', { savedAt: review.snapshot.savedAt }) }}</h3>
        <p v-if="review.vehicleWarning" class="warn">{{ t('import.itWas', { warning: review.vehicleWarning }) }}</p>
        <p>{{ t('import.summary', { differ: review.changes.length, same: review.unchanged }) }}</p>
        <ul class="changes">
          <li v-for="change in review.changes" :key="change.id">
            <label>
              <input
                type="checkbox"
                :data-pick="change.id"
                :checked="fields.picked.value.includes(change.id)"
                :disabled="change.problem !== null || fields.applying.value"
                @change="app.togglePick(change.id)"
              >
              {{ t('import.change', { id: change.id, from: change.from ?? t('import.noValue'), to: change.to }) }}
              <span v-if="change.problem" class="muted">{{ t('import.problem', { problem: change.problem }) }}</span>
            </label>
          </li>
        </ul>
        <p v-for="line in applied" :key="line.text" :class="line.tone">{{ line.text }}</p>
        <p v-if="stopped" class="warn">{{ t('import.stopped') }}</p>
      </template>
    </div>
    <button id="apply" type="button" :disabled="!applicable" @click="app.applyImport()">{{ t('import.apply') }}</button>
    <button id="backup" type="button" :hidden="fields.backup.value === null" @click="saveBackup">{{ t('import.backup') }}</button>
    <button id="close-import" type="button" @click="app.closeImport()">{{ t('import.close') }}</button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { saveText, snapshotFileName } from './files'
import { appliedLine, canApply, panelShown, stoppedEarly } from './snapshotImport'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { app, fields } = useConfigurator()
const review = computed(() => fields.importReview.value)
const shown = computed(() => panelShown(fields.importReview.value, fields.importError.value))
const applied = computed(() => fields.applied.value.map(line => appliedLine(line, t)))
const stopped = computed(() => stoppedEarly(fields.applied.value, fields.applying.value))
const applicable = computed(() => canApply({
  picked: fields.picked.value,
  applying: fields.applying.value,
  connection: fields.connection.value,
}))

/** Saves the parameters as they were before the snapshot was applied. */
function saveBackup() {
  saveText(app, fields.backup.value ?? '', snapshotFileName('backup', fields.connection.value.vehicle))
}
</script>
