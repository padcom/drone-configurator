import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConnectionBar from './ConnectionBar.vue'
import { mockBackend } from './mock-backend'
import type { State } from './state'
import { feed as feedState, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { VEHICLE } from './fixtures'

/**
 * Mounts the bar on a fresh Configurator whose actions are spies.
 *
 * @returns the component, `feed` (changes the state the way the backend would) and the spies
 */
function barWithSpies() {
  const handle = createConfigurator(mockBackend())
  const connect = vi.spyOn(handle.vehicle, 'connect').mockResolvedValue()
  const disconnect = vi.spyOn(handle.vehicle, 'disconnect').mockResolvedValue()
  const listPorts = vi.spyOn(handle.vehicle, 'listPorts').mockResolvedValue()
  const feed = (change: Partial<State>) => feedState(handle, change)

  return { wrapper: mount(ConnectionBar, withI18n), feed, connect, disconnect, listPorts }
}

it('shows the state, the vehicle and why the last attempt failed, as text', async () => {
  const { wrapper, feed } = barWithSpies()
  expect(wrapper.get('#connection').text()).toBe('disconnected')
  // A screen reader is told when the connection changes.
  expect(wrapper.get('#connection').attributes('role')).toBe('status')

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } }, error: '<oops>', notice: 'The backend restarted' })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#connection').text()
  expect(text).toContain('connected · system 1/1 · QUADROTOR · ARDUPILOTMEGA')
  expect(text).toContain('<oops>')
  expect(text).toContain('The backend restarted')
  expect(wrapper.get('#connection .badge').classes()).toContain('connected')
  expect(wrapper.find('#connection oops').exists()).toBe(false)
})

it('says that the link is being brought back, which try this is and when the next is, with the vehicle still shown', async () => {
  const { wrapper, feed } = barWithSpies()

  feed({ connection: { state: 'reconnecting', vehicle: { ...VEHICLE }, attempt: 3, nextRetryMs: 3500 } })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#connection').text()
  expect(text).toContain('reconnecting')
  expect(text).toContain('try 3, the next in 4 s')
  expect(text).toContain('QUADROTOR')
  expect(wrapper.get('#connection .badge').classes()).toContain('reconnecting')
})

it('says that a link that came back is the same vehicle, only when it is', async () => {
  const { wrapper, feed } = barWithSpies()

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE }, resumed: true } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connection').text()).toContain('reconnected to the same vehicle')

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connection').text()).not.toContain('same vehicle')
})

it('says nothing about tries when the link is up', async () => {
  const { wrapper, feed } = barWithSpies()

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#connection').text()).not.toContain('try ')
})

it('is made of the kit\'s controls, with the same ids and a primary Connect', () => {
  const { wrapper } = barWithSpies()

  for (const id of ['#transport', '#device', '#baud']) {
    expect(wrapper.get(id).classes(), id).toContain('kit-select')
  }

  for (const id of ['#host', '#port']) {
    expect(wrapper.get(id).classes(), id).toContain('kit-input')
  }
  expect(wrapper.get('#connect-button').classes()).toEqual(expect.arrayContaining(['kit-button', 'primary']))
  expect(wrapper.get('#connect-button').attributes('type')).toBe('submit')
  expect(wrapper.get('#disconnect-button').attributes('type')).toBe('button')
})

it('lists the four transports, the baud rates, and says when there are no serial ports', () => {
  const { wrapper } = barWithSpies()

  expect(wrapper.findAll('#transport option').map(option => option.text())).toEqual(['Simulator', 'UDP', 'TCP', 'Serial'])
  expect(wrapper.findAll('#baud option').map(option => option.text())).toEqual(['57600', '115200', '230400', '460800', '921600'])
  expect(wrapper.findAll('#device option').map(option => option.text())).toEqual(['No serial ports'])
})

it('lists the serial ports the backend\'s machine has, by description when it has one', async () => {
  const { wrapper, feed } = barWithSpies()

  feed({ ports: [{ path: '/dev/ttyACM0', description: 'USB 1209:5741 ArduPilot' }, { path: '/dev/ttyAMA0' }] })
  await wrapper.vm.$nextTick()

  expect(wrapper.findAll('#device option').map(option => option.text()))
    .toEqual(['/dev/ttyACM0 (USB 1209:5741 ArduPilot)', '/dev/ttyAMA0'])
})

it('connects to the simulator by default, and to what is typed for TCP', async () => {
  const { wrapper, connect } = barWithSpies()

  await wrapper.get('#connect').trigger('submit')
  expect(connect).toHaveBeenLastCalledWith({ transport: 'simulator' })
  await wrapper.get('#transport').setValue('tcp')
  await wrapper.get('#host').setValue(' 127.0.0.1 ')
  await wrapper.get('#port').setValue('5760')
  await wrapper.get('#connect').trigger('submit')

  expect(connect).toHaveBeenLastCalledWith({ transport: 'tcp', host: '127.0.0.1', port: 5760 })
})

it('shows device and baud rate for serial, lists the ports, and connects with them', async () => {
  const { wrapper, feed, connect, listPorts } = barWithSpies()
  expect(wrapper.get('#device').attributes('hidden')).toBeDefined()
  expect(wrapper.get('#host').attributes('hidden')).toBeUndefined()

  await wrapper.get('#transport').setValue('serial')
  expect(listPorts).toHaveBeenCalledTimes(1)
  expect(wrapper.get('#device').attributes('hidden')).toBeUndefined()
  expect(wrapper.get('#baud').attributes('hidden')).toBeUndefined()
  expect(wrapper.get('#host').attributes('hidden')).toBeDefined()
  expect(wrapper.get('#port').attributes('hidden')).toBeDefined()
  expect(wrapper.get('#device').text()).toBe('No serial ports')

  feed({ ports: [{ path: '/dev/ttyACM0', description: 'Pixhawk' }, { path: '/dev/ttyUSB0' }] })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#device').text()).toContain('/dev/ttyACM0 (Pixhawk)')
  await wrapper.get('#baud').setValue('57600')
  await wrapper.get('#connect').trigger('submit')

  expect(connect).toHaveBeenLastCalledWith({ transport: 'serial', device: '/dev/ttyACM0', baud: 57600 })
})

it('keeps the chosen device when the ports are listed again', async () => {
  const { wrapper, feed, connect } = barWithSpies()
  feed({ ports: [{ path: 'a' }, { path: 'b' }] })
  await wrapper.get('#transport').setValue('serial')
  await wrapper.get('#device').setValue('b')

  feed({ ports: [{ path: 'a' }, { path: 'b' }, { path: 'c' }] })
  await wrapper.vm.$nextTick()
  await wrapper.get('#connect').trigger('submit')

  expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({ device: 'b' }))
})

it('offers Disconnect only while connected', async () => {
  const { wrapper, feed, disconnect } = barWithSpies()
  expect(wrapper.get('#disconnect-button').attributes('disabled')).toBeDefined()
  // The mock backend's first events (the connection is disconnected) arrive before the state is changed here.
  await flushPromises()

  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  await wrapper.get('#disconnect-button').trigger('click')

  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(wrapper.get('#disconnect-button').attributes('disabled')).toBeUndefined()
})
