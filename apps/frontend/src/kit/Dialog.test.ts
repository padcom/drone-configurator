import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { h } from 'vue'
import Dialog from './Dialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * A dialog with two buttons, opened from a button that has the focus.
 *
 * @returns the dialog, and the button that opened it
 */
function opened(): { wrapper: VueWrapper, opener: HTMLButtonElement } {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const actions = () => [h('button', { id: 'a' }, 'A'), h('button', { 'id': 'b', 'data-initial-focus': '' }, 'B')]
  const slots = { default: () => h('p', 'Body'), actions }
  const wrapper = mount(Dialog, { props: { title: 'Title' }, slots, attachTo: document.body })

  return { wrapper, opener }
}

/**
 * Puts the focus on a control of the dialog.
 *
 * @param wrapper the dialog
 * @param selector the control
 */
function focusOn(wrapper: VueWrapper, selector: string): void {
  (wrapper.get(selector).element as HTMLElement).focus()
}

describe('a dialog', () => {
  it('opens as a modal with its title, its body and its actions', () => {
    const { wrapper } = opened()
    const dialog = wrapper.get('dialog').element as HTMLDialogElement

    expect(dialog.open).toBe(true)
    expect(wrapper.get('h2').text()).toBe('Title')
    expect(wrapper.text()).toContain('Body')
    expect(wrapper.findAll('button')).toHaveLength(2)
  })

  it('puts the focus on the control that asks for it', () => {
    opened()

    expect(document.activeElement?.id).toBe('b')
  })

  it('asks to close for Escape, and does not close by itself', async () => {
    const { wrapper } = opened()

    await wrapper.get('dialog').trigger('cancel')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(true)
  })
})

describe('a dialog, when it goes', () => {
  it('gives the focus back to what had it, when it goes', () => {
    const { wrapper, opener } = opened()

    wrapper.unmount()

    expect(document.activeElement).toBe(opener)
  })
})

describe('a dialog, with Tab', () => {
  it('wraps from the last control to the first', async () => {
    const { wrapper } = opened()

    await wrapper.get('#b').trigger('keydown', { key: 'Tab' })

    expect(document.activeElement?.id).toBe('a')
  })

  it('wraps from the first control to the last with Shift', async () => {
    const { wrapper } = opened()
    focusOn(wrapper, '#a')

    await wrapper.get('#a').trigger('keydown', { key: 'Tab', shiftKey: true })

    expect(document.activeElement?.id).toBe('b')
  })

  it('leaves Tab alone between the ends', async () => {
    const { wrapper } = opened()
    focusOn(wrapper, '#a')

    await wrapper.get('#a').trigger('keydown', { key: 'Tab' })

    expect(document.activeElement?.id).toBe('a')
  })
})

describe('a dialog, with Tab from outside', () => {
  it('brings a focus that strayed outside the dialog back in', async () => {
    const { wrapper, opener } = opened()
    opener.focus()

    await wrapper.get('dialog').trigger('keydown', { key: 'Tab' })

    expect(document.activeElement?.id).toBe('a')
  })
})
