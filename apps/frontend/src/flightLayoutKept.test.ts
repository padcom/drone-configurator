import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { DEFAULT_MAIN, DEFAULT_SIDE, MAX, MIN, type KeptLayout, useFlightLayout } from './flightLayout'
import { LAYOUT_KEY, SAVE_DELAY_MS, decodeLayout, encodeLayout, useKeptLayout } from './flightLayoutKept'
import type { SettingsModel } from './useSettings'

const KEPT: KeptLayout = { main: 72, side: 30, tab: 'telemetry', reopen: { main: 72, side: 30 } }

/**
 * The text of a stored layout with some members changed.
 *
 * @param changes what to change, or remove (undefined)
 * @returns JSON
 */
function stored(changes: Record<string, unknown> = {}): string {
  const doc: Record<string, unknown> = { version: 1, ...KEPT, ...changes }
  for (const [name, value] of Object.entries(doc)) {
    if (value === undefined) {
      delete doc[name]
    }
  }

  return JSON.stringify(doc)
}

describe('the stored layout', () => {
  it('is read back as it was kept', () => {
    expect(decodeLayout(encodeLayout(KEPT))).toEqual(KEPT)
  })

  it('may have a pane collapsed: the sizes at the ends are fine, with the sizes to open at inside them', () => {
    const collapsed: KeptLayout = { main: MIN, side: MAX, tab: 'telemetry', reopen: { main: 72, side: 30 } }

    expect(decodeLayout(encodeLayout(collapsed))).toEqual(collapsed)
  })
})

describe('the stored layout, when it is not a good one', () => {
  it.each([
    ['nothing', undefined],
    ['an empty text', ''],
    ['text that is not JSON', 'not json'],
    ['an array', '[1, 2]'],
    ['null', 'null'],
    ['an empty object', '{}'],
    ['another version', stored({ version: 2 })],
    ['no version', stored({ version: undefined })],
    ['a size that is not a number', stored({ main: '70' })],
    ['a size below the smallest', stored({ main: MIN - 1 })],
    ['a size above the largest', stored({ side: MAX + 1 })],
    ['a size that is null', stored({ side: null })],
    ['no sizes to open at', stored({ reopen: undefined })],
    ['sizes to open at that are an end', stored({ reopen: { main: MIN, side: 30 } })],
    ['sizes to open at that are not numbers', stored({ reopen: { main: 'a', side: 30 } })],
    ['no tab', stored({ tab: undefined })],
    ['an empty tab', stored({ tab: '' })],
    ['a tab that is a number', stored({ tab: 3 })],
    ['a tab with a very long name', stored({ tab: 'x'.repeat(65) })],
  ])('is not read when it is %s: the screen keeps its defaults', (_what, text) => {
    expect(decodeLayout(text)).toBeNull()
  })
})

describe('the layout, as it is kept and put back', () => {
  it('says its sizes, its tab and the sizes to open at', () => {
    const layout = useFlightLayout()
    layout.main.value = 72

    expect(layout.kept()).toEqual({ main: 72, side: DEFAULT_SIDE, tab: 'telemetry', reopen: { main: 72, side: DEFAULT_SIDE } })
  })

  it('is put back with its sizes to open at, after the sizes that were set', () => {
    const layout = useFlightLayout()

    layout.restore({ main: MIN, side: 30, tab: 'values', reopen: { main: 75, side: 30 } })
    expect([layout.isCollapsed('map'), layout.tab.value]).toEqual([true, 'values'])
    layout.toggle('map')

    expect(layout.main.value).toBe(75)
  })
})

/**
 * Settings that hold a text under the layout's key, and record what is kept.
 *
 * @param text what is stored at first
 * @param loaded whether they have been read
 * @returns the settings, and a way to read what is stored
 */
