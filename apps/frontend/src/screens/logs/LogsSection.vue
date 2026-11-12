<template>
  <EmptyState class="logs-section" :title="t(`logs.empty.${section}.title`)" :help="t(`logs.empty.${section}.help`)" :level="3" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/ui/EmptyState.vue'

// A part of the Logs screen that is planned but not built: it says what is missing and what it will take (never a blank panel).
// The words are `logs.empty.<part>.title` and `.help`. The part is a prop (the router gives it), not read from the current
// route: this component is kept alive while another part is shown, and must go on saying its own words.
const { t } = useI18n()

defineProps<{
  /** The part: `flights`, `replay`, `spectrum`, `vehicle` or `tools`. */
  section: string
}>()
</script>
