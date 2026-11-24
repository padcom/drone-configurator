// The Serial bridge page and the top bar's badge against the mock backend: a port is chosen and the bridge started; while it
// runs the page says which port is locked, with Stop beside it, and the top bar says it on every screen; Stop gives it back; a
// vehicle that is armed or not known to be disarmed cannot start one (the button is locked, and the backend's refusal is said).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { type Component } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SerialBridgeBadge from '@/components/shell/SerialBridgeBadge.vue'
import SetupBridge from './SetupBridge.vue'

const mounted: VueWrapper[] = []

afterEach(() => {
  setLanguage('en')
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
})

/** What a test has: the page, the top bar's badge, the Configurator, and the mock's controls. */
interface Rig {
  page: VueWrapper
  badge: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
}

/**
 * Mounts a component under the router.
 *
 * @param component the component
 * @returns it, mounted
 */
async function mountAt(component: Component): Promise<VueWrapper> {
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/bridge')
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [i18n, router] } })
  mounted.push(wrapper)
  await flushPromises()

  return wrapper
}

/**
 * The page and the badge over a connected simulated vehicle, disarmed unless told otherwise.
 *
 * @param armed what the telemetry says of the armed state
 * @returns the rig
 */
async function open(armed = false): Promise<Rig> {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS, control }))
  control.armed?.(armed)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed } })

  return { page: await mountAt(SetupBridge), badge: await mountAt(SerialBridgeBadge), handle, control }
}

/**
 * Starts a bridge from the page, as chosen there.
 *
 * @param rig the rig
 */
async function startIt(rig: Rig): Promise<void> {
  await rig.page.get('#setup-bridge-start').trigger('click')
  await vi.waitFor(() => expect(rig.page.find('#setup-bridge-locked').exists()).toBe(true))
  await vi.waitFor(() => expect(rig.handle.serialBridge.pending.value).toBe(false))
}

it('offers the ports by their names, the speeds and the local port, and starts nothing by itself', async () => {
  const rig = await open()
  const devices = rig.page.findAll('[data-bridge="device"] option').map(option => option.text())

  expect(devices.slice(0, 5)).toEqual(['GPS 1', 'GPS 2', 'Telemetry 1', 'Telemetry 2', 'Serial 0'])
  expect(rig.page.findAll('[data-bridge="baud"] option')[0]?.text()).toBe('As it is')
  expect((rig.page.get('[data-bridge="port"]').element as HTMLInputElement).value).toBe('5770')
  expect(rig.control.serialBridge?.state().state).toBe('off')
  expect(rig.badge.find('#serial-bridge-badge').exists()).toBe(false)
})

it('starts the bridge as chosen, says which port is locked, and the top bar says it too', async () => {
  const rig = await open()
  await rig.page.get('[data-bridge="device"]').setValue('TELEM2')
  await rig.page.get('[data-bridge="baud"]').setValue('57600')
  await rig.page.get('[data-bridge="port"]').setValue('6001')
  await startIt(rig)

  expect(rig.control.serialBridge?.state()).toMatchObject({ state: 'running', device: 'TELEM2', baudrate: 57600, port: 6001 })
  expect(rig.page.get('#setup-bridge-locked').text()).toContain('Telemetry 2 is locked for the bridge until you stop it')
  expect(rig.page.get('#setup-bridge-locked').text()).toContain('127.0.0.1:6001')
  expect(rig.page.get('#setup-bridge-client').text()).toContain('None yet')
  await vi.waitFor(() => expect(rig.badge.find('#serial-bridge-badge').exists()).toBe(true))
  expect(rig.badge.get('#serial-bridge-badge').text()).toBe('Telemetry 2 locked')
  expect(rig.badge.get('#serial-bridge-badge').attributes('href')).toContain('/setup/bridge')
})

it('shows the program and the bytes each way as the backend says them', async () => {
  const rig = await open()
  await startIt(rig)
  rig.control.serialBridge?.program(true)
  rig.control.serialBridge?.bytes(12, 345)
  await flushPromises()

  expect(rig.page.get('#setup-bridge-client').text()).toBe('Connected from 127.0.0.1:50123')
  expect(rig.page.get('#setup-bridge-to').text()).toBe('12')
  expect(rig.page.get('#setup-bridge-from').text()).toBe('345')
})

it('gives the port back on Stop, and says so; the badge goes', async () => {
  const rig = await open()
  await startIt(rig)
  await rig.page.get('#setup-bridge-stop').trigger('click')
  await vi.waitFor(() => expect(rig.page.find('#setup-bridge-locked').exists()).toBe(false))

  expect(rig.control.serialBridge?.released()).toBe(1)
  expect(rig.page.get('#setup-bridge-said').text()).toBe('The bridge was stopped. GPS 1 is the vehicle\'s own again.')
  expect(rig.badge.find('#serial-bridge-badge').exists()).toBe(false)
})

it('says how a bridge that ended by itself ended', async () => {
  const rig = await open()
  await startIt(rig)
  rig.control.serialBridge?.end('ARMED')
  await flushPromises()

  expect(rig.page.find('#setup-bridge-locked').exists()).toBe(false)
  expect(rig.page.get('#setup-bridge-said').text()).toContain('The vehicle armed, so the bridge ended.')
})

it('ends the bridge when the vehicle is disconnected', async () => {
  const rig = await open()
  await startIt(rig)
  await rig.handle.vehicle.disconnect()
  await flushPromises()

  expect(rig.control.serialBridge?.released()).toBe(1)
  expect(rig.badge.find('#serial-bridge-badge').exists()).toBe(false)
})

it('locks Start for an armed vehicle and for one whose state is not known, and says why', async () => {
  const armed = await open(true)
  expect(armed.page.get('#setup-bridge-start').attributes('disabled')).toBeDefined()
  expect(armed.page.get('#setup-bridge-blocked').text()).toContain('The vehicle is armed')

  const unknown = await open(false)
  // (no heartbeat for 10 s: the state is not known)
  feed(unknown.handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 10_000 } })
  await flushPromises()
  expect(unknown.page.get('#setup-bridge-start').attributes('disabled')).toBeDefined()
  expect(unknown.page.get('#setup-bridge-blocked').text()).toContain('not known')
})

it('says the backend\'s refusal, and a local port that is not one', async () => {
  const rig = await open()
  // (the page thinks the vehicle is disarmed; the backend knows better)
  rig.control.armed?.(true)
  await startIt(rig).catch(() => undefined)
  const said = 'Not started: the vehicle is armed. Disarm it first.'
  await vi.waitFor(() => expect(rig.page.get('#setup-bridge-said').text()).toBe(said))

  await rig.page.get('[data-bridge="port"]').setValue('70000')
  expect(rig.page.get('#setup-bridge-start').attributes('disabled')).toBeDefined()
  expect(rig.page.text()).toContain('a whole number from 1 to 65535')
})
