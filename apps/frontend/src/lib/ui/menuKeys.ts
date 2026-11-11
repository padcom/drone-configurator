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
  /**
   * Cannot be chosen now: skipped by the keys. It is drawn with the native `disabled` (so it is neither focusable nor
   * clickable), a choice made because the keys never land on it anyway; the reason for it being off belongs in the label.
   */
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
 * How many rows a page is: the ones that fit in the list.
 *
 * @param listHeight the height of the list (px; 0 when it is not laid out)
 * @param rowHeight the height of a row (px; 0 when it is not laid out)
 * @param fallback the rows to use when the list cannot say
 * @returns the rows, at least one
 */
export function rowsFitting(listHeight: number, rowHeight: number, fallback: number): number {
  const fits = rowHeight > 0 ? Math.floor(listHeight / rowHeight) : 0

  return fits > 0 ? fits : fallback
}

/**
 * How many rows a page is, from the list and a row of it as they are laid out.
 *
 * @param list the scrolling list, if there is one
 * @param row a row of it, if there is one
 * @param fallback the rows to use when the list cannot say
 * @returns the rows, at least one
 */
export function rowsPerPage(list: HTMLElement | null | undefined, row: HTMLElement | null | undefined, fallback: number): number {
  return rowsFitting(list ? list.clientHeight : 0, row ? row.offsetHeight : 0, fallback)
}

/**
 * Puts the focus on a row of a list and scrolls the list just far enough to show it (the focus alone may scroll further).
 *
 * @param row the row, if there is one
 */
export function focusAndShow(row: HTMLElement | undefined): void {
  row?.focus({ preventScroll: true })
  row?.scrollIntoView?.({ block: 'nearest' })
}

/**
 * The item a page away (Page Down, Page Up): `page` items on, stopping at the ends (no wrapping), and the nearest item that
 * can be chosen when that one cannot.
 *
 * @param items the items
 * @param from the item the focus is on, or -1 for none
 * @param delta 1 for down, -1 for up
 * @param page how many items a page is
 * @returns its index, or -1 when no item can be chosen
 */
export function pageStep(items: MenuItem[], from: number, delta: 1 | -1, page: number): number {
  const wanted = Math.min(items.length - 1, Math.max(0, from + (delta * page)))
  // The nearest to where a page goes; of two as near, the one nearer to where it started (a page is never more than a page).
  const apart = (a: number, b: number) => Math.abs(a - b)
  const order = [...items.keys()].sort((a, b) => apart(a, wanted) - apart(b, wanted) || apart(a, from) - apart(b, from))

  return order.find(at => !items[at]?.disabled) ?? -1
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
 * item with it; a longer string, "ss", is looked for from the item itself, so that it stays on a label that still fits).
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
