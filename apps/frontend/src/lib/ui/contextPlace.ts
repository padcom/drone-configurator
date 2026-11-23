// Where a context menu is drawn, from plain numbers: at the point it was asked for, moved just far enough to stay in the window.

/** The least space left between a menu and the edge of the window (px). */
export const EDGE_PX = 8

/** A point in the window (px). */
export interface Point {
  /** From the left edge. */
  x: number
  /** From the top edge. */
  y: number
}

/** A size (px). */
export interface Size {
  /** The width. */
  width: number
  /** The height. */
  height: number
}

/**
 * Where one side of the menu starts: at the point, or earlier when the menu would pass the far edge, but never before the near.
 *
 * @param start where it was asked for
 * @param length how long the menu is on this side
 * @param room how long the window is on this side
 * @param margin the least space left at an edge
 * @returns where the menu starts
 */
function fit(start: number, length: number, room: number, margin: number): number {
  return Math.max(margin, Math.min(start, room - margin - length))
}

/**
 * The corner of a menu that is asked for at a point.
 *
 * @param at the point
 * @param size how big the menu is
 * @param view how big the window is
 * @param margin the least space left at an edge
 * @returns the left and the top of the menu
 */
export function placed(at: Point, size: Size, view: Size, margin: number = EDGE_PX): { left: number, top: number } {
  return { left: fit(at.x, size.width, view.width, margin), top: fit(at.y, size.height, view.height, margin) }
}

/**
 * The point a menu is asked for by the keyboard: the lower left of the element that has the focus (the pointer is not there).
 *
 * @param rect the element's box
 * @param rect.left its left edge
 * @param rect.bottom its lower edge
 * @returns the point
 */
export function belowLeftOf(rect: { left: number, bottom: number }): Point {
  return { x: rect.left, y: rect.bottom }
}
