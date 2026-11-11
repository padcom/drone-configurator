<template>
  <div class="panel-form">
    <template v-for="row in rows" :key="row.id">
      <SectionLabel v-if="row.kind === 'head'" :level="3">{{ row.text }}</SectionLabel>
      <p v-else-if="row.kind === 'note'" class="form-note">{{ row.text }}</p>
      <p v-else-if="row.kind === 'warn'" class="form-warn" role="alert">{{ row.text }}</p>
      <div v-else-if="row.kind === 'info'" class="form-info">
        <span>{{ row.label }}</span>
        <span class="value">{{ row.value }}</span>
      </div>
      <label v-else-if="row.kind === 'slider'" class="form-slider">
        <span class="line"><span>{{ row.label }}</span><span class="value">{{ row.text }}</span></span>
        <input
          type="range"
          :min="row.min"
          :max="row.max"
          :step="row.step"
          :value="row.value"
          @input="emit('change', row.id, Number(($event.target as HTMLInputElement).value))"
        >
      </label>
      <Checkbox v-else-if="row.kind === 'check'" :model-value="row.value" @update:model-value="emit('change', row.id, $event)">
        {{ row.label }}
      </Checkbox>
      <label v-else-if="row.kind === 'text'" class="form-field">
        <span>{{ row.label }}</span>
        <TextInput
          mono
          :model-value="row.value"
          :placeholder="row.placeholder"
          @update:model-value="emit('change', row.id, $event)"
        />
      </label>
      <div v-else-if="row.kind === 'enum'" class="form-field">
        <label :for="`${formId}-${row.id}`">{{ row.label }}</label>
        <EnumField
          :input-id="`${formId}-${row.id}`"
          :model-value="row.value"
          :options="row.options"
          :label="row.label"
          @update:model-value="emit('change', row.id, $event)"
        />
      </div>
      <Button
        v-else-if="row.kind === 'button'"
        class="form-button"
        :variant="row.tone ?? 'default'"
        @click="emit('press', row.id)"
      >
        {{ row.label }}
      </Button>
    </template>
  </div>
</template>

<script setup lang="ts">
// The form the specialist screens share: rows of a few kinds, one under the other, 12 px apart. It holds no value: the
// rows come in, and what the user does goes out (`change`, `press`), so the screen that owns the form owns what it means.
import { useId } from 'vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EnumField from './EnumField.vue'
import type { FormRow, FormValue } from '@/lib/params/panelForm'

defineProps<{
  /** What the form shows, from the top. */
  rows: FormRow[]
}>()

/** Makes the ids of the form's fields its own: two forms on a page may have rows with the same id. */
const formId = useId()

const emit = defineEmits<{
  /** The user changed a row: its id and the new value. */
  change: [id: string, value: FormValue]
  /** The user pressed a button row: its id. */
  press: [id: string]
}>()
</script>
