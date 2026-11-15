
<template>
  <section class="logs-replay" :data-section="section" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('logs.replay.title') }}</h3>
    <!-- Always in the page, so that its words are read out when they change (a log that was opened, stopped or failed). -->
    <p id="replay-status" class="visually-hidden" role="status">{{ statusText }}</p>
    <!-- The map is the same as the Fly screen's (tiles, pan and zoom, the credit), and draws what the replay says; it takes
         the area at the left and does not scroll: only the aside does. -->
    <div class="replay-map">
      <FlightMap :source="source" :follow-vehicle="false" :fit="replay.track.value?.places">
        <template #default="{ place, size }">
          <MapOverlay :source="source" :place="place" :size="size" />
        </template>
      </FlightMap>
    </div>
    <aside class="replay-aside" :aria-label="t('logs.replay.aside')">
      <div class="logs-toolbar">
        <Menu id="replay-log" :label="pickLabel" :items="logItems" @select="choose" />
      </div>
      <Banner v-if="replay.error.value" id="replay-error" tone="error" :role="failed ? 'presentation' : undefined">
        {{ replay.error.value }}
      </Banner>
      <div v-if="busy" class="flight-reading">
        <ProgressBar :value="fraction" :label="t('logs.replay.readingBar', { id: openId })" />
        <span id="replay-busy" class="muted">{{ busyText }}</span>
        <Button id="replay-stop" @click="replay.cancel()">{{ t('logs.flights.stop') }}</Button>
      </div>
      <EmptyState
        v-else-if="replay.phase.value === 'idle'"
        id="replay-idle"
        :title="t('logs.replay.idle.title')"
        :help="t('logs.replay.idle.help')"
        :level="4"
      />
      <template v-else-if="replay.phase.value === 'unverified'">
        <Banner id="replay-not-verified" tone="warn">{{ notVerifiedText }}</Banner>
      </template>
      <!-- A log with no position: nothing is drawn, and the reason is the backend's own. -->
      <EmptyState
        v-else-if="replay.phase.value === 'none'"
        id="replay-none"
        :title="t('logs.replay.none.title')"
        :help="replay.noneWhy.value ?? ''"
        :level="4"
      />
      <template v-else-if="track && summary">
        <Banner v-if="isTlog" id="replay-imported-mark" tone="info">{{ t('logs.flights.importedMark') }}</Banner>
        <p id="replay-facts" class="muted">{{ factsText }}</p>
        <p v-if="track.skipped > 0" id="replay-skipped" class="muted">{{ t('logs.replay.skipped', { count: track.skipped }) }}</p>
        <p v-if="track.home === null" id="replay-no-home" class="muted">{{ t('logs.replay.noHome') }}</p>
        <ReplayTransport
          :time="clock.time"
          :length="clock.length"
          :playing="clock.playing"
          :speed="clock.speed"
          @toggle="clock.toggle()"
          @speed="clock.speed = $event"
          @seek="seek"
        />
        <FlightModeStrip :spans="spans" :firmware="summary.firmware" :cursor="clock.time" />
        <ReplayTiles
          :track="track"
          :time="clock.time"
          :length="clock.length"
          :series="replay.series.value"
          :spans="spans"
          :firmware="summary.firmware"
        />
        <ReplayJumps :jumps="replay.jumps.value" :firmware="summary.firmware" @go="seek" />
      </template>
    </aside>
  </section>
</template>

<script setup lang="ts">
// "Replay" in Logs: a flight on this computer drawn on the map, as the live map draws a flight (the same markers and path),
// with the path ahead dashed and the vehicle moved by the clock of this page (a frame at a time while it plays: the backend is
// asked for nothing when it runs or when it is moved). The track comes from `logs.local.track`: a few thousand thinned
// positions, home as the log says it was, and its events; a log with no position says so and why, and a log that is not
// verified is not looked into. The map is at the left and the rest is the aside, which scrolls by itself from 1000 px wide;
// below that the two stack.
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlightMap from '@/components/map/FlightMap.vue'
import MapOverlay from '@/components/map/MapOverlay.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Menu from '@/components/ui/Menu.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { ReplayPhase } from '@/composables/useReplay'
import { useReplayMapSource } from '@/composables/useReplayMapSource'
import type { LocalLog } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { asNumber, clockOf, lengthOf, modeSpans } from '@/lib/logs/localLogs'
import { ReplayClock, type ReplayTrack } from '@/lib/logs/replay'
import type { MenuItem } from '@/lib/ui/menuKeys'
import FlightModeStrip from './FlightModeStrip.vue'
import ReplayJumps from './ReplayJumps.vue'
import ReplayTiles from './ReplayTiles.vue'
import ReplayTransport from './ReplayTransport.vue'

defineProps<{
  /** The part of the Logs screen (the router gives it). */
  section: string
}>()

const { t, locale } = useI18n()
const uid = useId()
const { number } = useFormat()
const { flights, replay } = useConfigurator()

