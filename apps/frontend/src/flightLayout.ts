// The layout of the Flight data screen: a map pane on one side, and on the other a heads-up display pane over a pane of
// details. Two splits hold it: `main` (the map's share of the width, in percent) and `side` (the display's share of the
// height of the other side). A pane is collapsed when its split is at the end that leaves it only its header, so the sizes
// are all there is to keep (the next step keeps them across a restart), and a pane dragged shut is the same as one
// collapsed with its button.
import { type Ref, ref, watch } from 'vue'

/** A pane of the screen. */
export type Pane = 'map' | 'hud' | 'detail'

/** The smallest share a pane's split may give it (percent): about a header's worth, so that it can still be opened. */
export const MIN = 5

/** The largest share (percent). */
export const MAX = 95

/** The map's share of the width a screen starts with (percent). */
export const DEFAULT_MAIN = 60

/** The display's share of the height of the side a screen starts with (percent). */
export const DEFAULT_SIDE = 40

/** What a layout starts from. */
export interface FlightLayoutStart {
  /** The map's share of the width. */
  main: number
  /** The display's share of the height. */
  side: number
  /** The tab of the details. */
  tab: string
}

const DEFAULTS: FlightLayoutStart = { main: DEFAULT_MAIN, side: DEFAULT_SIDE, tab: 'telemetry' }

/**
 * A layout in full: what is kept between runs. The sizes to open at are part of it, so that a pane collapsed when the app
 * closed opens as it would have.
 */
export interface KeptLayout extends FlightLayoutStart {
  /** The sizes the splits open at when a collapsed pane is opened. */
  reopen: { main: number, side: number }
}

/** The layout, and what changes it. */
export interface FlightLayout {
  /** The map's share of the width (percent). */
  readonly main: Ref<number>
  /** The heads-up display's share of the height of the side (percent). */
  readonly side: Ref<number>
  /** The tab of the details pane that is shown. */
  readonly tab: Ref<string>
  /** Whether a pane is collapsed to its header. */
  isCollapsed: (pane: Pane) => boolean
  /** Collapses a pane, or opens it again at the size it had. Of the display and the details, only one is collapsed at a time. */
  toggle: (pane: Pane) => void
  /** The layout as it is, to be kept. */
  kept: () => KeptLayout
  /** Puts a layout that was kept in place. */
  restore: (kept: KeptLayout) => void
}

/**
 * Whether a size leaves a pane something besides its header.
 *
 * @param size a split's size (percent)
 * @returns true when it is neither end
 */
function isOpen(size: number): boolean {
  return size > MIN && size < MAX
}

/**
 * A size to go back to: the one given if it is open, else the default.
 *
 * @param size a split's size
 * @param fallback the default
 * @returns the size to open at
 */
function opened(size: number, fallback: number): number {
  return isOpen(size) ? size : fallback
}

class FlightLayoutModel implements FlightLayout {
  readonly main: Ref<number>
  readonly side: Ref<number>
  readonly tab: Ref<string>
  /** The sizes to go back to when a collapsed pane is opened (a pane that starts collapsed opens at the defaults). */
  private readonly before: { main: number, side: number }

  /**
   * Makes a layout.
   *
   * @param start the sizes and the tab to start with (what was kept; the defaults for what is not given)
   */
  constructor(start: Partial<FlightLayoutStart> = {}) {
    const from = { ...DEFAULTS, ...start }
    this.main = ref(from.main)
    this.side = ref(from.side)
    this.tab = ref(from.tab)
    this.before = { main: opened(from.main, DEFAULT_MAIN), side: opened(from.side, DEFAULT_SIDE) }
    // Every size that leaves a pane something is the one to go back to, however it was reached (a bar dragged, a key, a
    // button), so that a pane shut by the bar opens at the size it had just before.
    this.remember(this.main, 'main')
    this.remember(this.side, 'side')
  }

  /**
   * Keeps the last size of a split that is open, as the one to open it at.
   *
   * @param size the split's size
   * @param key which split
   */
  private remember(size: Ref<number>, key: 'main' | 'side'): void {
    watch(size, next => {
      if (isOpen(next)) {
        this.before[key] = next
      }
    }, { flush: 'sync' })
  }

  kept(): KeptLayout {
    return { main: this.main.value, side: this.side.value, tab: this.tab.value, reopen: { ...this.before } }
  }

  restore(kept: KeptLayout): void {
    this.main.value = kept.main
    this.side.value = kept.side
    this.tab.value = kept.tab
    // After the sizes: setting them records the open ones, and what was kept says what to open at.
    this.before.main = kept.reopen.main
    this.before.side = kept.reopen.side
  }

  /**
   * Whether the map takes all but a header's worth of the width: what is beside it is then no more than a header, whatever
   * its own split says, and the way to open it is to give the map back some of the width.
   *
   * @returns true when the map's split is at its largest
   */
  private mapTakesAll(): boolean {
    return this.main.value >= MAX
  }

  isCollapsed(pane: Pane): boolean {
    const collapsed: Record<Pane, boolean> = {
      map: this.main.value <= MIN,
      hud: this.side.value <= MIN || this.mapTakesAll(),
      detail: this.side.value >= MAX || this.mapTakesAll(),
    }

    return collapsed[pane]
  }

  toggle(pane: Pane): void {
    if (pane === 'map') {
      this.flip(this.main, 'main', MIN)
    } else if (this.mapTakesAll()) {
      this.main.value = this.before.main
    } else {
      this.flip(this.side, 'side', pane === 'hud' ? MIN : MAX)
    }
  }

  /**
   * Opens a split that is collapsed to the end `to` at the size it had, or collapses it to that end.
   *
   * @param size the split's size
   * @param key which split
   * @param to the size that collapses the pane
   */
  private flip(size: Ref<number>, key: 'main' | 'side', to: number): void {
    size.value = size.value === to ? this.before[key] : to
  }
}

/**
 * The layout of a Flight data screen.
 *
 * @param start the sizes and the tab to start with (what was kept; the defaults for what is not given)
 * @returns the sizes, the tab, and how to collapse and open a pane
 */
export function useFlightLayout(start: Partial<FlightLayoutStart> = {}): FlightLayout {
  return new FlightLayoutModel(start)
}
