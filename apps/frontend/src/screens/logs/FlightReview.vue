
<template>
  <ul class="flight-review" :aria-label="t('logs.flights.review.title')">
    <li v-for="row in rows" :key="row.id" class="flight-finding" :class="row.tone">
      <span class="flight-glyph" aria-hidden="true">{{ row.glyph }}</span>
      <span class="flight-level">{{ row.level }}</span>
      <span class="flight-text">{{ row.text }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
// The findings of the automatic review, one sentence each: what was found, the limit it was held against, and where in the
// log (the board's wording: "Peak 41 m/s² at 0:47, limit 30"). The level is written in words, the colour only adds. The limits
// are guidelines, and the sentence says the limit it used; a thing the log has no data for says so, and is never a pass.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReviewFinding } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { asNumber, clockOf, glyphOf, toneOf } from '@/lib/logs/localLogs'

const props = defineProps<{
  /** The findings. */
  findings: ReviewFinding[]
  /** The time of the log's first message (microseconds): the findings say when in the log, from there. */
  firstUs: number
}>()

const { t } = useI18n()
const { number } = useFormat()

/**
 * A number of a finding without trailing zeros.
 *
 * @param value the number, if there is one
 * @returns the text
 */
function shown(value: number | undefined): string {
  return number(value ?? 0, 2).replace(/[.,]?0+$/u, '')
}

/**
 * Where in the log a finding was found, as minutes and seconds from the start.
 *
 * @param atUs the time, if the finding has one
 * @returns the text, empty when there is none
 */
function whenOf(atUs: number | bigint | undefined): string {
  return atUs === undefined ? '' : clockOf((asNumber(atUs) - props.firstUs) / 1e6)
}

/**
 * The sentence of a finding.
 *
 * @param f the finding
 * @returns its words
 */
function sentence(f: ReviewFinding): string {
  if (f.level === 'no-data') {
    return t('logs.flights.review.noData', { name: t(`logs.flights.review.name.${f.id}`) })
  }

  return t(`logs.flights.review.${f.id}`, {
    value: shown(f.value),
    limit: shown(f.limit),
    at: whenOf(f.atUs),
    samples: f.samples ?? 0,
  })
}

const rows = computed(() => props.findings.map(f => ({
  id: f.id,
  tone: toneOf(f),
  glyph: glyphOf(f),
  level: t(`logs.flights.level.${f.level === 'no-data' ? 'noData' : f.level}`),
  text: sentence(f),
})))
</script>