/** The clock of the replay: where it is, whether it runs, how fast. */
const clock = reactive(new ReplayClock(0))
const track = computed(() => replay.track.value)
const summary = computed(() => replay.summary.value)
const source = useReplayMapSource(replay.track, computed(() => clock.time))
const spans = computed(() => (summary.value ? modeSpans(replay.modes.value, summary.value) : []))
const busy = computed(() => ['reading', 'loading'].includes(replay.phase.value))
const openLog = computed(() => flights.logs.value.find(log => log.key === replay.open.value))
const openId = computed(() => openLog.value?.id ?? 0)
const isTlog = computed(() => openLog.value?.source === 'tlog')
const fraction = computed(() => {
  const progress = replay.progress.value

  return progress === null || progress.total === 0 ? 0 : progress.bytes / progress.total
})

/**
 * What a log is called in the list: its number, and for an imported recording that it is one; with the date of its file.
 *
 * @param log the log
 * @returns the words
 */
function nameOf(log: LocalLog): string {
  const name = log.source === 'tlog' ? t('logs.flights.importedRow', { id: log.id }) : String(log.id)
  const modified = asNumber(log.modified)

  return modified === 0 ? name : `${name} · ${new Date(modified).toLocaleString(locale.value)}`
}

const logItems = computed<MenuItem[]>(() => flights.logs.value.map(log => ({ id: log.key, label: nameOf(log) })))
const pickLabel = computed(() => (openLog.value ? t('logs.replay.log', { name: nameOf(openLog.value) }) : t('logs.replay.pick')))
const failed = computed(() => replay.phase.value === 'failed')
const busyKey = computed(() => (replay.phase.value === 'reading' ? 'logs.flights.reading' : 'logs.flights.loadingParts'))
const busyText = computed(() => t(busyKey.value, { id: openId.value }))
const notVerifiedText = computed(() => t(isTlog.value ? 'logs.flights.notVerifiedImported' : 'logs.flights.notVerified'))

/**
 * What the facts line says of the positions: where they come from, how many there are, how long the flight is.
 *
 * @param flight the track, if there is one
 * @returns the words
 */
function factsOf(flight: ReplayTrack | null): string {
  const values = { count: number(flight?.total ?? 0, 0), length: clockOf(clock.length) }

  return flight ? t(`logs.replay.source.${flight.source}`, values) : ''
}

const factsText = computed(() => factsOf(track.value))

/** What the polite status says, by how far the screen has got. */
const STATUS: Readonly<Record<ReplayPhase, () => string>> = {
  reading: () => busyText.value,
  loading: () => busyText.value,
  ready: () => t('logs.replay.status.ready', { id: openId.value }),
  none: () => replay.noneWhy.value ?? '',
  failed: () => replay.error.value ?? '',
  unverified: () => notVerifiedText.value,
  idle: () => (replay.stopped.value ? t('logs.replay.status.stopped') : ''),
}
const statusText = computed(() => STATUS[replay.phase.value]())

/**
 * Opens a log, unless one is being read (the press is ignored: the backend reads one thing at a time).
 *
 * @param key the log
 */
function choose(key: string): void {
  if (!busy.value) {
    void replay.choose(key)
  }
}

/**
 * Goes to a moment of the flight (the page's own clock: nothing is asked of the backend).
 *
 * @param time seconds from the start of the log
 */
function seek(time: number): void {
  clock.seek(time)
}

// The clock runs a frame at a time while it plays, and not at all when it is stopped.
let frame = 0
let last = 0

/**
 * One frame of a replay that runs.
 *
 * @param now the time of the frame (ms)
 */
function tick(now: number): void {
  clock.advance(now - last)
  last = now
  frame = clock.playing ? requestAnimationFrame(tick) : 0
}

watch(() => clock.playing, playing => {
  cancelAnimationFrame(frame)
  frame = 0

  if (playing) {
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }
})

/** A log that is ready begins at its first fix, stopped. */
function begin(): void {
  const [log, flight] = [summary.value, track.value]
  if (log && flight) {
    clock.length = lengthOf(log) ?? flight.to
    clock.seek(flight.from)
  }
}

// Another log (or none) stops the clock; a log that is ready begins at its first fix.
watch(() => replay.phase.value, phase => {
  clock.playing = false
  clock.speed = 1
  clock.length = 0
  clock.seek(0)

  if (phase === 'ready') {
    begin()
  }
})

onMounted(() => {
  if (!flights.listed.value) {
    void flights.refresh()
  }
})

// The screen is kept alive while another part is shown, and logs may have been downloaded meanwhile: the list is read again
// when this part is shown again. The clock does not run while the part is not shown.
onActivated(() => {
  if (flights.listed.value && !flights.loading.value && !busy.value) {
    void flights.refresh()
  }
})
onDeactivated(() => {
  clock.playing = false
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
