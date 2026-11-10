<template>
  <p id="metadata-status" class="muted" role="status">
    <span v-if="fields.metadataError.value" class="error">{{ fields.metadataError.value }}</span>
    <span v-else :class="{ error: none }">{{ text }}</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metadataText } from './paramEditor'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { fields } = useConfigurator()
const counts = computed(() => {
  const matches = fields.params.value.map(param => fields.metadata.value.get(param.id)).filter(meta => meta !== undefined)

  return {
    matched: matches.length,
    described: matches.filter(meta => meta.description !== undefined).length,
    total: fields.params.value.length,
    known: fields.metadata.value.size,
  }
})
const none = computed(() => counts.value.known > 0 && counts.value.total > 0 && counts.value.matched === 0)
const text = computed(() => metadataText(counts.value, t))
</script>
