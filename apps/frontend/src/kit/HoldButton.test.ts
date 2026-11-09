import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import HoldButton from './HoldButton.vue'

const HOLD = 1200
const ARM = 400

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A hold button that has been on the page long enough to take presses.
 *
 * @param armMs how long it ignores presses at first
 * @returns the wrapper
 */
function holdButton(armMs = 0): VueWrapper {
  return mount(HoldButton, { props: { holdMs: HOLD, armMs }, slots: { default: 'Hold' }, attachTo: document.body })
}

/**
 * The number of times it has been held long enough.
 *
 * @param wrapper the button
 * @returns the count
 */
const held = (wrapper: VueWrapper) => wrapper.emitted('held')?.length ?? 0

describe('a hold button, held with the pointer', () => {
  it('confirms once, when it has been held long enough', async () => {
    const wrapper = holdButton()

    await wrapper.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD - 1)
    expect(held(wrapper)).toBe(0)
    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(HOLD * 3)

    expect(held(wrapper)).toBe(1)
  })

  it('does nothing when it is let go early, and starts again on the next press', async () => {
    const wrapper = holdButton()

    await wrapper.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD / 2)
    window.dispatchEvent(new Event('pointerup'))
    vi.advanceTimersByTime(HOLD)
    expect(held(wrapper)).toBe(0)
    await wrapper.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD)

    expect(held(wrapper)).toBe(1)
  })
})

describe('a hold button, let go or left', () => {
  it('does nothing when the pointer is let go outside the button, or leaves it', async () => {
    const wrapper = holdButton()

    await wrapper.trigger('pointerdown')
    await wrapper.trigger('pointerleave')
    vi.advanceTimersByTime(HOLD * 2)

    expect(held(wrapper)).toBe(0)
  })

  it('shows the ring filling while it is held, and not otherwise', async () => {
    const wrapper = holdButton()
    expect(wrapper.classes()).not.toContain('holding')

    await wrapper.trigger('pointerdown')
    expect(wrapper.classes()).toContain('holding')
    window.dispatchEvent(new Event('pointerup'))
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).not.toContain('holding')
  })
})

describe('a hold button, pressed the way that must not confirm', () => {
  it('ignores clicks and double clicks', async () => {
    const wrapper = holdButton()

    await wrapper.trigger('click')
    await wrapper.trigger('dblclick')
    vi.advanceTimersByTime(HOLD * 2)

    expect(held(wrapper)).toBe(0)
  })

  it('ignores presses in the first moments after it appears, and takes them after', async () => {
    const wrapper = holdButton(ARM)

    vi.advanceTimersByTime(ARM - 1)
    await wrapper.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD * 2)
    expect(held(wrapper)).toBe(0)
    vi.advanceTimersByTime(1)
    await wrapper.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD)

    expect(held(wrapper)).toBe(1)
  })
})

describe('a hold button, held with the keyboard', () => {
  it.each([' ', 'Enter'])('confirms once when %j is held long enough, though the key repeats', async key => {
    const wrapper = holdButton()

    await wrapper.trigger('keydown', { key })

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(HOLD / 4)
      wrapper.element.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true }))
    }
    vi.advanceTimersByTime(HOLD * 3)

    expect(held(wrapper)).toBe(1)
  })
})

describe('a hold button, with a key that is let go', () => {
  it.each([' ', 'Enter'])('does nothing when %j is only tapped, or let go before the time', async key => {
    const wrapper = holdButton()

    await wrapper.trigger('keydown', { key })
    vi.advanceTimersByTime(HOLD / 2)
    await wrapper.trigger('keyup', { key })
    vi.advanceTimersByTime(HOLD * 2)

    expect(held(wrapper)).toBe(0)
  })

  it('does nothing for other keys, and is stopped when the focus leaves', async () => {
    const wrapper = holdButton()

    await wrapper.trigger('keydown', { key: 'a' })
    vi.advanceTimersByTime(HOLD * 2)
    await wrapper.trigger('keydown', { key: ' ' })
    await wrapper.trigger('blur')
    vi.advanceTimersByTime(HOLD * 2)

    expect(held(wrapper)).toBe(0)
  })
})
