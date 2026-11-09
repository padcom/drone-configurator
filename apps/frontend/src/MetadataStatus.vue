<template>
  <p id="metadata-status" class="muted">
    <span v-if="fields.metadataError.value" class="error">{{ fields.metadataError.value }}</span>
    <template v-else>{{ text }}</template>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metadataText } from './paramEditor'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { fields } = useConfigurator()
const text = computed(() => metadataText(fields.metadata.value.size, t))
</script>
