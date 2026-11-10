// One "a write is under way" for every way of writing parameters (one parameter, the changes collected, a snapshot): while one
// holds it, no other starts and every button that would start one is off. Taking it and giving it back are the only two
// things to do, so that a write that ends in any way gives it back. Giving it back twice is harmless, and only the holder's
// own function gives it back (a late one cannot free the lock of the write that came after).
import { type ShallowRef, shallowRef } from 'vue'

/** The lock. */
export interface WriteLock {
  /** True while some write holds the lock. */
  readonly busy: Readonly<ShallowRef<boolean>>
  /**
   * Takes the lock.
   *
   * @returns the function that gives it back, or null when another write holds it
   */
  take: () => (() => void) | null
}

/**
 * Makes a lock that nobody holds.
 *
 * @returns the lock
 */
export function createWriteLock(): WriteLock {
  const busy = shallowRef(false)
  let holder = 0
  let taken = 0

  return {
    busy,
    take: () => {
      if (busy.value) {
        return null
      }
      taken += 1
      const mine = taken
      holder = mine
      busy.value = true

      return () => {
        if (holder === mine) {
          holder = 0
          busy.value = false
        }
      }
    },
  }
}