function settingsHolding(text: string | undefined, loaded = true) {
  let held = text
  const flag = shallowRef(loaded)
  const setUi = vi.fn((key: string, value: string) => {
    held = value

    return Promise.resolve()
  })
  const uiValue = (key: string) => key === LAYOUT_KEY ? held : undefined
  const settings = { loaded: flag, uiValue, setUi } as unknown as SettingsModel

  return { settings, flag, setUi, held: () => held }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('putting back what was kept', () => {
  it('puts the stored layout in place once the settings have been read, and not before', () => {
    const { settings, flag } = settingsHolding(encodeLayout(KEPT), false)
    const layout = useFlightLayout()
    effectScope().run(() => useKeptLayout(layout, settings))

    expect(layout.main.value).toBe(DEFAULT_MAIN)
    flag.value = true

    expect(layout.kept()).toEqual(KEPT)
  })

  it('leaves the defaults when what is stored is not a layout this version reads', () => {
    const { settings } = settingsHolding('{"version": 9}')
    const layout = useFlightLayout()

    effectScope().run(() => useKeptLayout(layout, settings))

    expect([layout.main.value, layout.side.value]).toEqual([DEFAULT_MAIN, DEFAULT_SIDE])
  })

  it('does not write what it has just put in place', () => {
    const { settings, setUi } = settingsHolding(encodeLayout(KEPT))
    effectScope().run(() => useKeptLayout(useFlightLayout(), settings))

    vi.advanceTimersByTime(SAVE_DELAY_MS * 3)

    expect(setUi).not.toHaveBeenCalled()
  })
})

describe('keeping the layout, before the settings are read', () => {
  it('writes nothing, whatever changes: the defaults must not replace what is there', () => {
    const { settings, setUi } = settingsHolding(undefined, false)
    const layout = useFlightLayout()
    effectScope().run(() => useKeptLayout(layout, settings))

    layout.main.value = 80
    vi.advanceTimersByTime(SAVE_DELAY_MS * 3)

    expect(setUi).not.toHaveBeenCalled()
  })
})

describe('keeping the layout', () => {
  it('writes once, a moment after the last of many changes (a bar being dragged)', () => {
    const { settings, setUi } = settingsHolding(undefined)
    const layout = useFlightLayout()
    effectScope().run(() => useKeptLayout(layout, settings))

    for (const size of [61, 62, 63, 64]) {
      layout.main.value = size
      vi.advanceTimersByTime(SAVE_DELAY_MS / 2)
    }
    expect(setUi).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SAVE_DELAY_MS)

    expect(setUi).toHaveBeenCalledOnce()
    expect(decodeLayout(setUi.mock.calls[0]![1])?.main).toBe(64)
  })
})

describe('keeping the layout, over what is stored', () => {
  it('replaces a stored layout that is not a good one with the first change', () => {
    const { settings, setUi, held } = settingsHolding('rubbish')
    const layout = useFlightLayout()
    effectScope().run(() => useKeptLayout(layout, settings))

    layout.side.value = 20
    vi.advanceTimersByTime(SAVE_DELAY_MS)

    expect(setUi).toHaveBeenCalledWith(LAYOUT_KEY, expect.any(String))
    expect(decodeLayout(held())?.side).toBe(20)
  })
})

describe('a change that is waiting when the screen or the page goes', () => {
  it('is written at once when the screen goes, and only once', () => {
    const { settings, setUi } = settingsHolding(undefined)
    const layout = useFlightLayout()
    const scope = effectScope()
    scope.run(() => useKeptLayout(layout, settings))

    layout.main.value = 80
    scope.stop()
    vi.advanceTimersByTime(SAVE_DELAY_MS * 2)

    expect(setUi).toHaveBeenCalledOnce()
    expect(decodeLayout(setUi.mock.calls[0]![1])?.main).toBe(80)
  })
})

describe('a change that is waiting when the page goes', () => {
  it('is written at once when the page is being closed (pagehide), and only once', () => {
    const { settings, setUi } = settingsHolding(undefined)
    const layout = useFlightLayout()
    const scope = effectScope()
    scope.run(() => useKeptLayout(layout, settings))

    layout.side.value = 25
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    scope.stop()

    expect(setUi).toHaveBeenCalledOnce()
    expect(decodeLayout(setUi.mock.calls[0]![1])?.side).toBe(25)
  })
})

describe('nothing waiting, or a screen that has gone, when the page goes', () => {
  it('writes nothing when nothing is waiting', () => {
    const { settings, setUi } = settingsHolding(undefined)
    const scope = effectScope()
    scope.run(() => useKeptLayout(useFlightLayout(), settings))

    window.dispatchEvent(new Event('pagehide'))
    scope.stop()

    expect(setUi).not.toHaveBeenCalled()
  })

  it('does not listen to the page any more once the screen has gone', () => {
    const { settings, setUi } = settingsHolding(undefined)
    const layout = useFlightLayout()
    const scope = effectScope()
    scope.run(() => useKeptLayout(layout, settings))
    scope.stop()

    layout.main.value = 80
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(SAVE_DELAY_MS * 2)

    expect(setUi).not.toHaveBeenCalled()
  })
})

describe('a layout with a pane collapsed, kept and put back', () => {
  it('has the pane collapsed at the next start, and opens it at the size it had before', () => {
    const first = settingsHolding(undefined)
    const layout = useFlightLayout()
    effectScope().run(() => useKeptLayout(layout, first.settings))
    layout.main.value = 75
    layout.toggle('map')
    vi.advanceTimersByTime(SAVE_DELAY_MS)

    const next = settingsHolding(first.held())
    const restarted = useFlightLayout()
    effectScope().run(() => useKeptLayout(restarted, next.settings))

    expect(restarted.isCollapsed('map')).toBe(true)
    restarted.toggle('map')
    expect(restarted.main.value).toBe(75)
  })
})
