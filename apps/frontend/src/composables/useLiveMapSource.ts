// What the live map draws: the connected vehicle's position (a marker with its heading, old when it has not been heard for
// three seconds, none without a position), the path it has flown, and home. The trail starts again when the vehicle is armed (a
// new flight), when another vehicle connects, and when the link ends; it is capped and thinned (lib/map/track.ts).
import { type Ref, computed, shallowRef, watch } from 'vue'
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
 * Starts the path again when the vehicle is armed (a new flight), and when another vehicle connects or the link ends (it was
 * another's).
 *
 * @param handle the Configurator
 * @param restart what starts the path again (with whether the vehicle's place starts the new one)
 */
function restartWhen(handle: ConfiguratorHandle, restart: (here: boolean) => void): void {
  const { connection } = handle.fields
  watch(() => handle.vehicle.telemetry.value?.armed === true, (armed, was) => {
    if (armed && !was) {
      restart(true)
    }
  })
  watch(() => (connection.value.state === 'connected' ? connection.value.vehicle?.sysid : undefined), () => restart(false))
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
  const vehicle = computed(() => markOf(telemetry.value?.position))
  const home = computed(() => homeOf(telemetry.value))
  const { points, restart } = keepPath(vehicle)
  restartWhen(handle, restart)

  return { kind: 'live', vehicle, trail: points, home }
}
