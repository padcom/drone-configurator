// The Motors page against the mock backend: the live outputs as a table that is only read, beside the motor test (its own
// section, SetupMotorTest); the page writes no parameter (the ESCs' page does).
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupMotors from './SetupMotors.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** What a test has: the page, the Configurator, the mock's controls, and the questions asked. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
  asked: string[]
}

/**
 * The page over a connected simulated vehicle that was set up and is disarmed.
 *
 * @param params the parameters of the vehicle
 * @returns the page and what drives it
 */
async function page(params = SETUP_PARAMS): Promise<Rig> {
  const control: MockControl = {}
  const asked: string[] = []
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params, control }), question => {
    asked.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(SetupMotors) }), { global: { plugins: [i18n, router] } })
  await flushPromises()

  return { wrapper: mounted, handle, control, asked }
}

it('shows the outputs the vehicle uses, by number, with their pulses, and nothing before it has reported them', async () => {
  const { wrapper, handle } = await page()

  expect(wrapper.findAll('#setup-outputs tr').map(row => row.attributes('data-output'))).toEqual(['1', '2', '3', '4'])
  expect(wrapper.get('[data-output="1"]').text()).toContain('Output 1')
  expect(wrapper.get('[data-output="1"]').text()).toContain('1000 µs')
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, servo: undefined } })
  await flushPromises()
  expect(wrapper.find('#setup-outputs').exists()).toBe(false)
  expect(wrapper.text()).toContain('No outputs yet')
})

it('numbers an output of a second port from 17, and leaves out an output that is not used', async () => {
  const { wrapper, handle } = await page()
  const servo = { ports: [{ port: 0, outputs: [1100, 0, 1500] }, { port: 1, outputs: [1250] }], ageMs: 10 }
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, servo } })
  await flushPromises()

  expect(wrapper.findAll('#setup-outputs tr').map(row => row.attributes('data-output'))).toEqual(['1', '3', '17'])
})

it('stops showing the outputs when the vehicle has stopped reporting them, and says so', async () => {
  const { wrapper, handle } = await page()
  const servo = { ports: [{ port: 0, outputs: [1100, 1500] }], ageMs: 3001 }
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, servo } })
  await flushPromises()

  expect(wrapper.find('#setup-outputs').exists()).toBe(false)
  expect(wrapper.get('#setup-outputs-old').text()).toContain('stopped reporting')
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false, servo: { ...servo, ageMs: 500 } } })
  await flushPromises()
  expect(wrapper.find('#setup-outputs-old').exists()).toBe(false)
  expect(wrapper.findAll('#setup-outputs tr')).toHaveLength(2)
})

it('has no button that sends anything to a motor but the held ones of the motor test, locked at first', async () => {
  const { wrapper } = await page()
  const others = wrapper.findAll('button').filter(button => !button.classes().includes('motor-test-motor'))

  expect(others).toEqual([])
  expect(wrapper.findAll('.motor-test-motor').map(button => button.attributes('disabled'))).toEqual(['', '', '', ''])
})
