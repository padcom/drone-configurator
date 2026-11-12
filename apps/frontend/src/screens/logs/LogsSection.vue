<template>
  <EmptyState class="logs-section" :title="t(`logs.empty.${section}.title`)" :help="t(`logs.empty.${section}.help`)" :level="3" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/ui/EmptyState.vue'

// A part of the Logs screen that is planned but not built: it says what is missing and what it will take (never a blank panel).
// The words are `logs.empty.<part>.title` and `.help`, the part being the one the address names.
const { t } = useI18n()
const route = useRoute()
const section = computed(() => String(route.meta.section ?? 'flights'))
</script>
