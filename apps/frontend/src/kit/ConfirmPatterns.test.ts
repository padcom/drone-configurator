import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import SecondPress from './SecondPress.vue'
import TickUnlock from './TickUnlock.vue'

const WAIT = 5000
const BETWEEN = 400

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/**
 * A second-press button.
 *
 * @returns the wrapper
 */
function second(): VueWrapper {
  return mount(SecondPress, {
    props: { label: 'Erase all logs', confirmLabel: 'Confirm: erase 5 logs' },
    attachTo: document.body,
  })
}

describe('a second-press button', () => {
  it('says what it does at rest, and exactly what will happen after the first press, which does nothing', async () => {
    const button = second()
    expect(button.text()).toBe('Erase all logs')
    expect(button.classes()).not.toContain('armed')

    await button.trigger('click')

    expect(button.text()).toBe('Confirm: erase 5 logs')
    expect(button.classes()).toContain('armed')
    expect(button.emitted('confirm')).toBeUndefined()
  })

  it('does it with a second press, once, and goes back', async () => {
    const button = second()
    await button.trigger('click')
    vi.advanceTimersByTime(BETWEEN)

    await button.trigger('click')

    expect(button.emitted('confirm')).toHaveLength(1)
    expect(button.text()).toBe('Erase all logs')
  })
})

describe('a second-press button, pressed twice in a row', () => {
  it('does not take a double click for the second press', async () => {
    const button = second()

    await button.trigger('click')
    await button.trigger('click')

    expect(button.emitted('confirm')).toBeUndefined()
    expect(button.classes()).toContain('armed')
  })
})

describe('a second-press button that is left alone or left', () => {
  it('goes back when it is left alone', async () => {
    const button = second()
    await button.trigger('click')

    vi.advanceTimersByTime(WAIT)
    await button.vm.$nextTick()

    expect(button.classes()).not.toContain('armed')
  })

  it('goes back when the focus leaves it, and with Escape', async () => {
    const button = second()
    await button.trigger('click')
    await button.trigger('blur')
    expect(button.classes()).not.toContain('armed')

    await button.trigger('click')
    await button.trigger('keydown', { key: 'Escape' })

    expect(button.classes()).not.toContain('armed')
  })
})

describe('a second-press button that went back', () => {
  it('needs the second press after going back to be a first one again', async () => {
    const button = second()
    await button.trigger('click')
    vi.advanceTimersByTime(WAIT)
    await button.vm.$nextTick()

    await button.trigger('click')

    expect(button.emitted('confirm')).toBeUndefined()
  })
})

describe('a tick to unlock', () => {
  it('is locked until it is ticked, in the caution colours, and then unlocked, in the good ones', async () => {
    const tick = mount(TickUnlock, { slots: { default: 'The propellers are off' }, attachTo: document.body })
    expect(tick.classes()).not.toContain('unlocked')
    expect(tick.text()).toBe('The propellers are off')

    await tick.get('input').setValue(true)

    expect(tick.emitted('update:modelValue')).toEqual([[true]])
  })

  it('shows the value it is given', () => {
    const tick = mount(TickUnlock, { props: { modelValue: true }, attachTo: document.body })

    expect(tick.classes()).toContain('unlocked')
    expect((tick.get('input').element as HTMLInputElement).checked).toBe(true)
  })
})
