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

/**
 * A button that is armed and then paused (off because of what its first press asked for: the page reads again).
 *
 * @returns the wrapper
 */
async function paused(): Promise<VueWrapper> {
  const button = second()
  await button.trigger('click')
  await button.setProps({ off: 'waiting' })

  return button
}

describe('a second-press button that the first press pauses', () => {
  it('keeps what it says and does not run out of time while it is paused, longer than the time it has', async () => {
    const button = await paused()
    vi.advanceTimersByTime(WAIT * 3)
    await button.setProps({ off: null })

    expect(button.classes()).toContain('armed')
    expect(button.text()).toBe('Confirm: erase 5 logs')
  })

  it('does not take a press at once when it can be pressed again, and does the second press after a moment', async () => {
    const button = await paused()
    vi.advanceTimersByTime(WAIT * 3)
    await button.setProps({ off: null })
    await button.trigger('click')

    expect(button.emitted('confirm')).toBeUndefined()
    vi.advanceTimersByTime(BETWEEN)
    await button.trigger('click')

    expect(button.emitted('confirm')).toHaveLength(1)
  })

  it('still goes back when it is left alone after it can be pressed again', async () => {
    const button = await paused()
    await button.setProps({ off: null })
    vi.advanceTimersByTime(WAIT)
    await button.vm.$nextTick()

    expect(button.classes()).not.toContain('armed')
  })
})

describe('a second-press button that is paused and let go again and again', () => {
  it('goes back at a minute and the time it waits, however short each pause: the total is capped', async () => {
    const button = second()
    await button.trigger('click')

    // a heartbeat that comes and goes: each time off for 4 s, on for 1 s: 5 s a round
    for (let round = 0; round < 12; round += 1) {
      // eslint-disable-next-line no-await-in-loop -- one change after the other, each flushed
      await button.setProps({ off: 'waiting' })
      vi.advanceTimersByTime(4000)
      // eslint-disable-next-line no-await-in-loop -- see above
      await button.setProps({ off: null })
      vi.advanceTimersByTime(1000)
    }
    // (a minute, and the 5 s it is given: the 65 s are not through yet)
    expect(button.classes()).toContain('armed')
    await button.setProps({ off: 'waiting' })
    vi.advanceTimersByTime(4000)
    await button.setProps({ off: null })
    vi.advanceTimersByTime(1000)
    await button.vm.$nextTick()

    expect(button.classes()).not.toContain('armed')
    await button.trigger('click')

    expect(button.emitted('confirm')).toBeUndefined()
  })
})

describe('a second-press button pressed after its total time, though no timer ran', () => {
  it('does not confirm a press after the total is over, even if no timer ran', async () => {
    const button = second()
    await button.trigger('click')
    vi.setSystemTime(Date.now() + 70_000)
    await button.trigger('click')

    expect(button.emitted('confirm')).toBeUndefined()
    expect(button.classes()).not.toContain('armed')
  })
})

describe('a second-press button whose pause is too long', () => {
  it('goes back when the pause is longer than the most it may last (a minute)', async () => {
    const button = await paused()
    vi.advanceTimersByTime(60_000 + 1)
    await button.vm.$nextTick()
    await button.setProps({ off: null })

    expect(button.classes()).not.toContain('armed')
    expect(button.text()).toBe('Erase all logs')
  })
})

describe('a second-press button that is turned off for any other reason', () => {
  it('goes back at once, and is not armed when it is on again (a first press of minutes ago confirms nothing)', async () => {
    const button = second()
    await button.trigger('click')
    await button.setProps({ off: 'blocked' })

    expect(button.classes()).not.toContain('armed')
    vi.advanceTimersByTime(WAIT * 3)
    await button.setProps({ off: null })
    await button.trigger('click')

    expect(button.emitted('confirm')).toBeUndefined()
    expect(button.text()).toBe('Confirm: erase 5 logs')
  })
})

describe('a second-press button whose reason to be off changes as the page reads again', () => {
  it('keeps what it says when it is off from the first press on, whatever follows the wait that passes', async () => {
    const button = second()
    await button.trigger('click')
    await button.setProps({ off: 'waiting' })
    await button.setProps({ off: 'waiting' })
    await button.setProps({ off: null })

    expect(button.classes()).toContain('armed')
  })

  it('goes back when what it waited for ends and the button is still off for another reason', async () => {
    const button = await paused()
    await button.setProps({ off: 'blocked' })

    expect(button.classes()).not.toContain('armed')
  })

  it('does not go back when the focus leaves it because it was turned off, only when it was on', async () => {
    const button = await paused()
    await button.trigger('blur')

    expect(button.classes()).toContain('armed')
    await button.setProps({ off: null })
    await button.trigger('blur')

    expect(button.classes()).not.toContain('armed')
  })
})

describe('a second-press button, with a key held down', () => {
  it('has the repeats of a held key cancelled, so they cannot click it (Chromium clicks on each Enter repeat)', async () => {
    const button = second()
    await button.trigger('click')
    vi.advanceTimersByTime(BETWEEN + 100)
    const repeat = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true, bubbles: true })

    button.element.dispatchEvent(repeat)

    expect(repeat.defaultPrevented).toBe(true)
    expect(button.emitted('confirm')).toBeUndefined()
  })

  it('leaves the first press of a key alone: it is not cancelled, and Escape still takes it back', async () => {
    const button = second()
    await button.trigger('click')
    const first = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true })

    button.element.dispatchEvent(first)
    await button.trigger('keydown', { key: 'Escape' })

    expect(first.defaultPrevented).toBe(false)
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
    expect(tick.classes()).toContain('unlocked')
  })

  it('stays ticked until it is unticked: the caller locks again by setting it false', async () => {
    const tick = mount(TickUnlock, { props: { modelValue: true }, attachTo: document.body })

    await tick.setProps({ modelValue: false })

    expect(tick.classes()).not.toContain('unlocked')
    expect((tick.get('input').element as HTMLInputElement).checked).toBe(false)
  })

  it('shows the value it is given', () => {
    const tick = mount(TickUnlock, { props: { modelValue: true }, attachTo: document.body })

    expect(tick.classes()).toContain('unlocked')
    expect((tick.get('input').element as HTMLInputElement).checked).toBe(true)
  })
})
