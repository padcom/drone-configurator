// The Flight data layout, kept between runs: one `ui` entry of the settings, `layout.flightData`, holding the sizes of the
// splits, the sizes a collapsed pane opens at, and the tab of the details. A pane is collapsed when its split is at an end,
// so the sizes say which are. What is stored is not trusted (a person can edit the settings file, and another version
// wrote older ones): anything that does not read as a layout of this version leaves the screen on its defaults, and the
// next change replaces it.
import { onScopeDispose, watch } from 'vue'
import { type FlightLayout, type KeptLayout, MAX, MIN } from './flightLayout'
import type { SettingsModel } from './useSettings'

/** The key of the entry in the settings. */
export const LAYOUT_KEY = 'layout.flightData'

/** The version of what is written (a layout of another version is not read). */
const VERSION = 1

/** The longest name of a tab that is read. */
const MAX_TAB = 64

/** How long after the last change the layout is kept: a bar being dragged changes it many times a second. */
export const SAVE_DELAY_MS = 400

/**
 * The text that keeps a layout.
 *
 * @param kept the layout
 * @returns JSON
 */
export function encodeLayout(kept: KeptLayout): string {
  return JSON.stringify({ version: VERSION, main: kept.main, side: kept.side, tab: kept.tab, reopen: kept.reopen })
}

/**
 * Whether a value is a plain object.
 *
 * @param value anything
 * @returns true for an object that is not an array or null
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a number is between the smallest and the largest size (NaN is not).
 *
 * @param size the number
 * @param ends true when the smallest and the largest themselves are in
 * @returns true when it is
 */
function isBetween(size: number, ends: boolean): boolean {
  return ends ? size >= MIN && size <= MAX : size > MIN && size < MAX
}

/**
 * Whether a value is a size between the ends (a pane opened at it is something besides its header).
 *
 * @param value anything
 * @param inside true for a size strictly between the ends, false to allow the ends
 * @returns true for such a number
 */
function isSize(value: unknown, inside: boolean): value is number {
  return typeof value === 'number' && isBetween(value, !inside)
}

/**
 * The sizes a collapsed pane opens at, if they are as they must be.
 *
 * @param value what was stored
 * @returns the sizes, or null
 */
function reopenOf(value: unknown): KeptLayout['reopen'] | null {
  return isRecord(value) && isSize(value.main, true) && isSize(value.side, true) ? { main: value.main, side: value.side } : null
}

/**
 * Whether a value is the name of a tab.
 *
 * @param value anything
 * @returns true for a short, non-empty text
 */
function isTab(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TAB
}

/**
 * The JSON in a text, or nothing.
 *
 * @param text what was stored
 * @returns the value, or undefined when it is not JSON
 */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * The sizes of the two splits, if they are as they must be.
 *
 * @param value what was stored
 * @returns the sizes, or null
 */
function sizesOf(value: Record<string, unknown>): { main: number, side: number } | null {
  return isSize(value.main, false) && isSize(value.side, false) ? { main: value.main, side: value.side } : null
}

/**
 * The layout in an object that has the right version, if all of it is as it must be.
 *
 * @param value what was stored
 * @returns the layout, or null
 */
function assembled(value: Record<string, unknown>): KeptLayout | null {
  const sizes = sizesOf(value)
  const reopen = reopenOf(value.reopen)

  return sizes && reopen && isTab(value.tab) ? { ...sizes, tab: value.tab, reopen } : null
}

/**
 * The layout that a stored text keeps.
 *
 * @param text what the settings hold under the layout's key, if anything
 * @returns the layout, or null when there is none or it is not one this version reads (the screen then starts on its defaults)
 */
export function decodeLayout(text: string | undefined): KeptLayout | null {
  const value = text === undefined ? undefined : parsed(text)

  return isRecord(value) && value.version === VERSION ? assembled(value) : null
}

/**
 * Writes the layout to the settings, unless that is what they hold already.
 *
 * @param layout the layout of the screen
 * @param settings the settings
 */
function keepLayout(layout: FlightLayout, settings: SettingsModel): void {
  const text = encodeLayout(layout.kept())
  if (text !== settings.uiValue(LAYOUT_KEY)) {
    void settings.setUi(LAYOUT_KEY, text)
  }
}

/**
 * Keeps the layout of a screen in the settings, and puts back what was kept. Once the settings have been read the stored
 * layout, if it is a good one, is put in place; from then on every change is kept, a moment after the last one (and not at
 * all when it is what is stored already). Nothing is kept before the settings are read: the defaults must not replace
 * what is there.
 *
 * @param layout the layout of the screen
 * @param settings the settings
 * @param delayMs how long after a change the layout is kept
 */
export function useKeptLayout(layout: FlightLayout, settings: SettingsModel, delayMs = SAVE_DELAY_MS): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let keeping = false

  // Once, when the settings have been read: the stored layout is put in place, and keeping begins.
  const putBack = (loaded: boolean) => {
    if (!loaded || keeping) {
      return
    }
    const kept = decodeLayout(settings.uiValue(LAYOUT_KEY))
    if (kept) {
      layout.restore(kept)
    }
    keeping = true
  }

  watch(settings.loaded, putBack, { immediate: true, flush: 'sync' })

  // Synchronously, so that putting the stored layout in place (which changes the sizes) is over before keeping begins.
  watch(() => layout.kept(), () => {
    if (keeping) {
      clearTimeout(timer)
      timer = setTimeout(() => keepLayout(layout, settings), delayMs)
    }
  }, { flush: 'sync' })

  onScopeDispose(() => clearTimeout(timer))
}
