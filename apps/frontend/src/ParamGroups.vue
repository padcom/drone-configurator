<template>
  <nav class="param-groups" :aria-label="t('params.groups')">
    <button
      v-for="group in all"
      :key="group.id"
      type="button"
      class="param-group"
      :class="{ chosen: group.id === current }"
      :aria-pressed="group.id === current ? 'true' : 'false'"
      :data-group="group.id"
      @click="choice.choose(group.id)"
    >
      <span>{{ group.id === '' ? t('params.allGroups') : group.id }}</span>
      <span class="count">{{ group.count }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { effectiveGroup, groupsOf } from './paramGroups'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

// The groups of the parameter list, with how many parameters are in each ("All" first): a click shows only that group. The
// groups come from the parameters' names. A group that is no longer there (another vehicle) is as if All were chosen.
const { t } = useI18n()
const { fields } = useConfigurator()
const choice = useParamGroup()
const groups = computed(() => groupsOf(fields.params.value))
const all = computed(() => [{ id: '', count: fields.params.value.length }, ...groups.value])
const current = computed(() => effectiveGroup(fields.params.value, choice.chosen.value))
</script>
