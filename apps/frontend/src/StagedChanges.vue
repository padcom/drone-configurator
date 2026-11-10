<template>
  <!-- No heading to the eye (the button says how many); the region keeps its name for a screen reader. -->
  <section id="staged" class="staged" :aria-label="t('staged.region')">
    <ul v-if="staged.changes.value.length > 0" class="staged-list">
      <li v-for="row in rows" :key="row.change.id" class="staged-row" :class="row.result?.outcome">
        <span class="name">{{ row.change.id }}</span>
        <span class="values"><span class="from">{{ row.change.from }}</span> → <span class="to">{{ row.change.to }}</span></span>
        <span v-if="row.line" class="line" :class="row.line.tone">{{ row.line.text }}</span>
        <button v-if="row.discardable" type="button" class="discard" @click="staged.discard(row.change.id)">
          {{ t('staged.discard') }}<span class="visually-hidden"> {{ row.change.id }}</span>
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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
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
</script>
