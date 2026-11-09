<template>
  <div id="detail">
    <p v-if="!param" class="muted">{{ t('editor.select') }}</p>
    <template v-else>
      <h3>{{ param.id }}</h3>
      <p>
        {{ t('editor.summary', { type: param.type, index: param.index }) }}
        <strong>{{ param.value }}{{ details.units }}</strong>{{ details.named }}
      </p>
      <p v-if="details.description" class="muted">{{ details.description }}</p>
      <p v-if="details.range" class="muted">{{ details.range }}</p>
      <p v-if="details.values" class="muted">{{ details.values }}</p>
      <p v-if="fields.draftError.value" id="draft-error" class="error">{{ fields.draftError.value }}</p>
      <p v-if="notice" :class="notice.tone">{{ notice.text }}</p>
    </template>
  </div>
  <form id="edit" :hidden="!editable" @submit.prevent="parameters.write()">
    <!-- Red when the draft is not a valid value, and the reason is in words in #draft-error, which the field points to. -->
    <TextInput
      id="draft"
      :model-value="fields.draft.value"
      :aria-label="t('editor.newValue')"
      :invalid="Boolean(fields.draftError.value)"
      :aria-describedby="fields.draftError.value ? 'draft-error' : undefined"
      autocomplete="off"
      @update:model-value="parameters.editDraft($event)"
    />
    <Button id="write" type="submit" variant="primary" :disabled="!writable">{{ t('editor.write') }}</Button>
  </form>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import TextInput from './kit/TextInput.vue'
import { canWrite, detailsOf, writeNotice } from './paramEditor'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { parameters, fields } = useConfigurator()
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

  return detailsOf(meta, param.value?.value ?? 0, t)
})
const notice = computed(() => {
  const { writing, lastWrite } = fields

  return param.value ? writeNotice(writing.value, lastWrite.value, param.value.id, t) : null
})
</script>
