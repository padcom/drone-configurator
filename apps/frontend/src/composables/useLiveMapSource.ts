// What the live map draws: the connected vehicle's position (a marker with its heading, old when it has not been heard for
// three seconds, none without a position), the path it has flown, and home. The trail starts again when the vehicle is armed (a
// new flight) and when ANOTHER vehicle connects (another system id); it is capped and thinned (lib/map/track.ts). While the link
// is down, or the vehicle reconnects, the path stays and the marker stays where the vehicle was last heard, marked as old with
// the time since: nothing is made up and nothing the user was looking at is wiped.
import { type Ref, computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { type ConfiguratorHandle, useConfigurator } from '@/composables/useConfigurator'
import type { Telemetry } from '@/generated/app'
import type { MapSource } from '@/lib/map/mapSource'
import { type LatLon, type VehicleMark, Trail, drawable, markOf } from '@/lib/map/track'

/**
 * Home, from the telemetry: where the vehicle says it is, and none while it has not said (or says (0, 0)).
 *
 * @param telemetry what the vehicle reports
 * @returns the place, or null
 */
function homeOf(telemetry: Telemetry | null | undefined): LatLon | null {
  const place = telemetry?.home

  return drawable(place) ? { lat: place.lat, lon: place.lon } : null
}

/**
 * Whether a vehicle that connected is another than the one before it (the link going away is none).
 *
 * @param sysid the system id that connected, if one did
 * @param known the system id of the vehicle before
 * @returns true when both are known and differ
 */
function anotherVehicle(sysid: number | undefined, known: number | undefined): boolean {
  return sysid !== undefined && known !== undefined && sysid !== known
}

/**
 * Starts the path again when the vehicle is armed (a new flight), and when another vehicle connects (a different system id: the
 * path was another's). The same vehicle coming back, and the link going away, leave it as it is.
 *
 * @param handle the Configurator
 * @param restart what starts the path again (with whether the vehicle's place starts the new one)
 */
function restartWhen(handle: ConfiguratorHandle, restart: (here: boolean) => void): void {
  const { connection } = handle.fields
  const sysidNow = () => (connection.value.state === 'connected' ? connection.value.vehicle?.sysid : undefined)
  let known = sysidNow()
  watch(() => handle.vehicle.telemetry.value?.armed === true, (armed, was) => {
    if (armed && !was) {
      restart(true)
    }
  })
  watch(sysidNow, sysid => {
    if (anotherVehicle(sysid, known)) {
      restart(false)
    }
    known = sysid ?? known
  })
}

/** The vehicle as the map shows it: as it was last heard when it is not heard now. */
interface Held {
  /** The marker: the live one, else the last one, old and getting older. */
  mark: Readonly<Ref<VehicleMark | null>>
  /** Lets go of the last marker (another vehicle). */
  forget: () => void
}

/** How often the age of a marker that is not heard now is counted again (ms). */
const AGE_TICK_MS = 1000

/**
 * Keeps the last place the vehicle was heard at: shown as old, with the time since, while there is nothing newer (the link went,
 * or the vehicle is reconnecting). The time is counted by a timer that runs only while the marker is held.
 *
 * @param heard the marker of what the vehicle says now (none when it says nothing)
 * @returns the marker to show
 */
function holdLast(heard: Readonly<Ref<VehicleMark | null>>): Held {
  const last = shallowRef<{ mark: VehicleMark, at: number } | null>(null)
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  watch(heard, mark => {
    if (mark) {
      last.value = { mark, at: Date.now() }
    }
  }, { immediate: true })
  watch(() => heard.value === null && last.value !== null, running => {
    clearInterval(timer)
    timer = running ? setInterval(() => void (now.value = Date.now()), AGE_TICK_MS) : undefined
    now.value = Date.now()
  }, { immediate: true })
  onScopeDispose(() => clearInterval(timer))

  const mark = computed<VehicleMark | null>(() => {
    const kept = last.value
    if (heard.value || !kept) {
      return heard.value
    }

    return { ...kept.mark, ageMs: kept.mark.ageMs + Math.max(0, now.value - kept.at), stale: true }
  })

  return { mark, forget: () => void (last.value = null) }
}

/** The path flown, and what starts it again. */
interface Path {
  /** The points (replaced when a place comes). */
  points: Ref<readonly LatLon[]>
  /** Starts the path again, from the place the vehicle is at now or from nothing. */
  restart: (here: boolean) => void
}

/**
 * Keeps the path: a place for each step the vehicle moves.
 *
 * @param vehicle the vehicle on the map
 * @returns the path
 */
function keepPath(vehicle: Readonly<Ref<VehicleMark | null>>): Path {
  const trail = new Trail()
  const points = shallowRef<readonly LatLon[]>([])
  watch(vehicle, mark => {
    if (mark && trail.add(mark)) {
      points.value = trail.all
    }
  })

  return {
    points,
    restart: here => {
      trail.reset()

      if (here && vehicle.value) {
        trail.add(vehicle.value)
      }
      points.value = trail.all
    },
  }
}

/**
 * The map source of the connected vehicle. It runs for as long as the component that asks is there.
 *
 * @param handle the Configurator (the shared one when not given)
 * @returns the source
 */
export function useLiveMapSource(handle: ConfiguratorHandle = useConfigurator()): MapSource {
  const { telemetry } = handle.vehicle
  const heard = computed(() => markOf(telemetry.value?.position))
  const home = computed(() => homeOf(telemetry.value))
  const held = holdLast(heard)
  const { points, restart } = keepPath(heard)
  restartWhen(handle, here => {
    restart(here)

    if (!here) {
      held.forget()
    }
  })

  return { kind: 'live', vehicle: held.mark, trail: points, home }
}
