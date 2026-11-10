<template>
  <p id="metadata-status" class="muted">
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
const hasDescription = (id: string): boolean => fields.metadata.value.get(id)?.description !== undefined
const described = computed(() => fields.params.value.filter(param => hasDescription(param.id)).length)
const none = computed(() => fields.metadata.value.size > 0 && fields.params.value.length > 0 && described.value === 0)
const text = computed(() => metadataText(described.value, fields.params.value.length, fields.metadata.value.size, t))
</script>
