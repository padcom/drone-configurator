// Where the pad is read from (plan `drone-configurator-joystick-backend.md`, sections 3 and 5, story F1): the browser's Gamepad
// API, or the backend (`pad.*`, Linux evdev: all of a radio's axes, at once, before any input). The person chooses `auto`,
// `backend` or `browser`; `browser` is the default until the leader has confirmed the backend's pad on hardware. `auto` is the
// backend when it says it has a pad backend on this platform (`supported`), else the browser. These are the pure parts: which
// source, which pad of the list, and a backend sample shaped as the browser's `Gamepad`, so that everything above the reader
// (the mapping, the gates, "move it") sees no difference between the two.
import type { PadInfo, PadList, PadSample } from '@/generated/app'
import type { PadLike } from './reader'

/** What the person chooses. */
export type PadSourceChoice = 'auto' | 'backend' | 'browser'

/** The source that is used. */
export type PadSource = 'backend' | 'browser'

/** The default: the browser's, until the leader has confirmed the backend's pad on hardware. */
export const DEFAULT_PAD_SOURCE: PadSourceChoice = 'browser'

/** A backend sample older than this (ms, by the page's own clock, at the time it was received) is no sample: silence is a gap. */
export const STALE_MS = 100

/**
 * What the settings say of the source.
 *
 * @param text the settings' text
 * @returns the choice; the default for anything that is not one
 */
export function parseSource(text: string | undefined): PadSourceChoice {
  return text === 'auto' || text === 'backend' || text === 'browser' ? text : DEFAULT_PAD_SOURCE
}

/**
 * Which source is used.
 *
 * @param choice what the person chose
 * @param list what the backend said of its pads, or null while it has not
 * @returns the source: `auto` is the backend only when it said it supports pads here
 */
export function sourceOf(choice: PadSourceChoice, list: PadList | null): PadSource {
  if (choice === 'auto') {
    return list?.supported === true ? 'backend' : 'browser'
  }

  return choice
}

/**
 * Which pad of the list is read: the one the person chose when it is there, else the first.
 *
 * @param list what the backend said of its pads, or null
 * @param chosen the id of the pad the person chose, or ''
 * @returns the pad, or null when there is none
 */
export function padOfList(list: PadList | null, chosen: string): PadInfo | null {
  const pads = list === null ? [] : list.pads

  return pads.find(pad => pad.id === chosen) ?? pads[0] ?? null
}

/**
 * The pad the way the browser's `Gamepad` shows it: the axes, then the buttons (CH1 is the first axis). A channel's -1 to 1 is an
 * axis' value, and a button's 0 to 1 is `(value + 1) / 2`, so that the reader reads the same number back.
 *
 * @param info what the backend says of the pad
 * @param sample what it read
 * @returns the pad
 */
export function padLikeOf(info: PadInfo, sample: PadSample): PadLike {
  const axes: number[] = []
  const buttons: { value: number }[] = []

  info.channels.forEach(channel => {
    const value = sample.channels[channel.n - 1] ?? 0

    if (channel.from === 'axis') {
      axes.push(value)
    } else {
      buttons.push({ value: (value + 1) / 2 })
    }
  })

  return { id: info.id, legacyId: info.legacyId, index: 0, connected: true, axes, buttons }
}
