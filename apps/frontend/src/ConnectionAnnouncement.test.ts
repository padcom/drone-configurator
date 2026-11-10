import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionAnnouncement from './ConnectionAnnouncement.vue'
import { VEHICLE } from './fixtures'
import { mockBackend } from './mock-backend'
import type { State } from './state'
import { feed as feedState, withI18n } from './testing'
import { useToasts } from './toasts'
import { createConfigurator } from './useConfigurator'
import { useConnectDialog } from './useConnectDialog'

/**
 * Mounts the status line on a fresh Configurator.
 *
 * @returns the component and `feed` (changes the state the way the backend would)
 */
function statusWithFeed() {
  const handle = createConfigurator(mockBackend())
  const feed = (change: Partial<State>) => feedState(handle, change)

  return { wrapper: mount(ConnectionAnnouncement, withI18n), feed }
}

it('shows the state, the vehicle and why the last attempt failed, as text', async () => {
  const { wrapper, feed } = statusWithFeed()
  expect(wrapper.get('#connection').text()).toBe('disconnected')
  // A screen reader is told when the connection changes.
  expect(wrapper.get('#connection').attributes('role')).toBe('status')

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } }, error: '<oops>', notice: 'The backend restarted' })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#connection').text()
  expect(text).toContain('connected · system 1/1 · QUADROTOR · ARDUPILOTMEGA')
  expect(text).toContain('<oops>')
  expect(text).toContain('The backend restarted')
  expect(wrapper.find('#connection oops').exists()).toBe(false)
})

it('is out of sight, and toasts the error and the notice (the error not while the Connect dialog shows it)', async () => {
  const { wrapper, feed } = statusWithFeed()
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))
  expect(wrapper.get('#connection').classes()).toContain('visually-hidden')

  feed({ error: 'Connection refused', notice: 'The backend restarted' })
  await wrapper.vm.$nextTick()

  expect(toasts.visible.value.map(toast => [toast.severity, toast.text])).toEqual([
    ['error', 'Connection refused'],
    ['warning', 'The backend restarted'],
  ])

  useConnectDialog().show()
  feed({ error: 'Another failure' })
  await wrapper.vm.$nextTick()
  useConnectDialog().hide()

  expect(toasts.visible.value.map(toast => toast.text)).not.toContain('Another failure')
})

it('says that the link is being brought back, which try this is and when the next is, with the vehicle still shown', async () => {
  const { wrapper, feed } = statusWithFeed()

  feed({ connection: { state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 3, nextRetryMs: 3500 } })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#connection').text()
  expect(text).toContain('reconnecting')
  expect(text).toContain('try 3, the next in 4 s')
  expect(text).toContain('QUADROTOR')
})

it('says that a link that came back is the same vehicle, only when it is', async () => {
  const { wrapper, feed } = statusWithFeed()

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE }, resumed: true } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connection').text()).toContain('reconnected to the same vehicle')

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connection').text()).not.toContain('same vehicle')
})

it('says "same vehicle" only while connected, not in a state that came after', async () => {
  const { wrapper, feed } = statusWithFeed()

  feed({ connection: { state: 'lost', vehicle: { ...VEHICLE }, resumed: true } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connection').text()).not.toContain('same vehicle')

  feed({ connection: { state: 'reconnecting', vehicle: { ...VEHICLE }, resumed: true, attempt: 1, nextRetryMs: 1000 } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connection').text()).not.toContain('same vehicle')
})

it('says nothing about tries when the link is up', async () => {
  const { wrapper, feed } = statusWithFeed()

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#connection').text()).not.toContain('try ')
})
