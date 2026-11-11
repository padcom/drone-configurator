<template>
  <EmptyState
    class="not-available"
    :title="t('shell.notAvailable', { screen: t(String(route.meta.titleKey)) })"
    :help="t('shell.notAvailableHelp')"
    :level="2"
  />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/ui/EmptyState.vue'

// A screen that is planned but not built: it says so, under its own name, and says what works now.
const { t } = useI18n()
const route = useRoute()
</script>
