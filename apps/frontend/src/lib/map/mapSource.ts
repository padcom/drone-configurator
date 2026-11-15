// Where the overlays of the map get what they draw: the vehicle, where it has been, and home. The live map has its own (the
// telemetry of the connected vehicle); the replay of a log will have one that moves with its scrubber. The map and its overlays
// know only this interface, so both draw the same way.
import type { Ref } from 'vue'
import type { LatLon, VehicleMark } from './track'

/** What the map draws over its tiles. */
export interface MapSource {
  /** Whether it is the connected vehicle (`live`) or a recorded flight (`log`). */
  readonly kind: 'live' | 'log'
  /** The vehicle, or null when there is no position to draw (nothing is made up). */
  readonly vehicle: Readonly<Ref<VehicleMark | null>>
  /** The path flown, oldest first. */
  readonly trail: Readonly<Ref<readonly LatLon[]>>
  /** Home, or null when the vehicle has not said where it is. */
  readonly home: Readonly<Ref<LatLon | null>>
}
