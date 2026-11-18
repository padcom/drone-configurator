import { afterEach, expect, it, vi } from 'vitest'
import { type DOMWrapper, type VueWrapper, flushPromises, mount } from '@vue/test-utils'
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

it('shows the severity of every message as a mark only, with the word as its tooltip and for a screen reader', async () => {
  const { wrapper } = await list(true)

  const preArm = wrapper.findAll('.message').find(message => message.text().includes('PreArm'))
  const boot = wrapper.findAll('.message').find(message => message.text().includes('ArduCopter V4'))

  expect(preArm?.get('.sev').attributes('title')).toBe('Warning')
  expect(preArm?.get('.sev .visually-hidden').text()).toBe('Warning')
  expect(boot?.get('.sev').attributes('title')).toMatch(/^(?:Notice|Info|Debug)$/u)
  expect(wrapper.findAll('.message').every(message => message.find('.sev svg').exists())).toBe(true)
  // (nothing but the mark is shown: the only text in it is the hidden one)
  const shown = (sev: DOMWrapper<Element>): number => sev.findAll('*')
    .filter(part => part.text() !== '' && !part.classes('visually-hidden')).length

  expect(wrapper.findAll('.sev').map(shown).every(count => count === 0)).toBe(true)
})

it('does not make a tab stop of every mark: the list is the one stop', async () => {
  const { wrapper } = await list(true)

  expect(wrapper.findAll('.sev [tabindex], .sev button, .sev a')).toHaveLength(0)
  expect(wrapper.get('ul').attributes('tabindex')).toBe('0')
})

it('is a log, and says that it keeps the last 500 and what a connection lists', async () => {
  const { wrapper } = await list(true)

  expect(wrapper.get('ul').attributes('role')).toBe('log')
  // (it keeps its role and its name, but is not read out as it grows: a warning has its toast and the banner)
  expect(wrapper.get('ul').attributes('aria-live')).toBe('off')
  expect(wrapper.get('.messages-note').text()).toBe(
    'The last 500 messages are kept. On connecting, the last 200 that the vehicle said before are listed.',
  )
})

it('lists every message the vehicle says, the same text again and the PreArm ones included', async () => {
  const { wrapper, control } = await list(true)
  control.say?.(4, 'PreArm: Compass not calibrated')
  control.say?.(4, 'PreArm: Compass not calibrated')
  control.say?.(6, 'Home set')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Home set'))

  const texts = wrapper.findAll('.message .text').map(text => text.text())

  expect(texts.filter(text => text === 'PreArm: Compass not calibrated').length).toBeGreaterThanOrEqual(2)
  expect(texts).toHaveLength(SCRIPTED_MESSAGES.length + 3)
})

it('keeps 500 messages and drops the oldest after that', async () => {
  const { wrapper, control } = await list(true)
  for (let i = 0; i < 520; i += 1) {
    control.say?.(6, `message ${i}`)
  }
  await vi.waitFor(() => expect(wrapper.text()).toContain('message 519'))

  expect(wrapper.findAll('.message')).toHaveLength(500)
  expect(wrapper.text()).not.toContain('ArduCopter V4')
})

it('says "nothing yet" in a status that is in the page all the time, empty while there are messages', async () => {
  const { wrapper } = await list(true)
  const status = wrapper.get('.empty')

  expect(status.attributes('role')).toBe('status')
  expect(status.text()).toBe('')
  await wrapper.get('.messages-clear').trigger('click')

  expect(wrapper.get('.empty').element).toBe(status.element)
  expect(status.text()).toBe('The vehicle has said nothing yet.')
})

it('keeps the focus in the list\'s section when Clear takes the button away, and does not let it fall to the page', async () => {
  const { wrapper } = await list(true)
  const button = wrapper.get('.messages-clear').element as HTMLElement
  button.focus()
  await wrapper.get('.messages-clear').trigger('click')

  expect(wrapper.find('.messages-clear').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('section').element)
})

it('empties with Clear, lists only what comes after, and has no button while there is nothing', async () => {
  const { wrapper, control } = await list(true)
  await wrapper.get('.messages-clear').trigger('click')

  expect(wrapper.findAll('.message')).toHaveLength(0)
  expect(wrapper.text()).toContain('The vehicle has said nothing yet.')
  expect(wrapper.find('.messages-clear').exists()).toBe(false)
  control.say?.(6, 'After the clear')
  await vi.waitFor(() => expect(wrapper.findAll('.message')).toHaveLength(1))

  expect(wrapper.get('.message .text').text()).toBe('After the clear')
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
