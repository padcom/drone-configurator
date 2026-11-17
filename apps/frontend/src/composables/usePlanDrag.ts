// A pin dragged on the Plan page's map, or a line of the route dragged to put a new waypoint on it. While the pointer is down
// only the picture moves (the plan is not touched, so the route follows without a history of its own); the release is ONE edit,
// and a press that did not move is a click, which is not a drag and does nothing here. Escape or a cancelled pointer drops it.
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import type { Point } from '@/lib/map/geo'

/** How far (px) the pointer may go before the press is a drag and not a click. */
export const DRAG_PX = 4

/** The screen distance (px) of a nudge with Shift and an arrow, and with Alt as well (a pixel: to place a pin exactly). */
export const NUDGE_PX = 10

/** The same, with Alt. */
export const NUDGE_FINE_PX = 1

/** Which way each arrow nudges (a unit step on the screen). */
const DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

/**
 * Whether a key has the modifiers of a nudge: Shift, and neither Control nor the system's key (Alt makes it a fine one).
 *
 * @param event the key event
 * @returns true when it has
 */
function hasNudgeModifiers(event: KeyboardEvent): boolean {
  return event.shiftKey && !event.ctrlKey && !event.metaKey
}

/**
 * How far a key nudges a pin on the screen: Shift and an arrow (with Alt a pixel, without it ten); no other key does.
 *
 * @param event the key event
 * @returns the shift in pixels, or null when the key is not a nudge
 */
export function nudgeOf(event: KeyboardEvent): Point | null {
  const way = DIRECTIONS[event.key]
  if (!way || !hasNudgeModifiers(event)) {
    return null
  }
  const by = event.altKey ? NUDGE_FINE_PX : NUDGE_PX

  return { x: way.x * by, y: way.y * by }
}

/** What is being dragged. */
export interface Drag {
  /** `move`: a pin; `insert`: a line of the route, and `id` is the item the line leaves from. */
  kind: 'move' | 'insert'
  /** The item (the pin, or the one the line leaves from). */
  id: number
  /** The pointer that holds it. */
  pointerId: number
  /** Where it went down. */
  from: Point
  /** Where it is now. */
  at: Point
  /** Whether it went further than a click. */
  moved: boolean
}

/** What the drag needs of the page. */
export interface DragEnv {
  /** Where a pointer event is on the map (px from its top left). */
  pointOf(event: PointerEvent): Point
  /** The place under a point of the map. */
  placeAt(point: Point): { lat: number, lon: number }
  /** A pin was let go somewhere else. */
  moved(id: number, place: { lat: number, lon: number }): void
  /** A line was let go: a new waypoint goes there, after the item the line leaves from. */
  inserted(afterId: number, place: { lat: number, lon: number }): void
}

/** The drag of the page. */
export interface PlanDrag {
  /** What is being dragged, or null. */
  readonly drag: Readonly<ShallowRef<Drag | null>>
  /** The pin that is being dragged and has gone further than a click (it is drawn under the pointer), or null. */
  readonly moving: ComputedRef<Drag | null>
  /** The line that is being dragged and has gone further than a click (a new waypoint is drawn under the pointer), or null. */
  readonly inserting: ComputedRef<Drag | null>
  /** The pointer went down on a pin or a line. */
  begin(event: PointerEvent, kind: Drag['kind'], id: number): void
  /** The pointer moved. */
  move(event: PointerEvent): void
  /** The pointer went up: the drag ends where it is. */
  end(event: PointerEvent): void
  /** The pointer was taken away, or Escape: the drag is dropped, and nothing changes. */
  cancel(): void
}

/**
 * Whether a pointer that went down begins a drag: the main button of the first pointer.
 *
 * @param event the pointer event
 * @returns true when it does
 */
function startsDrag(event: PointerEvent): boolean {
  return event.isPrimary && event.button === 0
}

/** The drag of the pins and lines of the plan. */
class PinDrag implements PlanDrag {
  readonly drag = shallowRef<Drag | null>(null)

  readonly moving = computed(() => this.ofKind('move'))

  readonly inserting = computed(() => this.ofKind('insert'))

  /**
   * Makes the drag.
   *
   * @param env what it needs of the page
   */
  constructor(private readonly env: DragEnv) {}

  /**
   * The drag, when it is of a kind and has gone further than a click.
   *
   * @param kind the kind
   * @returns the drag, or null
   */
  private ofKind(kind: Drag['kind']): Drag | null {
    const held = this.drag.value

    return held?.moved && held.kind === kind ? held : null
  }

  /**
   * The drag of a pointer, when it is the one that holds it.
   *
   * @param event the pointer event
   * @returns the drag, or null
   */
  private heldBy(event: PointerEvent): Drag | null {
    return this.drag.value?.pointerId === event.pointerId ? this.drag.value : null
  }

  begin(event: PointerEvent, kind: Drag['kind'], id: number): void {
    if (startsDrag(event)) {
      const from = this.env.pointOf(event)
      const target = event.currentTarget as Element | null

      this.drag.value = { kind, id, pointerId: event.pointerId, from, at: from, moved: false }
      target?.setPointerCapture?.(event.pointerId)
    }
  }

  move(event: PointerEvent): void {
    const held = this.heldBy(event)
    if (held) {
      const at = this.env.pointOf(event)

      this.drag.value = { ...held, at, moved: held.moved || Math.hypot(at.x - held.from.x, at.y - held.from.y) > DRAG_PX }
    }
  }

  end(event: PointerEvent): void {
    const held = this.heldBy(event)
    this.drag.value = null

    if (held?.moved) {
      const place = this.env.placeAt(held.at)

      if (held.kind === 'move') {
        this.env.moved(held.id, place)
      } else {
        this.env.inserted(held.id, place)
      }
    }
  }

  cancel(): void {
    this.drag.value = null
  }
}

/**
 * The drag of the pins and lines of the plan.
 *
 * @param env what it needs of the page
 * @returns the drag and what drives it
 */
export function usePlanDrag(env: DragEnv): PlanDrag {
  return new PinDrag(env)
}
