// Which rows of a long list are drawn, from plain numbers (no DOM): the ones in view and a few more on each side, so that a
// fast scroll does not show an empty table before the next frame. Where the height of the scroll box is not known (it is not
// laid out, as in a test, or it was hidden) a screenful that is more than enough is assumed.

/** How many rows are drawn above and below what is in view. */
export const OVERSCAN = 12

/** The rows drawn when the box has no height yet: more than a screen. */
export const FALLBACK_ROWS = 40

/** Where the scroll box is, for the keys that move through the rows. */
export interface Viewport {
  /** How far the box is scrolled (px). */
  scrolled: number
  /** How tall the box is (px). */
  height: number
  /** The height of the header, which stays at the top over the rows (px). */
  header: number
  /** The height of a row (px). */
  rowPx: number
}

/**
 * How many rows a page is: the ones that are fully in view, and at least one.
 *
 * @param view the scroll box
 * @returns the number of rows
 */
export function pageRows(view: Viewport): number {
  return Math.max(1, Math.floor((view.height - view.header) / view.rowPx))
}

/**
 * The row a key moves the selection to.
 *
 * @param key the key
 * @param at the index of the selected row (-1: none)
 * @param count how many rows there are
 * @param page how many rows a page is
 * @returns the index of the row to select, or -1 for a key that moves nothing (or when there are no rows)
 */
export function movedRow(key: string, at: number, count: number, page: number): number {
  const last = count - 1
  const targets: Record<string, number> = {
    ArrowDown: at + 1,
    ArrowUp: at - 1,
    PageDown: at + page,
    PageUp: at - page,
    Home: 0,
    End: last,
  }
  const target = targets[key]

  return target === undefined || count === 0 ? -1 : Math.min(last, Math.max(0, target))
}

/**
 * Where to scroll so that a row is in view (the header covers the top of the box): not at all when it is, else just far
 * enough.
 *
 * @param index the index of the row
 * @param view the scroll box
 * @returns the new scroll position (px)
 */
export function scrollToRow(index: number, view: Viewport): number {
  const top = index * view.rowPx
  const bottom = top + view.rowPx
  if (top < view.scrolled) {
    return top
  }

  return bottom > view.scrolled + view.height - view.header ? bottom - (view.height - view.header) : view.scrolled
}

/** The rows that are drawn: from the first to one past the last. */
export interface RowWindow {
  /** The index of the first row that is drawn. */
  from: number
  /** The index one past the last row that is drawn. */
  to: number
}

/**
 * The rows to draw.
 *
 * @param count how many rows the list has
 * @param scrolled how far the scroll box is scrolled (px)
 * @param height how tall the scroll box is (px; 0 when it is not known)
 * @param rowPx the height of a row (px)
 * @returns the first row and one past the last
 */
export function windowOf(count: number, scrolled: number, height: number, rowPx: number): RowWindow {
  const inView = height > 0 ? Math.ceil(height / rowPx) + 1 : FALLBACK_ROWS
  const from = Math.max(0, Math.floor(scrolled / rowPx) - OVERSCAN)

  return { from: Math.min(from, count), to: Math.min(count, from + inView + 2 * OVERSCAN) }
}
