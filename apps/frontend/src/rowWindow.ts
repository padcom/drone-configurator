// Which rows of a long list are drawn, from plain numbers (no DOM): the ones in view and a few more on each side, so that a
// fast scroll does not show an empty table before the next frame. Where the height of the scroll box is not known (it is not
// laid out, as in a test, or it was hidden) a screenful that is more than enough is assumed.

/** How many rows are drawn above and below what is in view. */
export const OVERSCAN = 12

/** The rows drawn when the box has no height yet: more than a screen. */
export const FALLBACK_ROWS = 40

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
