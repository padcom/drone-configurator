// The Motors page against the mock backend: the live outputs as a table that is only read, the ESC protocol as a named choice
// and the spin thresholds (out of order nothing is written), writes through the page's one question that are refused while the
// vehicle is armed or may be, and "reboot needed" after a protocol is written. Nothing on the page sends anything to a motor.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import EnumField from '@/components/fields/EnumField.vue'
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

/**
 * The value of a parameter on the vehicle, as the interface has it.
 *
 * @param rig the page's rig
 * @param id the parameter
 * @returns its value
 */
function valueOf(rig: Rig, id: string): number | undefined {
  return rig.handle.parameters.params.value.find(param => param.id === id)?.value
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

it('shows no protocol, and no field for it, when the vehicle does not have MOT_PWM_TYPE', async () => {
  const rig = await page(SETUP_PARAMS.filter(param => param.id !== 'MOT_PWM_TYPE'))

  expect(rig.wrapper.findComponent(EnumField).exists()).toBe(false)
  expect(rig.wrapper.get('#setup-protocol-unknown').text()).toContain('does not report its ESC protocol')
  expect(rig.wrapper.text()).not.toContain('Normal')
})

it('has nothing on the page that is a button other than the write and the revert of the parameters', async () => {
  const { wrapper } = await page()

  expect(wrapper.findAll('button').map(button => button.attributes('id'))).toEqual(['setup-motors-revert', 'setup-motors-write'])
})

it('names the ESC protocol, and shows a value it has no name for as its number', async () => {
  const rig = await page()
  expect(rig.wrapper.findAll('input')[0]?.element.value).toBe('Normal')

  rig.wrapper.findComponent(EnumField).vm.$emit('update:modelValue', 6)
  await flushPromises()
  expect(rig.wrapper.findAll('input')[0]?.element.value).toBe('DShot600')
  rig.wrapper.findComponent(EnumField).vm.$emit('update:modelValue', 42)
  await flushPromises()
  expect(rig.wrapper.findAll('input')[0]?.element.value).toBe('42')
})

it('writes a changed protocol after one question that names it, then says a reboot is needed, and reboots nothing', async () => {
  const rig = await page()
  rig.wrapper.findComponent(EnumField).vm.$emit('update:modelValue', 5)
  await flushPromises()
  expect(rig.wrapper.get('.setup-writes').text()).toBe('MOT_PWM_TYPE')
  await rig.wrapper.get('#setup-motors-write').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('MOT_PWM_TYPE 0 → 5')
  expect(valueOf(rig, 'MOT_PWM_TYPE')).toBe(5)
  expect(rig.wrapper.get('#setup-reboot').text()).toContain('Reboot needed')
  expect(rig.control.rebootsSent?.()).toBe(0)
})

it('takes a spin threshold as a fraction, ignores what is not one, and writes it', async () => {
  const rig = await page()
  const field = rig.wrapper.get<HTMLInputElement>('[data-spin="MOT_SPIN_MAX"] input')
  await field.setValue('abc')
  await field.setValue('1.5')
  // 0.85 is a fraction, but below the 0.9 that ArduPilot documents for the highest spin
  await field.setValue('0.85')
  expect(rig.wrapper.get('.setup-writes').text()).toBe('')
  // the field is marked, with the range in words that the field is described by, and the text stays as typed
  expect(field.element.value).toBe('0.85')
  expect(field.attributes('aria-invalid')).toBe('true')
  const describedBy = field.attributes('aria-describedby') ?? ''
  expect(rig.wrapper.get(`[id="${describedBy}"]`).text()).toContain('from 0.9 to 1')
  expect(rig.wrapper.get(`[id="${describedBy}"]`).text()).toContain('not written')
  await field.trigger('blur')
  expect(field.element.value).toBe('0.85')
  expect(field.attributes('aria-invalid')).toBe('true')
  await field.setValue('0.9')
  expect(field.attributes('aria-invalid')).toBeUndefined()
  expect(field.attributes('aria-describedby')).toBeUndefined()
  expect(rig.wrapper.get('.setup-writes').text()).toBe('MOT_SPIN_MAX')
  await rig.wrapper.get('#setup-motors-write').trigger('click')
  await flushPromises()

  // (a 32-bit float on the vehicle)
  expect(valueOf(rig, 'MOT_SPIN_MAX')).toBeCloseTo(0.9, 5)
  // a spin threshold takes effect at once: no reboot is asked for
  expect(rig.wrapper.find('#setup-reboot').exists()).toBe(false)
})

it('writes nothing while the thresholds are out of order, and says so', async () => {
  const rig = await page()
  // the vehicle has 0.1, 0.15 and 0.95: arm equal to min is valid (ArduPilot refuses only arm above min)
  await rig.wrapper.get('[data-spin="MOT_SPIN_ARM"] input').setValue('0.15')
  expect(rig.wrapper.find('#setup-spin-order').exists()).toBe(false)
  expect(rig.wrapper.get('#setup-motors-write').attributes('disabled')).toBeUndefined()
  // arm above min is wrong
  await rig.wrapper.get('[data-spin="MOT_SPIN_ARM"] input').setValue('0.2')

  expect(rig.wrapper.get('#setup-spin-order').text()).toContain('must not fall')
  expect(rig.wrapper.get('#setup-motors-write').attributes('disabled')).toBeDefined()
  expect(rig.asked).toHaveLength(0)
  // set in order again: it can be written
  await rig.wrapper.get('[data-spin="MOT_SPIN_MIN"] input').setValue('0.25')
  expect(rig.wrapper.find('#setup-spin-order').exists()).toBe(false)
  expect(rig.wrapper.get('#setup-motors-write').attributes('disabled')).toBeUndefined()
})

it('refuses to write while the vehicle is armed, or may be, and says why; the table goes on', async () => {
  const rig = await page()
  await rig.wrapper.get('[data-spin="MOT_SPIN_MAX"] input').setValue('0.9')
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(rig.wrapper.get('#setup-motors-blocked').text()).toContain('The vehicle is armed')
  expect(rig.wrapper.get('#setup-motors-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-spin="MOT_SPIN_MAX"] input').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.find('#setup-outputs').exists()).toBe(true)
  // the armed state is not known (no telemetry): it counts as armed
  feed(rig.handle, { telemetry: null })
  await flushPromises()
  expect(rig.wrapper.get('#setup-motors-write').attributes('disabled')).toBeDefined()
  expect(rig.asked).toHaveLength(0)
})
