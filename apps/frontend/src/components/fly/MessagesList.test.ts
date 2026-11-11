import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import FailsafeBanner from './FailsafeBanner.vue'
import { SCRIPTED_MESSAGES } from '@/mock/fixtures'
import MessagesList from './MessagesList.vue'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * The list on a fresh Configurator, with or without the vehicle connected.
 *
 * @param connect whether to connect the simulated vehicle and wait for its messages
 * @returns the list and the mock's controls
 */
async function list(connect: boolean) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ control }))
  mounted = mount(MessagesList, { ...withI18n, attachTo: document.body })
  await flushPromises()

  if (connect) {
    await handle.vehicle.connect({ transport: 'simulator' })
    await vi.waitFor(() => expect(handle.messages.list.value).toHaveLength(SCRIPTED_MESSAGES.length))
  }

  return { wrapper: mounted, control, handle }
}

it('says the vehicle has said nothing yet, before it has', async () => {
  const { wrapper } = await list(false)

  expect(wrapper.get('h2').text()).toBe('Messages')
  expect(wrapper.text()).toContain('The vehicle has said nothing yet.')
  expect(wrapper.find('ul').exists()).toBe(false)
})

it('lists the messages newest first, each with its time', async () => {
  const { wrapper } = await list(true)

  const texts = wrapper.findAll('.message .text').map(text => text.text())
  expect(texts).toEqual(SCRIPTED_MESSAGES.map(([, text]) => text).reverse())
  expect(wrapper.findAll('.message time').every(time => /\d/u.test(time.text()))).toBe(true)
  expect(wrapper.get('ul').attributes('aria-label')).toBe('Messages from the vehicle, newest first')
})

it('says a warning or worse in a word and a mark, and says nothing of one below', async () => {
  const { wrapper } = await list(true)

  const preArm = wrapper.findAll('.message').find(message => message.text().includes('PreArm'))
  const boot = wrapper.findAll('.message').find(message => message.text().includes('ArduCopter V4'))

  expect(preArm?.get('.sev').text()).toBe('Warning')
  expect(preArm?.find('.sev svg').exists()).toBe(true)
  expect(boot?.find('.sev').exists()).toBe(false)
})

it('shows how many warnings are unread on the heading, and none once the pointer is on the list', async () => {
  const { wrapper, control } = await list(true)
  expect(wrapper.find('.unread').exists()).toBe(false)

  control.say?.(4, 'GPS: low accuracy')
  control.say?.(3, 'Compass error')
  await vi.waitFor(() => expect(wrapper.find('.unread').text()).toBe('2 new'))
  await wrapper.get('section').trigger('pointerenter')

  expect(wrapper.find('.unread').exists()).toBe(false)
})

it('keeps the unread count when the screen is opened: only the pointer or the focus on the list clears it', async () => {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.messages.list.value).toHaveLength(SCRIPTED_MESSAGES.length))
  control.say?.(4, 'GPS: low accuracy')
  await vi.waitFor(() => expect(handle.messages.unread.value).toBe(1))

  mounted = mount(MessagesList, { ...withI18n, attachTo: document.body })
  await flushPromises()
  expect(mounted.get('.unread').text()).toBe('1 new')
  await mounted.get('section').trigger('focusin')

  expect(mounted.find('.unread').exists()).toBe(false)
})

it('writes the times in 24 hours', async () => {
  const { wrapper, control } = await list(true)
  control.say?.(6, 'Mission started')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Mission started'))

  const hours = wrapper.findAll('.message time').map(time => time.text())

  expect(hours.every(text => !/\b(?:AM|PM)\b/iu.test(text))).toBe(true)
})

it('shows the failsafe banner as an alert with its text, and takes it away with Dismiss', async () => {
  const { handle, control } = await list(true)
  const banner = mount(FailsafeBanner, { ...withI18n, attachTo: document.body })
  expect(banner.find('#failsafe-banner').exists()).toBe(false)

  control.say?.(2, 'Battery failsafe: returning home')
  await vi.waitFor(() => expect(banner.find('#failsafe-banner').exists()).toBe(true))
  expect(banner.get('#failsafe-banner').attributes('role')).toBe('alert')
  expect(banner.get('#failsafe-banner').text()).toContain('Battery failsafe: returning home')
  await banner.get('#failsafe-dismiss').trigger('click')

  expect(handle.messages.failsafe.value).toBeNull()
  await banner.vm.$nextTick()
  expect(banner.find('#failsafe-banner').exists()).toBe(false)
  banner.unmount()
})
