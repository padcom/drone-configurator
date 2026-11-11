<template>
  <div id="detail" class="param-detail">
    <p v-if="!param" class="muted">{{ t('editor.select') }}</p>
    <template v-else>
      <!-- The panel's heading: the name of the parameter and, when the metadata has one, what it is in a few words. The value is
           in the selected row of the list, and the long text and the facts are in the Description below. -->
      <header>
        <h2 class="param-name">{{ param.id }}</h2>
        <p v-if="meta?.description" class="description">{{ meta.description }}</p>
      </header>
      <p v-if="fields.draftError.value" id="draft-error" class="error" role="alert">{{ fields.draftError.value }}</p>
    </template>
    <!-- What the metadata finds unusual about the draft is said in a region that is always in the page, so that a screen reader
         reads what is put in it (not wrong: the vehicle validates and the read-back says what it kept; the field points to it,
         as it does to an error). How the writes go is said by the changes, below. -->
    <div class="notices">
      <p id="draft-warning" class="notice warning" role="status">{{ warningText }}</p>
    </div>
  </div>
  <!-- Escape in the field goes back to the list (a field of names with its list open closes that first, and keeps the key). -->
  <form id="edit" class="param-edit" :hidden="!editable" @submit.prevent="staged.sync()" @keydown.esc="backToList">
    <!-- The label is beside the field, not around it: a field of names holds a list of buttons, which would become its name. -->
    <!-- Off while the changes are being written: what is typed then could not be queued, and the user is not told why. -->
    <fieldset class="field" :disabled="staged.writing.value">
      <label for="draft">{{ t('editor.newValue') }}</label>
      <!-- A value with names is chosen from them (any number is still accepted); else a number is typed. Either way the change
           is queued when the value is settled: a name picked, or Enter or leaving the field (not on every key, so that "1" on
           the way to "1500" is never queued). -->
      <!-- A value whose bits have names (a Bitmask) is chosen bit by bit; if the metadata has both, the bits win. -->
      <BitField
        v-if="bitNames && param"
        input-id="draft"
        :options="bitNames"
        :type="param.type"
        :value="draftNumber"
        :draft="fields.draft.value"
        :label="t('editor.newValue')"
        :invalid="Boolean(fields.draftError.value)"
        :describedby="describedBy"
        :disabled="staged.writing.value"
        @edit="parameters.editDraft($event)"
        @settle="staged.sync()"
      />
      <EnumField
        v-else-if="named"
        v-model="draftNumber"
        input-id="draft"
        :options="named"
        :label="t('editor.newValue')"
        :invalid="Boolean(fields.draftError.value)"
        :describedby="describedBy"
        :disabled="staged.writing.value"
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
        @change="staged.sync()"
      />
    </fieldset>
    <!-- Only for a parameter that is not at its initial value (the one it had at the last complete download): queues that value,
         and nothing is written until Write is pressed. -->
    <Button
      v-if="initialValue !== undefined"
      id="reset-one"
      class="reset-one"
      :disabled="staged.writing.value"
      :title="t('params.initial.resetHelp', { initial: showNumber(initialValue) })"
      @click="resetToInitial"
    >
      {{ t('params.initial.reset') }}
    </Button>
  </form>
  <ParamDescription />
  <StagedChanges />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BitField from '@/components/fields/BitField.vue'
import type { BitOption } from '@/lib/params/bitmask'
import EnumField from '@/components/fields/EnumField.vue'
import type { EnumOption } from '@/lib/params/enumField'
import ParamDescription from './ParamDescription.vue'
import StagedChanges from './StagedChanges.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { initialIfChanged } from '@/lib/params/initialValues'
import { bitNamesOf, numberOr, valueOptions } from '@/lib/params/paramEditor'
import { canonical, showNumber } from '@/lib/params/paramValue'
import { useConfigurator } from '@/composables/useConfigurator'

// The detail of the selected parameter: its name and what it is, the field for a value (a choice from the names when the
// metadata has them), then the description (with the related parameters of its group) and the changes collected. A value that
// is settled and differs from the vehicle's is queued at once (the value back at the vehicle's takes it out again); "Write N
// and verify" is the one way to write, and a write is only called done when the vehicle reads the new value back.
const { t } = useI18n()
const { parameters, fields, staged } = useConfigurator()
const param = computed(() => fields.params.value.find(p => p.id === fields.selected.value) ?? null)
const meta = computed(() => param.value ? fields.metadata.value.get(param.value.id) : undefined)
const editable = computed(() => param.value !== null && fields.connection.value.state === 'connected')
// The initial value of the selected parameter, when it is not at it (else undefined: there is nothing to reset).
const initialValue = computed(() => initialIfChanged(param.value?.id, parameters.changed.value, fields.initial.value))

/** Queues the initial value of the selected parameter (a change that was queued for it is replaced). */
function resetToInitial(): void {
  if (param.value && initialValue.value !== undefined) {
    staged.resetTo([{ id: param.value.id, to: initialValue.value }])
  }
}
// What the warning region says: the warning, unless there is an error (the error is said instead).
const warningText = computed(() => fields.draftError.value ? '' : (fields.draftWarning.value ?? ''))
// The field points to the words about its draft: the error when there is one, else the warning.
const describedBy = computed(() => {
  if (fields.draftError.value) {
    return 'draft-error'
  }

  return fields.draftWarning.value ? 'draft-warning' : undefined
})

/**
 * Escape in the Value field: the focus goes back to the list, unless something else took the key (the list of names of the
 * field, which was open and is closed by it).
 *
 * @param event the key press
 */
function backToList(event: KeyboardEvent): void {
  if (!event.defaultPrevented) {
    document.getElementById('param-list')?.focus()
  }
}
const named = computed<EnumOption[] | null>(() => valueOptions(meta.value))
// The named bits of an integer parameter (none when the metadata has none, or the value is not an integer).
const bitNames = computed<BitOption[] | null>(() => bitNamesOf(param.value, meta.value?.bits))
// The field of names holds a number; the draft is the text of it. Picking a name settles the value: it is queued.
const draftNumber = computed({
  get: () => {
    const typed = numberOr(fields.draft.value, param.value?.value ?? 0)

    // The number as the vehicle holds it: an integer has no decimals (the boxes of the bits and the names are of that number).
    return param.value ? canonical(param.value, typed) : typed
  },
  set: (value: number) => {
    parameters.editDraft(showNumber(value))
    staged.sync()
  },
})
</script>
