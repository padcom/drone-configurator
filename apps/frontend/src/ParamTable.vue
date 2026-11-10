<template>
  <div class="param-scroll">
    <table v-if="visible.length > 0" :class="{ described: meaning }">
      <!-- With metadata the layout is fixed, from the widths of the widest name and value (in the mono face, so a character is a
           `ch`): the browser then does not measure every row's text to lay the table out (a switch back to this screen does
           it again, and that was 120 to 270 ms with the whole list). The last column is what is left. -->
      <colgroup v-if="meaning">
        <col class="col-text" :style="{ width: `calc(${widths.name}ch + var(--cell-padding))` }">
        <col class="col-text" :style="{ width: `calc(${widths.value}ch + var(--cell-padding))` }">
        <col>
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{{ t('params.column.name') }}</th>
          <th scope="col" class="num">{{ t('params.column.value') }}</th>
          <th v-if="meaning" scope="col">{{ t('params.column.meaning') }}</th>
        </tr>
      </thead>
      <tbody id="rows">
        <tr
          v-for="row in rows"
          :key="row.param.id"
          :data-id="row.param.id"
          :class="{ selected: row.param.id === fields.selected.value }"
          @click="parameters.select(row.param.id)"
        >
          <th scope="row" class="name"><span class="prefix">{{ row.name.prefix }}</span>{{ row.name.rest }}</th>
          <td class="num">{{ row.param.value }}</td>
          <td v-if="meaning" class="meaning" :title="row.meaning || undefined">{{ row.meaning }}</td>
        </tr>
      </tbody>
    </table>
    <EmptyState v-else-if="params.length === 0" :title="t('params.empty.title')" :help="t(emptyHelp)" />
    <EmptyState v-else :title="t('params.noMatch.title')" :help="t('params.noMatch.help')">
      <Button id="clear-search" @click="clear">{{ t('params.noMatch.clear') }}</Button>
    </EmptyState>
  </div>
  <p id="list-status" class="list-status muted">{{ status }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import EmptyState from './kit/EmptyState.vue'
import { effectiveGroup, splitName } from './paramGroups'
import { listStatusText, visibleParams } from './paramList'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

// The parameters, one row each: the name (its group part dimmed), the value, and, when metadata is loaded, what it means.
// The header stays while the rows scroll. The line below the table says how many there are and how many are shown. A list
// with nothing to show says why (no parameters yet, or none that match) and, for the second, offers the way out.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const choice = useParamGroup()
const params = computed(() => fields.params.value)
const group = computed(() => effectiveGroup(params.value, choice.chosen.value))
const visible = computed(() => visibleParams(params.value, fields.filter.value, group.value))
const meaning = computed(() => fields.metadata.value.size > 0)
// The widest name and the widest value of the whole list (not only of what is shown, so that the columns do not move with the
// search), in characters; the header's own words are the least a column has.
const widths = computed(() => ({
  name: params.value.reduce((widest, param) => Math.max(widest, param.id.length), 'NAME'.length),
  value: params.value.reduce((widest, param) => Math.max(widest, String(param.value).length), 'VALUE'.length + 1),
}))
// What an empty list says to do, by how the download stands: nothing yet (connect), on its way, or failed (press Download).
const EMPTY_HELP: Record<string, string> = { loading: 'params.empty.loading', failed: 'params.empty.failed' }
const emptyHelp = computed(() => EMPTY_HELP[fields.list.value] ?? 'params.empty.none')
const rows = computed(() => visible.value.map(param => ({
  param,
  name: splitName(param.id),
  meaning: fields.metadata.value.get(param.id)?.description ?? '',
})))
const status = computed(() => {
  const { list, missing } = fields
  const counts = { list: list.value, total: params.value.length, missing: missing.value, shown: visible.value.length }

  return listStatusText(counts, t)
})

/** Takes the search and the group away, so that every parameter is shown again. */
function clear(): void {
  parameters.setFilter('')
  choice.choose('')
}
</script>
