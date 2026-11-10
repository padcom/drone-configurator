<template>
  <div id="detail" class="param-detail">
    <p v-if="!param" class="muted">{{ t('editor.select') }}</p>
    <template v-else>
      <!-- The name of the panel for a screen reader. The value is in the selected row of the list, and what the metadata says
           about the parameter is in the Description. -->
      <h2 class="visually-hidden">{{ param.id }}</h2>
      <p v-if="fields.draftError.value" id="draft-error" class="error" role="alert">{{ fields.draftError.value }}</p>
    </template>
    <!-- How a write is going is said in regions that are always in the page, so that a screen reader reads what is put in them:
         a polite one while the vehicle is asked ("Writing…") and, out of sight, for a write that was read back (the value is in
         the list), an assertive one for a write that is not confirmed or that the vehicle changed, and a polite one for what the
         metadata finds unusual about the draft (not wrong: the write is allowed, the vehicle validates and the read-back says
         what it kept; the field points to it, as it does to an error). A failed write is never silent. -->
    <div class="notices">
      <p id="write-status" class="notice" role="status">
        <span :class="{ 'visually-hidden': polite?.hidden }">{{ polite?.text }}</span>
      </p>
      <p id="write-alert" class="notice" role="alert" :class="assertive?.tone">
        <template v-if="assertive">
          <Icon name="close" />
          {{ assertive.text }}
        </template>
      </p>
      <p id="draft-warning" class="notice warning" role="status">{{ warningText }}</p>
    </div>
  </div>
  <form id="edit" class="param-edit" :hidden="!editable" @submit.prevent="parameters.write()">
    <!-- The label is beside the field, not around it: a field of names holds a list of buttons, which would become its name. -->
    <div class="field">
      <label for="draft">{{ t('editor.newValue') }}</label>
      <!-- A value with names is chosen from them (any number is still accepted); else a number is typed. -->
      <EnumField
        v-if="named"
        v-model="draftNumber"
        input-id="draft"
        :options="named"
        :label="t('editor.newValue')"
        :invalid="Boolean(fields.draftError.value)"
        :describedby="describedBy"
      />
      <!-- Red when the draft is not a valid value, and the reason is in words in #draft-error, which the field points to. -->
      <TextInput
        v-else
        id="draft"
        :model-value="fields.draft.value"
        :invalid="Boolean(fields.draftError.value)"
        :aria-describedby="describedBy"
        mono
        large
        autocomplete="off"
        @update:model-value="parameters.editDraft($event)"
      />
    </div>
    <div class="param-edit-actions">
      <Button id="stage" :disabled="!stageable" @click="staged.stage()">{{ t('staged.add') }}</Button>
      <Button id="write" type="submit" variant="primary" :disabled="!writable">{{ t('editor.write') }}</Button>
    </div>
  </form>
  <ParamDescription />
  <StagedChanges />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from './EnumField.vue'
import type { EnumOption } from './enumField'
import Button from './kit/Button.vue'
import Icon from './kit/Icon.vue'
import ParamDescription from './ParamDescription.vue'
import StagedChanges from './StagedChanges.vue'
import TextInput from './kit/TextInput.vue'
import { canWrite, numberOr, valueOptions, writeNotice } from './paramEditor'
import { useConfigurator } from './useConfigurator'

// The detail of the selected parameter: the field for a value (a choice from the names when the metadata has them), what is
// said while it is written and when a write is not confirmed, then the description (with the related parameters of its group)
// and the changes collected. A write goes to the vehicle and is only called done when the vehicle reads the new value back (the
// new value then shows in the list); one that is not confirmed is said at once.
const { t } = useI18n()
const { parameters, fields, staged } = useConfigurator()
const param = computed(() => fields.params.value.find(p => p.id === fields.selected.value) ?? null)
const meta = computed(() => param.value ? fields.metadata.value.get(param.value.id) : undefined)
const connected = computed(() => fields.connection.value.state === 'connected')
const editable = computed(() => param.value !== null && connected.value)
// Adding to the changes needs a valid draft that differs from the vehicle's value, as a write does (nothing is sent yet).
const stageable = computed(() => connected.value && staged.canStage())
// No write starts while another (the changes collected, a snapshot) is under way.
const free = computed(() => !parameters.lock.busy.value)
const writable = computed(() => free.value && canWrite({
  connection: fields.connection.value,
  writing: fields.writing.value,
  draftError: fields.draftError.value,
  draft: fields.draft.value,
}, param.value))
// What the warning region says: the warning, unless there is an error (the error is said instead).
const warningText = computed(() => fields.draftError.value ? '' : (fields.draftWarning.value ?? ''))
// The field points to the words about its draft: the error when there is one, else the warning.
const describedBy = computed(() => {
  if (fields.draftError.value) {
    return 'draft-error'
  }

  return fields.draftWarning.value ? 'draft-warning' : undefined
})
const named = computed<EnumOption[] | null>(() => valueOptions(meta.value))
// The field of names holds a number; the draft is the text of it (what the vehicle will be asked, once it is valid).
const draftNumber = computed({
  get: () => numberOr(fields.draft.value, param.value?.value ?? 0),
  set: (value: number) => parameters.editDraft(String(value)),
})
const notice = computed(() => {
  const { writing, lastWrite } = fields

  return param.value ? writeNotice(writing.value, lastWrite.value, param.value.id, t) : null
})
// A write that is not confirmed, or that the vehicle changed, is said at once (an alert); the rest politely.
const urgent = computed(() => notice.value?.tone === 'error')
const polite = computed(() => urgent.value ? null : notice.value)
const assertive = computed(() => urgent.value ? notice.value : null)
</script>
