<template>
  <div id="detail" class="param-detail">
    <p v-if="!param" class="muted">{{ t('editor.select') }}</p>
    <template v-else>
      <header>
        <h2 class="param-name">{{ param.id }}</h2>
        <p v-if="details.description" class="description">{{ details.description }}</p>
      </header>
      <p class="current">
        <span class="big">{{ param.value }}</span><span class="unit">{{ details.units }}</span>
        <span v-if="details.named" class="named">{{ details.named }}</span>
      </p>
      <p class="facts">{{ t('editor.summary', { type: param.type, index: param.index }) }}</p>
      <p v-if="details.range" class="facts">{{ details.range }}</p>
      <p v-if="details.values && !named" class="facts">{{ details.values }}</p>
      <p v-if="fields.draftError.value" id="draft-error" class="error" role="alert">{{ fields.draftError.value }}</p>
      <p v-if="notice" class="notice" :class="notice.tone">
        <Icon v-if="notice.tone" :name="MARKS[notice.tone]" />
        {{ notice.text }}
      </p>
    </template>
  </div>
  <form id="edit" class="param-edit" :hidden="!editable" @submit.prevent="parameters.write()">
    <label class="field">{{ t('editor.newValue') }}
      <!-- A value with names is chosen from them (any number is still accepted); else a number is typed. -->
      <EnumField v-if="named" v-model="draftNumber" input-id="draft" :options="named" :label="t('editor.newValue')" />
      <!-- Red when the draft is not a valid value, and the reason is in words in #draft-error, which the field points to. -->
      <TextInput
        v-else
        id="draft"
        :model-value="fields.draft.value"
        :aria-label="t('editor.newValue')"
        :invalid="Boolean(fields.draftError.value)"
        :aria-describedby="fields.draftError.value ? 'draft-error' : undefined"
        mono
        large
        autocomplete="off"
        @update:model-value="parameters.editDraft($event)"
      />
    </label>
    <Button id="write" type="submit" variant="primary" :disabled="!writable">{{ t('editor.write') }}</Button>
  </form>
  <section v-if="related.length > 0" class="related" :aria-label="t('editor.related')">
    <SectionLabel>{{ t('editor.related') }}</SectionLabel>
    <div class="related-list">
      <button v-for="id in related" :key="id" type="button" class="related-item" @click="parameters.select(id)">{{ id }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from './EnumField.vue'
import type { EnumOption } from './enumField'
import Button from './kit/Button.vue'
import Icon from './kit/Icon.vue'
import SectionLabel from './kit/SectionLabel.vue'
import TextInput from './kit/TextInput.vue'
import { canWrite, detailsOf, relatedTo, valueOptions, writeNotice } from './paramEditor'
import { useConfigurator } from './useConfigurator'

// The detail of the selected parameter, as the design has it: its name and what it is for, its value in large figures with the
// unit or the name of the value, what is allowed, the field for a new value (a choice from the names when the metadata has
// them), the outcome of the last write in words with a mark, and the related parameters of its group. A write goes to the
// vehicle and is only called done when the vehicle reads the new value back.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const MARKS = { ok: 'check', warn: 'warning', error: 'close' } as const
const param = computed(() => fields.params.value.find(p => p.id === fields.selected.value) ?? null)
const meta = computed(() => param.value ? fields.metadata.value.get(param.value.id) : undefined)
const connected = computed(() => fields.connection.value.state === 'connected')
const editable = computed(() => param.value !== null && connected.value)
const writable = computed(() => canWrite({
  connection: fields.connection.value,
  writing: fields.writing.value,
  draftError: fields.draftError.value,
  draft: fields.draft.value,
}, param.value))
const details = computed(() => detailsOf(meta.value, param.value?.value ?? 0, t))
const named = computed<EnumOption[] | null>(() => valueOptions(meta.value))
// The field of names holds a number; the draft is the text of it (what the vehicle will be asked, once it is valid).
const draftNumber = computed({
  get: () => Number(fields.draft.value || param.value?.value || 0),
  set: (value: number) => parameters.editDraft(String(value)),
})
const related = computed(() => param.value ? relatedTo(fields.params.value, param.value.id) : [])
const notice = computed(() => {
  const { writing, lastWrite } = fields

  return param.value ? writeNotice(writing.value, lastWrite.value, param.value.id, t) : null
})
</script>
