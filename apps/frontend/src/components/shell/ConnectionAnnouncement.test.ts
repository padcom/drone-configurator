import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionAnnouncement from './ConnectionAnnouncement.vue'
import { VEHICLE } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import type { State } from '@/state/state'
import { feed as feedState, withI18n } from '@/testing/testing'
import { useToasts } from '@/composables/toasts'
import { createConfigurator } from '@/composables/useConfigurator'
import { useConnectDialog } from '@/composables/useConnectDialog'

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

it('says the end of a parameter download to the ear, with no Parameters screen mounted, in a status that is there', async () => {
  const { wrapper, feed } = statusWithFeed()
  const status = wrapper.get('#download-announcement')
  expect(status.attributes('role')).toBe('status')
  expect(status.classes()).toContain('visually-hidden')
  expect(status.text()).toBe('')

  // A download that is under way says nothing; when it ends, how it came is said.
  feed({ list: 'loading', downloadInfo: { source: 'list', fallback: 'timeout', elapsedMs: 6200 } })
  await wrapper.vm.$nextTick()
  expect(status.text()).toBe('')
  feed({ list: 'complete', params: [], downloadInfo: { source: 'list', fallback: 'timeout', elapsedMs: 6200 } })
  await wrapper.vm.$nextTick()

  expect(status.text()).toBe('Parameters: 0 · by list in 6.2 s (file transfer is not used: it did not answer)')
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

it('makes a toast of each different error, within 2 s too, and keeps the notice until it is dismissed', async () => {
  const { wrapper, feed } = statusWithFeed()
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))

  feed({ error: 'First failure' })
  await wrapper.vm.$nextTick()
  feed({ error: 'Second failure', notice: 'Connect again to continue' })
  await wrapper.vm.$nextTick()

  const shown = toasts.visible.value
  expect(shown.filter(toast => toast.severity === 'error').map(toast => toast.text)).toEqual(['First failure', 'Second failure'])
  expect(shown.find(toast => toast.text === 'Connect again to continue')?.sticky).toBe(true)
})

/**
 * The texts of the toasts of the queue that are warnings.
 *
 * @returns the texts
 */
function warnings(): string[] {
  return useToasts().visible.value.filter(toast => toast.severity === 'warning').map(toast => toast.text)
}

it('takes the notice toast away when the notice is gone, and when the link is up again', async () => {
  const { wrapper, feed } = statusWithFeed()
  useToasts().visible.value.forEach(toast => useToasts().dismiss(toast.key))

  feed({ notice: 'Connect again to continue' })
  await wrapper.vm.$nextTick()
  expect(warnings()).toEqual(['Connect again to continue'])
  feed({ notice: null })
  await wrapper.vm.$nextTick()
  expect(warnings()).toEqual([])

  feed({ notice: 'Connect again to continue' })
  await wrapper.vm.$nextTick()
  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  expect(warnings()).toEqual([])
})

it('keeps one notice toast when a newer notice comes, also the same words again', async () => {
  const { wrapper, feed } = statusWithFeed()
  useToasts().visible.value.forEach(toast => useToasts().dismiss(toast.key))

  feed({ notice: 'The backend restarted' })
  await wrapper.vm.$nextTick()
  feed({ notice: 'The backend restarted again' })
  await wrapper.vm.$nextTick()
  expect(warnings()).toEqual(['The backend restarted again'])

  feed({ notice: null })
  await wrapper.vm.$nextTick()
  feed({ notice: 'The backend restarted again' })
  await wrapper.vm.$nextTick()
  expect(warnings()).toEqual(['The backend restarted again'])
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
