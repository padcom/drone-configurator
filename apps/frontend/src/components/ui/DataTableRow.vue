<template>
  <div
    :class="['data-table-row', rowClass?.(row), { selected }]"
    role="row"
    :aria-rowindex="index + 2"
    :aria-selected="selected"
    :data-index="index"
    :style="{ top: `${index * rowPx}px`, height: `${rowPx}px`, gridTemplateColumns: template }"
    v-bind="rowAttrs?.(row)"
  >
    <div
      v-for="(column, col) in columns"
      :key="column.id"
      class="data-table-cell"
      :class="{ end: column.align === 'end', editing: editedCol === col }"
      :role="column.rowHeader ? 'rowheader' : 'gridcell'"
      :aria-colindex="col + 1"
      :data-column="col"
      :tabindex="fields ? undefined : stopCol === col ? 0 : -1"
      @click="emit('cursor', index, col)"
      @dblclick="emit('edit', index, col)"
    >
      <template v-if="editedCol === col">
        <slot
          name="editor"
          :row="row"
          :column="column"
          :text="editedText ?? ''"
          :set="setText"
          :commit="commit"
          :cancel="cancel"
        >
          <input
            v-focus
            class="kit-input data-table-input"
            :class="{ end: column.align === 'end' }"
            type="text"
            :value="editedText ?? ''"
            :aria-label="column.header"
            @input="setText(($event.target as HTMLInputElement).value)"
            @blur="commit()"
          >
        </slot>
      </template>
      <slot
        v-else
        name="cell"
        :row="row"
        :column="column"
        :value="column.value(row)"
        :stop="stopCol === col"
      >
        {{ column.value(row) }}
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts" generic="Row">
// One row of the kit's data table (DataTable.vue): its cells, and the editor of the one being edited. A component of its own,
// keyed by the row, so that a row is drawn again only when what it is given changes (its row object, its place, the widths, the
// cursor or an edit in it): scrolling a windowed table moves rows from one place in the list to another, and a row in place of
// another must not be drawn again (a `v-memo` in a `v-for` is kept by place, not by key, so it missed on every scroll).
// Everything it is given is a value or a function that stays the same: the caller's `rowClass` and `rowAttrs` are called here,
// not passed as results.
import type { Column } from '@/lib/ui/dataTable'

defineProps<{
  /** The row. */
  row: Row
  /** Its place in the table (from 0): where it is drawn. */
  index: number
  /** The columns. */
  columns: readonly Column<Row>[]
  /** The columns' widths, as a grid template. */
  template: string
  /** The height of a row (px). */
  rowPx: number
  /** The column of this row that is the table's one tab stop, or -1. */
  stopCol: number
  /** The column of this row that is being edited, or -1. */
  editedCol: number
  /** The text of that edit so far, or null. */
  editedText: string | null
  /** Whether it is the selected row (undefined: the table has no selection). */
  selected?: boolean
  /** A table whose cells are the caller's fields (the cell takes no tab stop of its own). */
  fields?: boolean
  /** The caller's class for a row. */
  rowClass?: (row: Row) => string | undefined
  /** The caller's attributes for a row. */
  rowAttrs?: (row: Row) => Record<string, string>
  /** The edit's text is said (the table's, the same function for every row). */
  setText: (text: string) => void
  /** The edit is ended with its text. */
  commit: () => void
  /** The edit is dropped. */
  cancel: () => void
}>()

const emit = defineEmits<{
  /** A cell was clicked: the cursor goes there. */
  cursor: [index: number, col: number]
  /** A cell was double-clicked: an edit of it begins. */
  edit: [index: number, col: number]
}>()

/** Puts the focus in the field that appears when a cell is edited. */
const vFocus = {
  mounted: (element: HTMLInputElement): void => {
    element.focus()
    element.select()
  },
}
</script>
