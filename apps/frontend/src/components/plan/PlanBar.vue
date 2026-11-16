<template>
  <header class="plan-bar">
    <div class="plan-bar-name">
      <label class="visually-hidden" for="plan-name">{{ t('plan.name.label') }}</label>
      <TextInput
        id="plan-name"
        :model-value="plan.name"
        :placeholder="t('plan.name.placeholder')"
        autocomplete="off"
        @update:model-value="state.rename"
      />
      <span class="plan-bar-status muted">{{ t('plan.status') }}</span>
    </div>
    <div class="plan-bar-actions">
      <CommandButton command="plan.undo" icon-position="none" />
      <CommandButton command="plan.redo" icon-position="none" />
    </div>
  </header>
</template>

<script setup lang="ts">
// The bar over the Plan page: the plan's name, where the plan is (offline: it is not on a vehicle, and nothing here sends it to
// one), and Undo and Redo, which are the commands of the palette as well. What opens, saves, reads and writes a plan comes
// with the stories that do those things; there are no buttons for what does not exist yet.
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { usePlan } from '@/composables/usePlan'

const { t } = useI18n()
const state = usePlan()
const { plan } = state
</script>
