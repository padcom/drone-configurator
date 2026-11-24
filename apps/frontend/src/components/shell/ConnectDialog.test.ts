import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConnectDialog from './ConnectDialog.vue'
import { VEHICLE } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import type { State } from '@/state/state'
import { feed as feedState, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { useConnectDialog } from '@/composables/useConnectDialog'

afterEach(async () => {
  useConnectDialog().hide()
  await flushPromises()
  // The dialog gives the focus back a task after it has closed: that task is let run here, while the page is still there.
  await new Promise<void>(resolve => {
    setTimeout(resolve, 0)
  })
  document.body.innerHTML = ''
})

/**
 * Opens the dialog on a fresh Configurator whose actions are spies.
 *
 * @param last what the settings hold as the last connection, if anything
 * @returns the component, `feed` (changes the state the way the backend would) and the spies
 */
async function openDialog(last?: string) {
  const handle = createConfigurator(mockBackend())
  const connect = vi.spyOn(handle.vehicle, 'connect').mockResolvedValue()
  const listPorts = vi.spyOn(handle.vehicle, 'listPorts').mockResolvedValue()
  const setUi = vi.spyOn(handle.settings, 'setUi').mockResolvedValue()
  vi.spyOn(handle.settings, 'uiValue').mockReturnValue(last)
  const feed = (change: Partial<State>) => feedState(handle, change)
  const wrapper = mount(ConnectDialog, { ...withI18n, attachTo: document.body })
  await flushPromises()
  useConnectDialog().show()
  await wrapper.vm.$nextTick()

  return { wrapper, feed, connect, listPorts, setUi }
}

it('is shut until it is asked for, and then shows the four kinds of link as tabs, UDP chosen', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ConnectDialog, { ...withI18n, attachTo: document.body })
  await flushPromises()
  expect(handle).toBeDefined()
  expect(wrapper.find('dialog').exists()).toBe(false)

  useConnectDialog().show()
  await wrapper.vm.$nextTick()

  expect(wrapper.get('h2').text()).toBe('Connect to a vehicle')
  const tabs = wrapper.findAll('#transport button')
  expect(tabs.map(tab => tab.text())).toEqual(['UDP', 'TCP', 'Serial', 'Simulator'])
  expect(tabs.map(tab => tab.attributes('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
  expect(wrapper.get('#transport').attributes('role')).toBe('group')
})

it('has a primary Connect that submits the form and is where the focus starts', async () => {
  const { wrapper } = await openDialog()
  const button = wrapper.get('#connect-button')

  expect(button.classes()).toEqual(expect.arrayContaining(['kit-button', 'primary']))
  expect(button.attributes('type')).toBe('submit')
  expect(button.attributes('form')).toBe('connect')
  expect(button.attributes('data-initial-focus')).toBeDefined()
  expect(wrapper.get('#connect-cancel').attributes('type')).toBe('button')
})

it('listens on UDP at the default port before any connection was made, and connects to what is typed for TCP', async () => {
  const { wrapper, connect } = await openDialog()

  await wrapper.get('#connect').trigger('submit')
  expect(connect).toHaveBeenLastCalledWith({ transport: 'udp' })
  await wrapper.get('#transport-tcp').trigger('click')
  expect(wrapper.get('#host').classes()).toContain('kit-input')
  await wrapper.get('#host').setValue(' 127.0.0.1 ')
  await wrapper.get('#port').setValue('5760')
  await wrapper.get('#connect').trigger('submit')

  expect(connect).toHaveBeenLastCalledWith({ transport: 'tcp', host: '127.0.0.1', port: 5760 })
})

it('shows the host and port for UDP and TCP, the device and baud rate for serial, and neither for the simulator', async () => {
  const { wrapper } = await openDialog()
  await wrapper.get('#transport-simulator').trigger('click')
  expect(wrapper.find('#host').exists() || wrapper.find('#device').exists()).toBe(false)

  const present = (...ids: string[]) => ids.map(id => wrapper.find(id).exists())
  await wrapper.get('#transport-udp').trigger('click')
  expect(present('#host', '#port', '#device')).toEqual([true, true, false])

  await wrapper.get('#transport-serial').trigger('click')
  expect(present('#host', '#device', '#baud')).toEqual([false, true, true])
})

it('lists the baud rates after trying the common ones, and says when there are no serial ports', async () => {
  const { wrapper } = await openDialog()
  await wrapper.get('#transport-serial').trigger('click')

  expect(wrapper.findAll('#baud option').map(option => option.text()))
    .toEqual(['Try the common rates', '57600', '115200', '230400', '460800', '921600'])
  expect(wrapper.findAll('#device option').map(option => option.text())).toEqual(['Find the autopilot'])
  expect(wrapper.text()).toContain('No serial ports')
})

it('leaves the serial port and the rate to the backend unless they are chosen, naming the port it would use', async () => {
  const { wrapper, feed, connect } = await openDialog()
  await wrapper.get('#transport-serial').trigger('click')
  const cube = { path: '/dev/ttyACM0', description: 'USB 2dae:1016', board: 'CubePilot', likely: true }
  feed({ ports: [{ path: '/dev/ttyS0' }, cube] })
  await wrapper.vm.$nextTick()

  expect(wrapper.findAll('#device option').map(option => option.text()))
    .toEqual(['Find the autopilot (now /dev/ttyACM0)', '/dev/ttyS0', '/dev/ttyACM0 (CubePilot)'])
  await wrapper.get('#connect').trigger('submit')
  expect(connect).toHaveBeenLastCalledWith({ transport: 'serial' })
})

it('says what to try next when the backend found no autopilot or no rate', async () => {
  const { wrapper, feed } = await openDialog()
  await wrapper.get('#transport-serial').trigger('click')

  feed({ connection: { state: 'disconnected', errorCode: 'NO_MAVLINK' }, error: 'serial /dev/ttyACM0: no MAVLink' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connect-error').text()).toContain('or choose its baud rate')

  feed({ connection: { state: 'disconnected', errorCode: 'PORT_GONE' }, error: 'the port went away' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connect-error').text()).toContain('plug the flight controller back in')
})

it('lists the serial ports when serial is chosen, by description when there is one, and connects with them', async () => {
  const { wrapper, feed, connect, listPorts } = await openDialog()
  await wrapper.get('#transport-serial').trigger('click')
  expect(listPorts).toHaveBeenCalledTimes(1)

  feed({ ports: [{ path: '/dev/ttyACM0', description: 'Pixhawk' }, { path: '/dev/ttyUSB0' }] })
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('#device option').map(option => option.text()))
    .toEqual(['Find the autopilot', '/dev/ttyACM0 (Pixhawk)', '/dev/ttyUSB0'])
  await wrapper.get('#device').setValue('/dev/ttyACM0')
  await wrapper.get('#baud').setValue('57600')
  await wrapper.get('#connect').trigger('submit')

  expect(connect).toHaveBeenLastCalledWith({ transport: 'serial', device: '/dev/ttyACM0', baud: 57600 })
})

it('keeps the chosen device when the ports are listed again', async () => {
  const { wrapper, feed, connect } = await openDialog()
  feed({ ports: [{ path: 'a' }, { path: 'b' }] })
  await wrapper.get('#transport-serial').trigger('click')
  await wrapper.get('#device').setValue('b')

  feed({ ports: [{ path: 'a' }, { path: 'b' }, { path: 'c' }] })
  await wrapper.vm.$nextTick()
  await wrapper.get('#connect').trigger('submit')

  expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({ device: 'b' }))
})

it('keeps what was connected to as the last connection only once the link is up, not when Connect is pressed', async () => {
  const { wrapper, setUi, feed } = await openDialog()
  await wrapper.get('#transport-tcp').trigger('click')
  await wrapper.get('#host').setValue('10.0.0.5')
  await wrapper.get('#port').setValue('5760')

  await wrapper.get('#connect').trigger('submit')
  expect(setUi).not.toHaveBeenCalled()
  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  expect(setUi).toHaveBeenCalledWith('connect.last', JSON.stringify({
    transport: 'tcp', host: '10.0.0.5', port: '5760', device: '', baud: '',
  }))
})

it('keeps nothing when the attempt fails', async () => {
  const { wrapper, setUi, feed } = await openDialog()
  await wrapper.get('#transport-tcp').trigger('click')
  await wrapper.get('#host').setValue('10.0.0.99')

  await wrapper.get('#connect').trigger('submit')
  feed({ error: 'no heartbeat from tcp 10.0.0.99:5760' })
  await wrapper.vm.$nextTick()

  expect(setUi).not.toHaveBeenCalled()
})

it('takes from the last connection the five fields and nothing else', async () => {
  const last = '{"transport":"tcp","host":"h","port":"1","device":"","baud":"115200","__proto__":{"polluted":true},"extra":1}'
  const { wrapper } = await openDialog(last)
  await wrapper.get('#connect').trigger('submit')

  expect(wrapper.get<HTMLInputElement>('#host').element.value).toBe('h')
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

it('opens on the last connection that was made', async () => {
  const last = JSON.stringify({ transport: 'tcp', host: '10.0.0.5', port: '5760', device: '', baud: '115200' })
  const { wrapper } = await openDialog(last)

  expect(wrapper.get('#transport-tcp').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get<HTMLInputElement>('#host').element.value).toBe('10.0.0.5')
  expect(wrapper.get<HTMLInputElement>('#port').element.value).toBe('5760')
})

it('says why an attempt failed, and what to try next, in the words of the kind of link', async () => {
  const { wrapper, feed } = await openDialog()
  await wrapper.get('#transport-udp').trigger('click')
  expect(wrapper.find('#connect-error').exists()).toBe(false)

  feed({ error: 'no heartbeat from udp 127.0.0.1:14550' })
  await wrapper.vm.$nextTick()

  // An alert: read out at once, although it came up with its words in it.
  expect(wrapper.get('#connect-error').attributes('role')).toBe('alert')
  const text = wrapper.get('#connect-error').text()
  expect(text).toContain('no heartbeat from udp 127.0.0.1:14550')
  expect(text).toContain('Check that the vehicle or the simulator sends to this host and port')
})

it('does not show an old failure again when the dialog is opened later', async () => {
  const { wrapper, feed } = await openDialog()
  feed({ error: 'no heartbeat from udp 127.0.0.1:14550' })
  await wrapper.vm.$nextTick()
  expect(wrapper.find('#connect-error').exists()).toBe(true)

  await wrapper.get('#connect-cancel').trigger('click')
  useConnectDialog().show()
  await wrapper.vm.$nextTick()
  expect(wrapper.find('#connect-error').exists()).toBe(false)

  feed({ error: 'another failure' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#connect-error').text()).toContain('another failure')
})

it('shows a failure after Connect even when it has the same words as the old one that was hidden', async () => {
  const { wrapper, feed } = await openDialog()
  feed({ error: 'no heartbeat from udp 127.0.0.1:14550' })
  await wrapper.get('#connect-cancel').trigger('click')
  useConnectDialog().show()
  await wrapper.vm.$nextTick()
  expect(wrapper.find('#connect-error').exists()).toBe(false)

  await wrapper.get('#connect').trigger('submit')
  feed({ connection: { state: 'connecting' }, error: undefined })
  feed({ connection: { state: 'disconnected' }, error: 'no heartbeat from udp 127.0.0.1:14550' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#connect-error').text()).toContain('no heartbeat from udp 127.0.0.1:14550')
})

it('closes by itself when the link is up, and with Cancel', async () => {
  const { wrapper, feed } = await openDialog()
  await wrapper.get('#connect-cancel').trigger('click')
  expect(useConnectDialog().open.value).toBe(false)

  useConnectDialog().show()
  await wrapper.vm.$nextTick()
  feed({ connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  expect(useConnectDialog().open.value).toBe(false)
  expect(wrapper.find('dialog').exists()).toBe(false)
})
