import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { h } from 'vue'
import { setTimeout as sleep } from 'node:timers/promises'
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

describe('a dialog, closed by the browser', () => {
  it('says so, so that the owner can remove it (Escape pressed a second time closes without a cancel)', async () => {
    const { wrapper } = opened()

    await wrapper.get('dialog').trigger('close')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('a dialog, when it goes', () => {
  it('gives the focus back to what had it, when it goes', async () => {
    const { wrapper, opener } = opened()

    wrapper.unmount()
    await sleep(0)

    expect(document.activeElement).toBe(opener)
  })

  it('gives it to the section around what had it, when that has been disabled meanwhile', async () => {
    const section = document.createElement('section')
    document.body.append(section)
    const { wrapper, opener } = opened()
    section.append(opener)
    opener.focus()
    wrapper.unmount()
    opener.disabled = true
    await sleep(0)

    expect(document.activeElement).toBe(section)
  })

  it('does not say it closed when it goes by itself', () => {
    const { wrapper } = opened()

    wrapper.unmount()

    expect(wrapper.emitted('close')).toBeUndefined()
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
