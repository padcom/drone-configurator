import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'
import { mockBackend } from './mock-backend'
import { withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

// jsdom has no showModal(): this stand-in opens the dialog, and close() fires the `close` event.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    this.open = false
    this.returnValue = value ?? this.returnValue

    this.dispatchEvent(new Event('close'))
  }
})

/**
 * Mounts the dialog and asks it a question.
 *
 * @returns the dialog element, the component, and the spy that gets the answer
 */
async function asked() {
  const { confirmation } = createConfigurator(mockBackend())
  const wrapper = mount(ConfirmDialog, { ...withI18n, attachTo: document.body })
  const answer = vi.fn()
  confirmation.value = { question: 'Set X from 1 to 2?', answer }
  await wrapper.vm.$nextTick()

  return { wrapper, answer, dialog: wrapper.get('dialog#confirm').element as HTMLDialogElement }
}

it('opens with the question, and Write answers yes', async () => {
  const { wrapper, answer, dialog } = await asked()

  expect(dialog.open).toBe(true)
  expect(wrapper.get('#question').text()).toBe('Set X from 1 to 2?')
  dialog.close('yes')
  expect(answer).toHaveBeenCalledWith(true)
  wrapper.unmount()
})

it('answers no for Cancel', async () => {
  const { wrapper, answer, dialog } = await asked()

  dialog.close('no')
  expect(answer).toHaveBeenCalledWith(false)
  wrapper.unmount()
})

it('answers no for Escape, which closes without a value', async () => {
  const { wrapper, answer, dialog } = await asked()

  dialog.close()
  expect(answer).toHaveBeenCalledWith(false)
  wrapper.unmount()
})

it('keeps the buttons the e2e tests click', () => {
  createConfigurator(mockBackend())
  const wrapper = mount(ConfirmDialog, withI18n)

  expect(wrapper.find('#confirm button[value=yes]').exists()).toBe(true)
  expect(wrapper.find('#confirm button[value=no]').exists()).toBe(true)
})
