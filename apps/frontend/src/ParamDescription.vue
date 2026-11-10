<template>
  <section v-if="param" id="param-description" class="param-description" :aria-labelledby="`${uid}-heading`">
    <SectionLabel :id="`${uid}-heading`">{{ t('description.heading') }}</SectionLabel>
    <p v-if="block.hint" class="hint">{{ block.hint }}</p>
    <!-- The text and the rows scroll inside the block, so that a long explanation does not push the rest of the detail away; the
         box takes the focus so that a keyboard can scroll it. -->
    <div v-if="block.text || block.rows.length > 0" class="body" tabindex="0" :aria-label="t('description.heading')">
      <p v-if="block.text" class="text">{{ block.text }}</p>
      <dl v-if="block.rows.length > 0" class="rows">
        <div v-for="row in block.rows" :key="row.label" class="row">
          <dt>{{ row.label }}</dt>
          <dd>
            <span v-for="item in row.items" :key="item" class="item">{{ item }}</span>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import SectionLabel from './kit/SectionLabel.vue'
import { descriptionOf } from './paramDescription'
import { useConfigurator } from './useConfigurator'

// The Description block of the parameter detail: what the loaded metadata says about the selected parameter, in full. Without
// metadata for it, one line says so. It follows the selected parameter and the metadata only (never the telemetry).
const { t } = useI18n()
const { fields } = useConfigurator()
const uid = useId()
const param = computed(() => fields.params.value.find(p => p.id === fields.selected.value) ?? null)
const block = computed(() => descriptionOf(
  param.value ? fields.metadata.value.get(param.value.id) : undefined,
  fields.metadata.value.size > 0,
  t,
))
</script>
