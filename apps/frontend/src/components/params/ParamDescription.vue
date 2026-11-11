<template>
  <section v-if="param" id="param-description" class="param-description" :aria-labelledby="`${uid}-heading`">
    <SectionLabel :id="`${uid}-heading`">{{ t('description.heading') }}</SectionLabel>
    <p v-if="block.hint" class="hint">{{ block.hint }}</p>
    <!-- The text, the rows and the related parameters scroll inside the block, so that a long explanation does not push the rest
         of the detail away; the box takes the focus so that a keyboard can scroll it. -->
    <div v-if="hasBody" class="body" role="group" tabindex="0" :aria-label="t('description.heading')">
      <p v-if="block.text" class="text">{{ block.text }}</p>
      <dl v-if="block.rows.length > 0" class="rows">
        <div v-for="row in block.rows" :key="row.label" class="row">
          <dt>{{ row.label }}</dt>
          <dd>
            <span v-for="item in row.items" :key="item" class="item">{{ item }}</span>
          </dd>
        </div>
      </dl>
      <!-- The last part: the other parameters of the same group, a line each: the name (pressed to select it) and, at the right,
           what it is in a few words (cut short with an ellipsis, in full as its tooltip; empty without metadata). -->
      <div v-if="related.length > 0" class="related">
        <h3 class="related-label">{{ t('editor.related') }}</h3>
        <ul class="related-list">
          <li v-for="item in related" :key="item.id" class="related-line">
            <button type="button" class="related-item" @click="parameters.select(item.id)">{{ item.id }}</button>
            <span class="related-text" :title="item.text || undefined">{{ item.text }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import { descriptionOf } from '@/lib/params/paramDescription'
import { relatedTo } from '@/lib/params/paramEditor'
import { useConfigurator } from '@/composables/useConfigurator'

// The Description block of the parameter detail: what the loaded metadata says about the selected parameter in full (the long
// text, the range and the rest; its name and short description are at the top of the detail) and, as the last part, the other
// parameters of its group. Without metadata for it, one line says so. It follows the selected parameter and the metadata only
// (never the telemetry).
const { t } = useI18n()
const { fields, parameters } = useConfigurator()
const uid = useId()
const param = computed(() => fields.params.value.find(p => p.id === fields.selected.value) ?? null)
const block = computed(() => descriptionOf(
  param.value ? fields.metadata.value.get(param.value.id) : undefined,
  fields.metadata.value.size > 0,
  t,
))
const related = computed(() => {
  const ids = param.value ? relatedTo(fields.params.value, param.value.id) : []

  return ids.map(id => ({ id, text: fields.metadata.value.get(id)?.description ?? '' }))
})
// The box that scrolls is there when there is anything to put in it.
const hasBody = computed(() => Boolean(block.value.text) || block.value.rows.length > 0 || related.value.length > 0)
</script>
