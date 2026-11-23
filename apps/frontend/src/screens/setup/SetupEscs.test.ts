// The ESCs page against the mock backend: the ESC protocol as a named choice and the spin thresholds (out of order nothing is
// written), writes through the page's one question that are refused while the vehicle is armed or may be, and "reboot needed"
// after a protocol is written.
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
import SetupEscs from './SetupEscs.vue'

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
  mounted = mount(defineComponent({ render: () => h(SetupEscs) }), { global: { plugins: [i18n, router] } })
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

it('shows no protocol, and no field for it, when the vehicle does not have MOT_PWM_TYPE', async () => {
  const rig = await page(SETUP_PARAMS.filter(param => param.id !== 'MOT_PWM_TYPE'))

  expect(rig.wrapper.findComponent(EnumField).exists()).toBe(false)
  // the label points at nothing that does not exist
  expect(rig.wrapper.get('.setup-esc label').attributes('for')).toBeUndefined()
  expect(rig.wrapper.get('#setup-protocol-unknown').text()).toContain('does not report its ESC protocol')
  expect(rig.wrapper.text()).not.toContain('Normal')
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
  await rig.wrapper.get('#setup-escs-write').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('MOT_PWM_TYPE 0 → 5')
  expect(valueOf(rig, 'MOT_PWM_TYPE')).toBe(5)
  expect(rig.wrapper.get('#setup-reboot').text()).toContain('Reboot needed')
  expect(rig.control.rebootsSent?.()).toBe(0)
})

/**
 * Types a spin threshold and leaves the field (a number field takes what was typed when it is left).
 *
 * @param rig the page's rig
 * @param id the parameter
 * @param text what is typed
 */
async function typeSpin(rig: Rig, id: string, text: string): Promise<void> {
  const field = rig.wrapper.get(`[data-spin="${id}"] input`)
  await field.setValue(text)
  await field.trigger('blur')
  await flushPromises()
}

it('takes a spin threshold in its range, ignores what is not one, and writes it', async () => {
  const rig = await page()
  await typeSpin(rig, 'MOT_SPIN_MAX', 'abc')
  await typeSpin(rig, 'MOT_SPIN_MAX', '1.5')
  // 0.85 is a fraction, but below the 0.9 that ArduPilot documents for the highest spin
  await typeSpin(rig, 'MOT_SPIN_MAX', '0.85')
  expect(rig.wrapper.get('.setup-writes').text()).toBe('')
  await typeSpin(rig, 'MOT_SPIN_MAX', '0.9')
  expect(rig.wrapper.get('[data-spin="MOT_SPIN_MAX"] input').attributes('aria-invalid')).toBeUndefined()
  expect(rig.wrapper.get('.setup-writes').text()).toBe('MOT_SPIN_MAX')
  await rig.wrapper.get('#setup-escs-write').trigger('click')
  await flushPromises()

  // (a 32-bit float on the vehicle)
  expect(valueOf(rig, 'MOT_SPIN_MAX')).toBeCloseTo(0.9, 5)
  // a spin threshold takes effect at once: no reboot is asked for
  expect(rig.wrapper.find('#setup-reboot').exists()).toBe(false)
})

it('marks a spin value out of its range, says the limit, and keeps the text as typed', async () => {
  const rig = await page()
  const field = rig.wrapper.get<HTMLInputElement>('[data-spin="MOT_SPIN_MAX"] input')
  await typeSpin(rig, 'MOT_SPIN_MAX', '0.85')

  expect(field.element.value).toBe('0.85')
  expect(field.attributes('aria-invalid')).toBe('true')
  expect(rig.wrapper.get(`[id="${field.attributes('aria-describedby')}"]`).text()).toBe('At least 0.9.')
  // the range is in the help line next to it too
  expect(rig.wrapper.get('[data-spin="MOT_SPIN_MAX"]').text()).toContain('from 0.9 to 1')
  await typeSpin(rig, 'MOT_SPIN_MAX', '0.9')
  expect(field.attributes('aria-invalid')).toBeUndefined()
})

it('says a spin threshold is modified, then verified once it is written and read back', async () => {
  const rig = await page()
  const status = () => rig.wrapper.get('[data-param="MOT_SPIN_MIN"]')
  expect(status().attributes('data-status')).toBe('vehicle')
  await typeSpin(rig, 'MOT_SPIN_MIN', '0.12')

  expect(status().attributes('data-status')).toBe('draft')
  expect(status().get('.status').text()).toBe('Modified: the vehicle has 0.15.')
  await rig.wrapper.get('#setup-escs-write').trigger('click')
  await vi.waitFor(() => expect(status().attributes('data-status')).toBe('verified'))
  expect(status().get('.status').text()).toBe('Verified: the vehicle reads 0.12 back.')
})

it('writes nothing while the thresholds are out of order, and says so', async () => {
  const rig = await page()
  // the vehicle has 0.1, 0.15 and 0.95: arm equal to min is valid (ArduPilot refuses only arm above min)
  await typeSpin(rig, 'MOT_SPIN_ARM', '0.15')
  expect(rig.wrapper.find('#setup-spin-order').exists()).toBe(false)
  expect(rig.wrapper.get('#setup-escs-write').attributes('disabled')).toBeUndefined()
  // arm above min is wrong
  await typeSpin(rig, 'MOT_SPIN_ARM', '0.2')

  expect(rig.wrapper.get('#setup-spin-order').text()).toContain('must not fall')
  expect(rig.wrapper.get('#setup-escs-write').attributes('disabled')).toBeDefined()
  expect(rig.asked).toHaveLength(0)
  // set in order again: it can be written
  await typeSpin(rig, 'MOT_SPIN_MIN', '0.25')
  expect(rig.wrapper.find('#setup-spin-order').exists()).toBe(false)
  expect(rig.wrapper.get('#setup-escs-write').attributes('disabled')).toBeUndefined()
})

it('refuses to write while the vehicle is armed, or may be, and says why', async () => {
  const rig = await page()
  await typeSpin(rig, 'MOT_SPIN_MAX', '0.9')
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(rig.wrapper.get('#setup-escs-blocked').text()).toContain('The vehicle is armed')
  expect(rig.wrapper.get('#setup-escs-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-spin="MOT_SPIN_MAX"] input').attributes('disabled')).toBeDefined()
  // the armed state is not known (no telemetry): it counts as armed
  feed(rig.handle, { telemetry: null })
  await flushPromises()
  expect(rig.wrapper.get('#setup-escs-write').attributes('disabled')).toBeDefined()
  expect(rig.asked).toHaveLength(0)
})
