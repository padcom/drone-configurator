<template>
  <p class="muted not-available">{{ t('shell.notAvailable', { screen: t(String(route.meta.titleKey)) }) }}</p>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

// A screen that is planned but not built: it says so, under its own name.
const { t } = useI18n()
const route = useRoute()
</script>
