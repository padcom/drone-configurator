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
}
const TYPED: SafetyOptions = { ...HOLD, level: 'typed', typedWord: 'DISARM', danger: true }

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

describe('a confirmation by typing', () => {
  it.each(['', 'disarm', 'DISARM ', 'DISARn'])('keeps the button disabled for %j', async wrong => {
    const wrapper = asked(TYPED)

    await wrapper.get('#safety-typed').setValue(wrong)

    expect(wrapper.get('#confirm-typed').attributes('disabled')).toBeDefined()
  })

  it('enables the button when the word is typed exactly', async () => {
    const wrapper = asked(TYPED)

    await wrapper.get('#safety-typed').setValue('DISARM')

    expect(wrapper.get('#confirm-typed').attributes('disabled')).toBeUndefined()
  })

  it('confirms once, however often the button is pressed', async () => {
    const wrapper = asked(TYPED)
    await wrapper.get('#safety-typed').setValue('DISARM')

    await wrapper.get('#confirm-typed').trigger('click')
    await wrapper.get('#confirm-typed').trigger('click')

    expect(answers(wrapper)).toEqual([true])
  })
})

describe('a confirmation by typing, with Enter and at the start', () => {
  it('does nothing when Enter is pressed in the field, even with the word typed', async () => {
    const wrapper = asked(TYPED)
    await wrapper.get('#safety-typed').setValue('DISARM')

    await wrapper.get('#safety-typed').trigger('keydown', { key: 'Enter' })

    expect(answers(wrapper)).toEqual([])
  })

  it('ignores a press in the first moments, and shows the word to type', async () => {
    const wrapper = asked(TYPED, IGNORE_MS - 1)
    await wrapper.get('#safety-typed').setValue('DISARM')

    await wrapper.get('#confirm-typed').trigger('click')

    expect(answers(wrapper)).toEqual([])
    expect(wrapper.get('label[for="safety-typed"]').text()).toBe('Type DISARM to confirm')
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
