// Where the keys of a menu go, apart from the DOM: the next item that can be chosen, the ends, and type-ahead. A disabled
// item is never landed on.

/** One entry of a menu. */
export interface MenuItem {
  /** What `select` says when it is chosen. */
  id: string
  /** Its words. */
  label: string
  /** A key that does the same elsewhere ("Ctrl C"), shown at the right. */
  hint?: string
  /** Cannot be chosen now: skipped by the keys. */
  disabled?: boolean
}

/**
 * The next item that can be chosen from `from`, going `delta` (1 down, -1 up) and wrapping round.
 *
 * @param items the items
 * @param from the item the focus is on, or -1 for none
 * @param delta 1 or -1
 * @returns its index, or -1 when no item can be chosen
 */
export function step(items: MenuItem[], from: number, delta: 1 | -1): number {
  for (let n = 1; n <= items.length; n += 1) {
    const at = (((from + (delta * n)) % items.length) + items.length) % items.length
    if (items[at] && !items[at].disabled) {
      return at
    }
  }

  return -1
}

/**
 * The first or last item that can be chosen.
 *
 * @param items the items
 * @param end `first` or `last`
 * @returns its index, or -1 when none can be chosen
 */
export function edge(items: MenuItem[], end: 'first' | 'last'): number {
  return end === 'first' ? step(items, -1, 1) : step(items, 0, -1)
}

/**
 * Whether an item can be chosen and its label starts with what was typed.
 *
 * @param item the item, if there is one
 * @param wanted what was typed, in lower case
 * @returns true when it fits
 */
function startsWith(item: MenuItem | undefined, wanted: string): boolean {
  return item !== undefined && !item.disabled && item.label.toLowerCase().startsWith(wanted)
}

/**
 * The item that type-ahead goes to: the first that can be chosen and whose label starts with what was typed, looking on from
 * the item the focus is on (from the next one when one letter was typed, so that the same letter again goes on to the next
 * item with it).
 *
 * @param items the items
 * @param from the item the focus is on
 * @param typed what was typed (a short while's keys)
 * @returns its index, or -1 for none
 */
export function typeAhead(items: MenuItem[], from: number, typed: string): number {
  const wanted = typed.toLowerCase()
  const begin = typed.length === 1 ? from + 1 : from
  for (let n = 0; n < items.length; n += 1) {
    const at = (((begin + n) % items.length) + items.length) % items.length
    if (startsWith(items[at], wanted)) {
      return at
    }
  }

  return -1
}
