// The place the user picked on the map for a Go here: one for the whole page, kept until it is sent, cleared, or the vehicle
// is gone.
import { type ShallowRef, shallowRef } from 'vue'
import type { Place } from '@/lib/fly/guided'

/** The place that is picked, or none. */
const target = shallowRef<Place | null>(null)

/** What the screen and the command use. */
export interface GoHere {
  /** The picked place. */
  target: ShallowRef<Place | null>
  /** Picks a place (the one picked before is dropped). */
  pick: (place: Place) => void
  /** Drops the picked place. */
  clear: () => void
}

/**
 * The picked place of a Go here.
 *
 * @returns the place, and how to pick and drop it
 */
export function useGoHere(): GoHere {
  return {
    target,
    pick: place => {
      target.value = { lat: place.lat, lon: place.lon }
    },
    clear: () => {
      target.value = null
    },
  }
}
