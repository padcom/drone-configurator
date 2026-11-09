import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'
import { HOLD_MS, IGNORE_MS } from './safety'
import { mockBackend } from './mock-backend'
import { VEHICLE } from './fixtures'
import { feed, translate, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/**
 * Mounts the host and asks it a question.
 *
 * @returns the host, the configurator, and the spy that gets the answer
 */
async function asked() {
  const configurator = createConfigurator(mockBackend())
  const wrapper = mount(ConfirmDialog, { ...withI18n, attachTo: document.body })
  const answer = vi.fn()
  configurator.confirmation.value = { question: 'Set X from 1 to 2?', answer }
  await wrapper.vm.$nextTick()
  vi.advanceTimersByTime(IGNORE_MS)

  return { wrapper, configurator, answer }
}

it('shows nothing until a question arrives', () => {
  createConfigurator(mockBackend())

  expect(mount(ConfirmDialog, withI18n).find('dialog').exists()).toBe(false)
})

it('opens with the question, and holding the button answers yes', async () => {
  const { wrapper, answer } = await asked()

  expect((wrapper.get('dialog#confirm').element as HTMLDialogElement).open).toBe(true)
  expect(wrapper.get('#question').text()).toBe('Set X from 1 to 2?')
  await wrapper.get('#confirm-hold').trigger('pointerdown')
  vi.advanceTimersByTime(HOLD_MS)

  expect(answer).toHaveBeenCalledExactlyOnceWith(true)
})

it('does not answer yes for a click on the button', async () => {
  const { wrapper, answer } = await asked()

  await wrapper.get('#confirm-hold').trigger('click')
  vi.advanceTimersByTime(HOLD_MS * 2)

  expect(answer).not.toHaveBeenCalled()
})

it('answers no for Cancel and for Escape', async () => {
  const cancelled = await asked()
  await cancelled.wrapper.get('#confirm-cancel').trigger('click')
  const escaped = await asked()
  await escaped.wrapper.get('dialog').trigger('cancel')

  expect([cancelled.answer.mock.calls, escaped.answer.mock.calls]).toEqual([[[false]], [[false]]])
})

it('names the vehicle it will write to', async () => {
  const { wrapper, configurator } = await asked()
  expect(wrapper.get('#vehicle').text()).toBe('No vehicle is connected')
  await flushPromises()

  feed(configurator, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  vi.advanceTimersByTime(50)
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#vehicle').text()).toBe(translate('statusBar.vehicleValue', { ...VEHICLE }))
  expect(wrapper.get('#vehicle').text()).not.toBe('No vehicle is connected')
})
