// The fields of a Setup page bound to its parameters (components/fields/PanelField.vue over composables/useParamPanel.ts), on the
// Failsafes page against the mock backend: what each says of its parameter, in words, as it goes from the vehicle's value to a
// draft, a write that is read back or not, and a conflict when the vehicle changes the parameter under a draft.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { i18n } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import SetupFailsafes from './SetupFailsafes.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/** The field of the low battery voltage. */
const LOW = '[data-param="BATT_LOW_VOLT"]'

/**
 * The Failsafes page over a connected simulated vehicle, disarmed.
 *
 * @param more more of the mock's options
 * @returns the page, the Configurator and the mock's controls
 */
async function page(more: MockOptions = {}) {
  const control: MockControl = {}
  const handle = createConfigurator(
    mockBackend({ telemetryMs: 600_000, params: SETUP_PARAMS, control, ...more }),
    () => Promise.resolve(true),
  )
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/home')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(SetupFailsafes) }), { global: { plugins: [i18n, router] } })
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

/**
 * Types a value into the low voltage and leaves the field.
 *
 * @param wrapper the page
 * @param text what is typed
 */
async function typeLow(wrapper: VueWrapper, text: string): Promise<void> {
  const input = wrapper.get(`${LOW} input`)
  await input.setValue(text)
  await input.trigger('blur')
  await flushPromises()
}

/**
 * What the low voltage's field says of it.
 *
 * @param wrapper the page
 * @returns the words
 */
const said = (wrapper: VueWrapper): string => wrapper.get(`${LOW} .status`).text()

it('says the vehicle\'s value, then a draft with what the vehicle has', async () => {
  const { wrapper } = await page()

  expect(said(wrapper)).toBe('The vehicle\'s value.')
  await typeLow(wrapper, '15')

  expect(said(wrapper)).toBe('Modified: the vehicle has 10.5 V.')
  expect(wrapper.get(LOW).attributes('data-status')).toBe('draft')
})

it('says a write that the vehicle read back is verified, with the value as typed (not the float\'s widened digits)', async () => {
  const { wrapper } = await page()
  await typeLow(wrapper, '10.8')
  await wrapper.get('#setup-failsafes-write').trigger('click')
  await vi.waitFor(() => expect(said(wrapper)).toBe('Verified: the vehicle reads 10.8 V back.'))

  expect(wrapper.get(LOW).attributes('data-status')).toBe('verified')
})

it('says a write the vehicle did not take is rejected, keeps the draft, and says why', async () => {
  const { wrapper } = await page({ rounding: ['BATT_LOW_VOLT'] })
  await typeLow(wrapper, '15.4')
  await wrapper.get('#setup-failsafes-write').trigger('click')
  await vi.waitFor(() => expect(wrapper.get(LOW).attributes('data-status')).toBe('rejected'))

  expect(said(wrapper)).toMatch(/^Rejected: /u)
  expect(wrapper.get<HTMLInputElement>(`${LOW} input`).element.value).toBe('15.4')
})

it('keeps a draft when the vehicle changes the parameter under it, and asks which to keep', async () => {
  const { wrapper, control } = await page()
  await typeLow(wrapper, '15')
  control.announce?.('BATT_LOW_VOLT', 14)
  await vi.waitFor(() => expect(wrapper.get(LOW).attributes('data-status')).toBe('conflict'))

  expect(wrapper.get<HTMLInputElement>(`${LOW} input`).element.value).toBe('15')
  expect(wrapper.get(`${LOW} .conflict-box`).text()).toContain('Your draft is 15 V')
  await wrapper.get(`${LOW} .conflict-box button`).trigger('click')
  await flushPromises()

  // (kept: the draft is over the vehicle's new value now, so it is no conflict)
  expect(said(wrapper)).toBe('Modified: the vehicle has 14 V.')
})

it('takes the vehicle\'s new value when asked: the draft is dropped', async () => {
  const { wrapper, control } = await page()
  await typeLow(wrapper, '15')
  control.announce?.('BATT_LOW_VOLT', 14)
  await vi.waitFor(() => expect(wrapper.find(`${LOW} .conflict-box`).exists()).toBe(true))
  await wrapper.findAll(`${LOW} .conflict-box button`)[1]!.trigger('click')
  await flushPromises()

  expect(said(wrapper)).toBe('The vehicle\'s value.')
  expect(wrapper.get<HTMLInputElement>(`${LOW} input`).element.value).toBe('14')
})

it('turns the fields off while the vehicle is armed', async () => {
  const { wrapper, handle } = await page()
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(wrapper.get(`${LOW} input`).attributes('disabled')).toBeDefined()
})
