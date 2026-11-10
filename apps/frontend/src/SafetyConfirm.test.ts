import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import SafetyConfirm from './SafetyConfirm.vue'
import { HOLD_MS, IGNORE_MS, type SafetyOptions } from './safety'
import { withI18n } from './testing'

const HOLD: SafetyOptions = {
  title: 'Confirm a change',
  what: 'Set X from 1 to 2?',
  vehicle: 'Copter · ArduPilot · system 1/1',
  level: 'hold',
  confirmLabel: 'Hold to arm',
}
const PLAIN: SafetyOptions = { ...HOLD, level: 'plain', confirmLabel: 'Write' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/**
 * A confirmation that has been on the page long enough to take presses.
 *
 * @param options what to ask
 * @param waitMs how long to let it stand before returning
 * @returns the wrapper
 */
function asked(options: SafetyOptions, waitMs = IGNORE_MS): VueWrapper {
  const wrapper = mount(SafetyConfirm, { ...withI18n, props: { options }, attachTo: document.body })
  vi.advanceTimersByTime(waitMs)

  return wrapper
}

/**
 * The answers sent so far.
 *
 * @param wrapper the confirmation
 * @returns the answers, in order
 */
const answers = (wrapper: VueWrapper) => (wrapper.emitted('answer') ?? []).map(args => args[0])

describe('the confirmation says what it asks', () => {
  it('names the vehicle and what will happen, or that there is no vehicle', () => {
    const wrapper = asked(HOLD)
    expect(wrapper.get('#vehicle').text()).toBe(HOLD.vehicle)
    expect(wrapper.get('#question').text()).toBe(HOLD.what)
    // A long question scrolls (dialog.css), so a keyboard can reach it.
    expect(wrapper.get('#question').attributes('tabindex')).toBe('0')

    expect(asked({ ...HOLD, vehicle: '' }).get('#vehicle').text()).toBe('No vehicle is connected')
  })

  it('is a modal dialog with a name and a description', () => {
    const dialog = asked(HOLD).get('dialog').element

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(HOLD.title)
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toContain(HOLD.what)
  })

  it('has the safe choice focused, and cancels with it', async () => {
    const wrapper = asked(HOLD)

    expect(document.activeElement?.id).toBe('confirm-cancel')
    await wrapper.get('#confirm-cancel').trigger('click')

    expect(answers(wrapper)).toEqual([false])
  })
})

describe('a confirmation by holding', () => {
  it('confirms when the button is held for the hold time', async () => {
    const wrapper = asked(HOLD)

    await wrapper.get('#confirm-hold').trigger('pointerdown')
    vi.advanceTimersByTime(HOLD_MS)

    expect(answers(wrapper)).toEqual([true])
  })

  it('does not confirm for a tap of Enter, a click, or a press in the first moments', async () => {
    const early = asked(HOLD, IGNORE_MS - 1)
    await early.get('#confirm-hold').trigger('pointerdown')
    vi.advanceTimersByTime(HOLD_MS * 2)

    const wrapper = asked(HOLD)
    await wrapper.get('#confirm-hold').trigger('keydown', { key: 'Enter' })
    await wrapper.get('#confirm-hold').trigger('keyup', { key: 'Enter' })
    await wrapper.get('#confirm-hold').trigger('click')
    vi.advanceTimersByTime(HOLD_MS * 2)

    expect([answers(early), answers(wrapper)]).toEqual([[], []])
  })

  it('says how long to hold', () => {
    expect(asked(HOLD).get('.safety-hint').text()).toContain('1.2 s')
  })
})

describe('a plain confirmation', () => {
  it('has no hold and no hint, and a primary button with the words it is given', () => {
    const wrapper = asked(PLAIN)

    expect(wrapper.find('#confirm-hold').exists()).toBe(false)
    expect(wrapper.find('#safety-hint').exists()).toBe(false)
    expect(wrapper.get('#confirm-yes').text()).toBe('Write')
    expect(wrapper.get('#confirm-yes').classes()).toContain('primary')
  })

  it('confirms with a press, and once, however often the button is pressed', async () => {
    const wrapper = asked(PLAIN)

    await wrapper.get('#confirm-yes').trigger('click')
    await wrapper.get('#confirm-yes').trigger('click')

    expect(answers(wrapper)).toEqual([true])
  })
})

describe('a plain confirmation, at the start and without a field', () => {
  it('ignores a press in the first moments, and takes it after', async () => {
    const wrapper = asked(PLAIN, IGNORE_MS - 1)

    await wrapper.get('#confirm-yes').trigger('click')
    expect(answers(wrapper)).toEqual([])
    vi.advanceTimersByTime(1)
    await wrapper.get('#confirm-yes').trigger('click')

    expect(answers(wrapper)).toEqual([true])
  })

  it('has no text field: there is no typed confirmation', () => {
    expect(asked(PLAIN).find('input').exists()).toBe(false)
    expect(asked(HOLD).find('input').exists()).toBe(false)
  })
})

describe('a hold in each tone', () => {
  it('is amber unless it is asked to be red', () => {
    expect(asked(HOLD).get('#confirm-hold').classes()).toContain('warn')
    expect(asked({ ...HOLD, tone: 'error' }).get('#confirm-hold').classes()).toContain('error')
  })
})

describe('a confirmation, pressed the way a screen reader or a held key does', () => {
  it('says that the button is to be held when it is clicked, and links the hint to the button', async () => {
    const wrapper = asked(HOLD)
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.get('#confirm-hold').attributes('aria-describedby')).toBe('safety-hint')

    await wrapper.get('#confirm-hold').trigger('click')

    expect(wrapper.get('[role="status"]').text()).toContain('hold')
    expect(answers(wrapper)).toEqual([])
  })

  it('does not cancel for a click in the first moments (a key still held from the button that opened it)', async () => {
    const wrapper = asked(HOLD, IGNORE_MS - 1)

    await wrapper.get('#confirm-cancel').trigger('click')
    expect(answers(wrapper)).toEqual([])
    vi.advanceTimersByTime(1)
    await wrapper.get('#confirm-cancel').trigger('click')

    expect(answers(wrapper)).toEqual([false])
  })
})

describe('leaving a confirmation', () => {
  it('answers no when the browser closes the dialog, so asking again shows a new one', async () => {
    const wrapper = asked(HOLD)

    await wrapper.get('dialog').trigger('close')

    expect(answers(wrapper)).toEqual([false])
  })

  it('answers no for Escape', async () => {
    const wrapper = asked(HOLD)

    await wrapper.get('dialog').trigger('cancel')

    expect(answers(wrapper)).toEqual([false])
  })

  it('answers once: a hold that finishes after Escape does not confirm', async () => {
    const wrapper = asked(HOLD)

    await wrapper.get('#confirm-hold').trigger('pointerdown')
    await wrapper.get('dialog').trigger('cancel')
    vi.advanceTimersByTime(HOLD_MS)

    expect(answers(wrapper)).toEqual([false])
  })
})
