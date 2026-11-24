// The Settings screen's Forward MAVLink section: nothing is forwarded until a program is added; a program is added from the form
// (Enter in a field does it), turned off and on, and removed, each kept in the settings entry the backend reads; what the backend
// says it is doing is shown in words; and a host or a port that cannot be used, or the same program twice, is said and not kept.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { FORWARD_KEY } from '@/lib/forward/endpoints'
import { mockBackend } from '@/mock/mock-backend'
import Settings from './Settings.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Settings screen over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the screen and the Configurator
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] } })
  await flushPromises()

  return { wrapper: mounted, handle }
}

/**
 * Fills the form and submits it, as typing and pressing Enter does.
 *
 * @param wrapper the screen
 * @param fields what to type
 * @param fields.kind the protocol
 * @param fields.host the host
 * @param fields.port the port
 */
async function addEndpoint(wrapper: VueWrapper, fields: { kind: string, host: string, port: string }) {
  await wrapper.get('.forward-add select').setValue(fields.kind)
  const [host, port] = wrapper.findAll('.forward-add input')
  await host!.setValue(fields.host)
  await port!.setValue(fields.port)
  await wrapper.get('.forward-add').trigger('submit')
  await flushPromises()
}

/**
 * The endpoints the settings hold.
 *
 * @param handle the Configurator
 * @returns the list, as the backend reads it
 */
const endpointsOf = (handle: Awaited<ReturnType<typeof screen>>['handle']) => JSON.parse(
  handle.settings.uiValue(FORWARD_KEY) ?? '[]',
)

it('forwards nothing until a program is added, and says so', async () => {
  const { wrapper, handle } = await screen()

  expect(wrapper.get('#forward-empty').text()).toBe('No programs. Nothing is forwarded.')
  expect(handle.settings.uiValue(FORWARD_KEY)).toBeUndefined()
})

it('adds a program from the form, turned on, and says it waits for a vehicle, then that it is up', async () => {
  const { wrapper, handle } = await screen()
  await addEndpoint(wrapper, { kind: 'tcp', host: ' 10.0.0.2 ', port: '5760' })

  expect(endpointsOf(handle)).toEqual([{ kind: 'tcp', host: '10.0.0.2', port: 5760, on: true }])
  const row = wrapper.get('.forward-row')
  expect(row.get('.forward-name').text()).toBe('TCP 10.0.0.2:5760')
  await vi.waitFor(() => expect(row.get('.forward-state').text()).toBe('Waits for a vehicle'))
  expect(row.get('.forward-counts').text()).toBe('Sent 0 · dropped 0 · received 0')

  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(wrapper.get('.forward-row .forward-state').text()).toBe('Up'))
})

it('turns a program off and on, and removes it, in the settings', async () => {
  const value = JSON.stringify([{ kind: 'udp', host: '127.0.0.1', port: 14_550, on: true }])
  const { wrapper, handle } = await screen([{ key: FORWARD_KEY, value }])
  const toggle = wrapper.get('.forward-row .forward-on')
  expect(toggle.attributes('aria-checked')).toBe('true')
  expect(toggle.attributes('aria-label')).toBe('Forward to UDP 127.0.0.1:14550')

  await toggle.trigger('click')
  await flushPromises()
  expect(endpointsOf(handle)[0].on).toBe(false)
  await vi.waitFor(() => expect(wrapper.get('.forward-row .forward-state').text()).toBe('Off'))

  await wrapper.get('.forward-row .forward-on').trigger('click')
  await flushPromises()
  expect(endpointsOf(handle)[0].on).toBe(true)

  expect(wrapper.get('.forward-row .forward-remove').attributes('aria-label')).toBe('Remove UDP 127.0.0.1:14550')
  await wrapper.get('.forward-row .forward-remove').trigger('click')
  await flushPromises()
  expect(endpointsOf(handle)).toEqual([])
  expect(wrapper.find('.forward-row').exists()).toBe(false)
})

it('says why a program cannot be added, and keeps nothing', async () => {
  const { wrapper, handle } = await screen()
  await addEndpoint(wrapper, { kind: 'udp', host: '127.0.0.1', port: '70000' })
  expect(wrapper.get('#forward-problem').text()).toBe('Enter a port from 1 to 65535.')
  await addEndpoint(wrapper, { kind: 'udp', host: '', port: '14550' })
  expect(wrapper.get('#forward-problem').text()).toBe('Enter a host name or address, with no spaces.')
  expect(handle.settings.uiValue(FORWARD_KEY)).toBeUndefined()

  await addEndpoint(wrapper, { kind: 'udp', host: '127.0.0.1', port: '14550' })
  expect(wrapper.find('#forward-problem').exists()).toBe(false)
  await addEndpoint(wrapper, { kind: 'udp', host: '127.0.0.1', port: '14550' })
  expect(wrapper.get('#forward-problem').text()).toBe('This program is in the list already.')
  expect(endpointsOf(handle)).toHaveLength(1)
})

it('shows why a program was refused, with the backend\'s reason, and one that drops', async () => {
  const value = JSON.stringify([{ kind: 'tcp', host: '127.0.0.1', port: 5762, on: true }])
  const { wrapper, handle } = await screen([{ key: FORWARD_KEY, value }])
  // What the real backend says of a program that refuses (the mock has no sockets to be refused).
  handle.forwarding.unwatch()
  const said = { kind: 'tcp', host: '127.0.0.1', port: 5762, on: true, sent: 0, dropped: 0, received: 0 } as const
  handle.forwarding.status.value = [{ ...said, state: 'refused', error: 'connection refused' }]
  await flushPromises()

  expect(wrapper.get('.forward-row .forward-state').text()).toBe('Refused')
  const reason = 'Not reached: connection refused. A TCP program is tried again every 2 s.'
  expect(wrapper.get('.forward-row .forward-error').text()).toBe(reason)
  handle.forwarding.status.value = [{ ...said, state: 'dropping', dropped: 1200 }]
  await flushPromises()
  expect(wrapper.get('.forward-row .forward-state').text()).toBe('Dropping: too slow')
  expect(wrapper.get('.forward-row .forward-counts').text()).toBe('Sent 0 · dropped 1,200 · received 0')
})
