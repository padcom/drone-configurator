
<template>
  <dl class="replay-tiles" :aria-label="t('logs.replay.tiles.title')">
    <div v-for="tile in tiles" :key="tile.id" :id="`replay-tile-${tile.id}`" class="replay-tile">
      <dt>{{ tile.label }}</dt>
      <dd>{{ tile.value }}</dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
// What the log says at the moment of the replay: the place, the height, the speed over the ground, the battery and the flight
// mode. A value the log does not have at that moment is a dash, never a number made up (a gap in the positions, a series the log
// lacks). The speed is worked out from the fixes either side of the moment, so it is the ground speed and nothing more.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChartPoint } from '@/lib/charts/chart'
import { useFormat } from '@/i18n/useFormat'
import { type ModeSpan, modeName } from '@/lib/logs/localLogs'
import { type ReplayTrack, altitudeAt, groundSpeedAt, markAt, seriesAt } from '@/lib/logs/replay'

const props = defineProps<{
  /** The track. */
  track: ReplayTrack
  /** The moment (seconds from the start of the log). */
  time: number
  /** How long the log is (seconds). */
  length: number
  /** The series of the tiles, by `message.field`. */
  series: Record<string, ChartPoint[]>
  /** The stretches of flight modes. */
  spans: ModeSpan[]
  /** The firmware the log names. */
  firmware?: string
}>()

const { t } = useI18n()
const { number } = useFormat()
const NONE = '–'

/**
 * A number with a unit, or a dash.
 *
 * @param value the number, if there is one
 * @param digits the decimals
 * @param unit the unit
 * @returns the words
 */
function shown(value: number | undefined, digits: number, unit: string): string {
  return value === undefined ? NONE : `${number(value, digits)} ${unit}`
}

/**
 * The flight mode at the moment.
 *
 * @returns its name (or its number when the firmware's names are not known), or a dash
 */
function modeNow(): string {
  const span = props.spans.find(s => props.time >= s.fromS && props.time < s.toS)

  return span === undefined ? NONE : modeName(props.firmware, span.mode) ?? t('logs.flights.modes.number', { mode: span.mode })
}

/**
 * The place at the moment, as the map shows the vehicle.
 *
 * @returns the latitude and longitude, or a dash before the first fix
 */
function place(): string {
  const mark = markAt(props.track, props.time)

  return mark === null ? NONE : `${mark.lat.toFixed(5)}, ${mark.lon.toFixed(5)}`
}

/**
 * A tile.
 *
 * @param id which (its label is `logs.replay.tiles.<id>`)
 * @param value what it says
 * @returns the tile
 */
function tile(id: string, value: string): { id: string, label: string, value: string } {
  return { id, label: t(`logs.replay.tiles.${id}`), value }
}

/**
 * A value of a series of the log at the moment.
 *
 * @param key the series, `message.field`
 * @returns the value, or undefined
 */
function seriesNow(key: string): number | undefined {
  return seriesAt(props.series[key] ?? [], props.time, props.length)
}

const tiles = computed(() => [
  tile('position', place()),
  tile('height', shown(seriesNow('CTUN.Alt'), 1, 'm')),
  tile('altitude', shown(altitudeAt(props.track, props.time), 0, 'm')),
  tile('speed', shown(groundSpeedAt(props.track, props.time), 1, 'm/s')),
  tile('battery', shown(seriesNow('BAT.Volt'), 2, 'V')),
  tile('mode', modeNow()),
])
</script>
