// What the map draws of a recorded flight: the same things as of a live one (the vehicle, the path flown, home), with the path
// still to fly as well, all from the track and the moment of the replay. A seek or a frame changes the moment and nothing is
// asked of the backend: the track is in memory. Nothing is drawn where the log has no position (before the first fix there is no
// vehicle).
import { type Ref, computed } from 'vue'
import { type ReplayTrack, markAt, splitPath } from '@/lib/logs/replay'
import type { MapSource } from '@/lib/map/mapSource'

/**
 * The map source of a replay.
 *
 * @param track the track of the log that is open, or null
 * @param time the moment of the replay (seconds from the start of the log)
 * @returns the source
 */
export function useReplayMapSource(
  track: Readonly<Ref<ReplayTrack | null>>,
  time: Readonly<Ref<number>>,
): MapSource {
  const vehicle = computed(() => (track.value ? markAt(track.value, time.value) : null))
  const paths = computed(() => (track.value ? splitPath(track.value, time.value, vehicle.value) : { flown: [], ahead: [] }))

  return {
    kind: 'log',
    vehicle,
    trail: computed(() => paths.value.flown),
    ahead: computed(() => paths.value.ahead),
    home: computed(() => track.value?.home ?? null),
  }
}
