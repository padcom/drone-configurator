<template>
  <!-- No heading to the eye (the button says how many); the region keeps its name for a screen reader. -->
  <section id="staged" class="staged" :aria-label="t('staged.region')">
    <ul v-if="staged.changes.value.length > 0" ref="list" class="staged-list">
      <li v-for="row in rows" :key="row.change.id" class="staged-row" :class="row.result?.outcome" :data-id="row.change.id">
        <!-- The name selects the parameter, so that its value can be edited again (or put back, which takes the change out). -->
        <button type="button" class="name" @click="parameters.select(row.change.id)">{{ row.change.id }}</button>
        <span class="values"><span class="from">{{ row.change.from }}</span> → <span class="to">{{ row.change.to }}</span></span>
        <span v-if="row.line" class="line" :class="row.line.tone">{{ row.line.text }}</span>
        <!-- A trash can at the right of the row; its name says which parameter it takes out. -->
        <button
          v-if="row.discardable"
          type="button"
          class="discard"
          :aria-label="t('staged.discard', { id: row.change.id })"
          :title="t('staged.discard', { id: row.change.id })"
          @click="discard(row.change.id)"
        >
          <Icon name="trash" />
        </button>
      </li>
    </ul>
    <!-- Always in the page, so that how the writing went is read out. -->
    <p class="staged-status" role="status" :class="{ quiet: !summary.polite }">{{ summary.polite }}</p>
    <p class="staged-status warn" role="alert" :class="{ quiet: !summary.urgent }">{{ summary.urgent }}</p>
    <Button id="write-staged" variant="primary" :disabled="!writable" @click="staged.writeAll()">
      {{ t('staged.write', { count: pending.length }) }}
    </Button>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import Icon from './kit/Icon.vue'
import { linesFor, summaryOf } from './stagedChanges'
import { useConfigurator } from './useConfigurator'

// The changes collected to be written together, as the design has them: each with the value on the vehicle and the value to
// write, a way to take it out, and, once written, how it went in words with a mark. "Write N and verify" sends them one
// after the other and stops at the first the vehicle does not read back. Nothing is written until that button is pressed.
const { t } = useI18n()
const { staged, fields, parameters } = useConfigurator()
const pending = computed(() => staged.pending())
const connected = computed(() => fields.connection.value.state === 'connected')
const writable = computed(() => connected.value && !parameters.lock.busy.value && pending.value.length > 0)
const rows = computed(() => linesFor(staged.changes.value, staged.results.value, staged.writing.value, t))
const summary = computed(() => summaryOf(staged.changes.value, staged.results.value, staged.writing.value, t))
const list = ref<HTMLElement | null>(null)

/**
 * Focuses an element, if there is one.
 *
 * @param element the element, or null
 */
function focusOn(element: HTMLElement | null | undefined): void {
  element?.focus()
}

/**
 * Gives the focus to the trash can of the row at `at` (the one that took the place of a row that went), else of the one
 * before it, else of any other, else to the Value field.
 *
 * @param box the list of rows, if it is still there
 * @param at where the row that went was
 */
function focusNear(box: HTMLElement | null, at: number): void {
  const left = [...(box?.querySelectorAll('.staged-row') ?? [])]
  const nearest = [...left.slice(at), ...left.slice(0, at).reverse()]
  const button = nearest.map(row => row.querySelector<HTMLElement>('.discard')).find(Boolean)

  focusOn(button ?? document.getElementById('draft'))
}

/**
 * Takes a change out, and gives the focus to the trash can of the row that took its place (else of the one before it, else of
 * any that is left), or to the Value field when none is left: the button that had the focus is gone, and the focus must not
 * fall back to the page.
 *
 * @param id the parameter whose change is taken out
 */
async function discard(id: string): Promise<void> {
  const at = rows.value.findIndex(row => row.change.id === id)
  staged.discard(id)
  await nextTick()
  focusNear(list.value, at)
}
</script>
