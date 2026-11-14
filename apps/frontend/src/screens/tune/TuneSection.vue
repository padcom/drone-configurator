<template>
  <EmptyState class="tune-section" :title="t(`tune.empty.${section}.title`)" :help="t(`tune.empty.${section}.help`)" :level="3" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/ui/EmptyState.vue'

// A part of the Tune screen that is planned but not built: it says what is missing and when it comes (never a blank panel). The
// words are
// `tune.empty.<part>.title` and `.help`. The part is a prop (the router gives it), not read from the route: this component is
// kept alive while another part is shown, and must go on saying its own words.
const { t } = useI18n()

defineProps<{
  /** The part: `filters`. */
  section: string
}>()
</script>
