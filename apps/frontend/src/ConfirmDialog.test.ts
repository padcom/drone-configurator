import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'
import { IGNORE_MS } from './safety'
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

it('opens with the question, and pressing Write answers yes: a write is not held', async () => {
  const { wrapper, answer } = await asked()

  expect((wrapper.get('dialog#confirm').element as HTMLDialogElement).open).toBe(true)
  expect(wrapper.get('#question').text()).toBe('Set X from 1 to 2?')
  expect(wrapper.find('#confirm-hold').exists()).toBe(false)
  await wrapper.get('#confirm-yes').trigger('click')

  expect(answer).toHaveBeenCalledExactlyOnceWith(true)
})

it('does not answer yes for a click that lands as the dialog opens', async () => {
  const configurator = createConfigurator(mockBackend())
  const wrapper = mount(ConfirmDialog, { ...withI18n, attachTo: document.body })
  const answer = vi.fn()
  configurator.confirmation.value = { question: 'Set X from 1 to 2?', answer }
  await wrapper.vm.$nextTick()

  await wrapper.get('#confirm-yes').trigger('click')

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

  expect(wrapper.get('#vehicle').text()).toBe(translate('topBar.vehicleValue', { ...VEHICLE }))
  expect(wrapper.get('#vehicle').text()).not.toBe('No vehicle is connected')
})
