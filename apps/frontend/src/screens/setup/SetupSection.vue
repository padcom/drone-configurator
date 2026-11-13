<template>
  <EmptyState
    class="setup-section"
    :title="t(`setup.empty.${section}.title`)"
    :help="t(`setup.empty.${section}.help`)"
    :level="3"
  />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/ui/EmptyState.vue'

// A Setup page that is planned but not built: it says what it will do (never a blank panel, and the list shows it in its place).
// The words are `setup.empty.<page>.title` and `.help`. The page is a prop (the router gives it), not read from the route:
// this component is kept alive while another page is shown, and must go on saying its own words.
const { t } = useI18n()

defineProps<{
  /** The page: `frame`, `accel`, `compass`, `radio`, `motors`, `battery`, `serial` or `devices`. */
  section: string
}>()
</script>
