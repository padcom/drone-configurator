<template>
  <!-- What narrows the list besides the search: "Modified from default" and the view (Standard or Full), in a panel under one
       button, so that the toolbar stays one row. The button says how many of them are on (a badge, part of its name). -->
  <DropPanel
    id="param-filters"
    icon="sliders"
    :label="t('params.filters.label')"
    :title="t('params.filters.label')"
    :count="on"
  >
    <ModifiedFilter />
    <ParamView />
  </DropPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DropPanel from '@/components/ui/DropPanel.vue'
import ModifiedFilter from './ModifiedFilter.vue'
import ParamView from './ParamView.vue'
import { useModifiedFilter } from '@/composables/useModifiedFilter'
import { useParamView } from '@/composables/useParamView'

// The filters of the Parameters screen's toolbar.
const { t } = useI18n()
const modified = useModifiedFilter()
const { view } = useParamView()
const on = computed(() => Number(modified.on.value) + Number(view.value === 'standard'))
</script>
