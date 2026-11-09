<template>
  <div id="detail">
    <p v-if="!param" class="muted">Select a parameter to see or change it.</p>
    <template v-else>
      <h3>{{ param.id }}</h3>
      <p>
        {{ param.type }} · index {{ param.index }} · on the vehicle:
        <strong>{{ param.value }}{{ details.units }}</strong>{{ details.named }}
      </p>
      <p v-if="details.description" class="muted">{{ details.description }}</p>
      <p v-if="details.range" class="muted">{{ details.range }}</p>
      <p v-if="details.values" class="muted">{{ details.values }}</p>
      <p v-if="fields.draftError.value" class="error">{{ fields.draftError.value }}</p>
      <p v-if="notice" :class="notice.tone">{{ notice.text }}</p>
    </template>
  </div>
  <form id="edit" :hidden="!editable" @submit.prevent="app.write()">
    <input
      id="draft"
      :value="fields.draft.value"
      aria-label="New value"
      autocomplete="off"
      @input="app.editDraft(($event.target as HTMLInputElement).value)"
    >
    <button id="write" type="submit" :disabled="!writable">Write</button>
  </form>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { canWrite, detailsOf, writeNotice } from './paramEditor'
import { useConfigurator } from './useConfigurator'

const { app, fields } = useConfigurator()
const param = computed(() => fields.params.value.find(p => p.id === fields.selected.value) ?? null)
const connected = computed(() => fields.connection.value.state === 'connected')
const editable = computed(() => param.value !== null && connected.value)
const writable = computed(() => canWrite({
  connection: fields.connection.value,
  writing: fields.writing.value,
  draftError: fields.draftError.value,
  draft: fields.draft.value,
}, param.value))
const details = computed(() => {
  const meta = param.value ? fields.metadata.value.get(param.value.id) : undefined

  return detailsOf(meta, param.value?.value ?? 0)
})
const notice = computed(() => {
  const { writing, lastWrite } = fields

  return param.value ? writeNotice(writing.value, lastWrite.value, param.value.id) : null
})
</script>
