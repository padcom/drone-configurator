// Where the pad is read from: the choice, which source `auto` is, which pad of the list is read, and a backend sample shaped as
// the browser's `Gamepad` (and read back by the reader as the same numbers).
import { describe, expect, it } from 'vitest'
import type { PadInfo, PadList, PadSample } from '@/generated/app'
import { DEFAULT_PAD_SOURCE, padLikeOf, padOfList, parseSource, sourceOf } from './padsource'
import { layoutOf, sampleOf } from './reader'

/**
 * A pad as the backend lists it.
 *
 * @param id its id
 * @param axes how many axes
 * @param buttons how many buttons
 * @returns the pad
 */
function info(id: string, axes: number, buttons: number): PadInfo {
  const channels = Array.from({ length: axes + buttons }, (_, i) => (
    { n: i + 1, from: i < axes ? 'axis' as const : 'button' as const, code: i }
  ))

  return { id, legacyId: `legacy ${id}`, name: id, vendor: 1, product: 2, source: 'evdev', channels }
}

/**
 * A list of pads.
 *
 * @param supported whether the backend has a pad backend here
 * @param pads the pads
 * @returns the list
 */
function listOf(supported: boolean, ...pads: PadInfo[]): PadList {
  return { supported, pads, denied: [] }
}

describe('the choice', () => {
  it('is what the settings say, and the browser\'s for anything else', () => {
    expect(['auto', 'backend', 'browser'].map(parseSource)).toEqual(['auto', 'backend', 'browser'])
    expect([undefined, '', 'Backend', 'on'].map(parseSource)).toEqual(Array.from({ length: 4 }, () => DEFAULT_PAD_SOURCE))
    expect(DEFAULT_PAD_SOURCE).toBe('browser')
  })

  it('makes `auto` the backend only when it said it supports pads here', () => {
    expect(sourceOf('auto', null)).toBe('browser')
    expect(sourceOf('auto', listOf(false))).toBe('browser')
    expect(sourceOf('auto', listOf(true))).toBe('backend')
    expect(sourceOf('backend', listOf(false))).toBe('backend')
    expect(sourceOf('browser', listOf(true))).toBe('browser')
  })
})

describe('which pad of the list is read', () => {
  it('is the one chosen when it is there, else the first, else none', () => {
    const list = listOf(true, info('a', 2, 0), info('b', 2, 0))

    expect(padOfList(list, 'b')?.id).toBe('b')
    expect(padOfList(list, 'gone')?.id).toBe('a')
    expect(padOfList(list, '')?.id).toBe('a')
    expect(padOfList(listOf(true), 'a')).toBeNull()
    expect(padOfList(null, 'a')).toBeNull()
  })
})

describe('a sample of the backend as the browser\'s pad', () => {
  const sample = (channels: number[]): PadSample => {
    const rest = Array.from({ length: 16 - channels.length }, () => 0)

    return { seq: 1, at: 1, channels: [...channels, ...rest], have: 0xff }
  }

  it('has the axes, then the buttons, which the reader turns back to the same channels', () => {
    const pad = padLikeOf(info('a', 3, 2), sample([0.5, -0.25, 1, -1, 1]))

    expect(pad.axes).toEqual([0.5, -0.25, 1])
    expect(pad.buttons.map(button => button.value)).toEqual([0, 1])
    expect(sampleOf(pad).channels.slice(0, 5)).toEqual([0.5, -0.25, 1, -1, 1])
    expect(layoutOf(pad).slice(0, 6)).toEqual(['axis', 'axis', 'axis', 'button', 'button', null])
  })

  it('carries the id and the browser\'s name for the pad, where a mapping kept by the old name is found', () => {
    const pad = padLikeOf(info('a', 1, 0), sample([0]))

    expect([pad.id, pad.legacyId, pad.connected, pad.index]).toEqual(['a', 'legacy a', true, 0])
  })
})
