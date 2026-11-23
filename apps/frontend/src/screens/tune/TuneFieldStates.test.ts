// What the rows of the Tune screen say of their parameters, as a bound field does (components/fields/FieldStatusLine.vue),
// against the mock backend: a slider (Tune's own control) goes from the vehicle's value to a draft, a write that is read back
// or not, and a conflict when the vehicle changes the parameter under the draft; a linked roll and pitch say it once, for
// both; a named choice is the bound field (components/fields/PanelField.vue) and the bits keep their boxes with the same words.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import type { Param } from '@/generated/app'
import { i18n } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import Tune from '../Tune.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/** The row of the yaw P. */
const YAW = '[data-tune="ATC_RAT_YAW_P"]'
/** The row of the linked roll and pitch P. */
const PAIR = '[data-tune="ATC_RAT_RLL_P"]'

/** The parameters, with the hover throttle's learning and AutoTune's axes. */
const PARAMS: Param[] = [
  ...SETUP_PARAMS,
  { id: 'MOT_THST_HOVER', index: 900, kind: 'real', type: 'REAL32', value: 0.3 },
  { id: 'MOT_HOVER_LEARN', index: 901, kind: 'int', type: 'INT8', value: 0 },
  { id: 'AUTOTUNE_AXES', index: 902, kind: 'int', type: 'INT8', value: 7 },
]

/**
 * The Tune screen over a connected simulated vehicle, disarmed; every question is answered yes.
 *
 * @param path the part
 * @param more more of the mock's options
 * @returns the screen, the Configurator and the mock's controls
 */
async function screen(path = '/tune/rate', more: MockOptions = {}) {
  const control: MockControl = {}
  const handle = createConfigurator(
    mockBackend({ telemetryMs: 600_000, params: PARAMS, control, ...more }),
    () => Promise.resolve(true),
  )
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push(path)
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(Tune) }), { global: { plugins: [i18n, router] } })
  await flushPromises()
  await flushPromises()

  return { wrapper: mounted, handle, control }
}

/**
 * Types a value in the field of a slider row.
 *
 * @param wrapper the screen
 * @param row the row
 * @param text what is typed
 */
async function type(wrapper: VueWrapper, row: string, text: string): Promise<void> {
  await wrapper.get(`${row} input[type="text"]`).setValue(text)
  await flushPromises()
}

/**
 * What a row says of its parameter.
 *
 * @param wrapper the screen
 * @param row the row
 * @returns the words
 */
const said = (wrapper: VueWrapper, row: string): string => wrapper.get(`${row} .status`).text()

it('says the slider is at the vehicle\'s value, then a draft over what the vehicle has, then verified once read', async () => {
  const { wrapper, handle } = await screen()

  expect(said(wrapper, YAW)).toBe('The vehicle\'s value.')
  expect(wrapper.get(YAW).attributes('data-status')).toBe('vehicle')
  await wrapper.get(`${YAW} input[type="range"]`).setValue('0.2')
  await flushPromises()

  expect(said(wrapper, YAW)).toBe('Modified: the vehicle has 0.18.')
  expect(wrapper.get(YAW).attributes('data-status')).toBe('draft')
  await wrapper.get('#tune-rate-write').trigger('click')
  await vi.waitFor(() => expect(said(wrapper, YAW)).toBe('Verified: the vehicle reads 0.2 back.'))

  expect(wrapper.get(YAW).attributes('data-status')).toBe('verified')
  expect(handle.parameters.params.value.find(param => param.id === 'ATC_RAT_YAW_P')?.value).toBeCloseTo(0.2)
  // (the warnings outside the range and the refusals stay in the note of their own)
  expect(wrapper.get(`${YAW} .tune-note`).text()).toBe('')
})

it('says the slider\'s words for a screen reader with the note', async () => {
  const { wrapper } = await screen()
  const range = wrapper.get(`${YAW} input[type="range"]`)
  const ids = range.attributes('aria-describedby')?.split(' ') ?? []

  expect(ids).toHaveLength(2)
  expect(wrapper.get(`${YAW} .tune-note`).attributes('id')).toBe(ids[0])
  expect(wrapper.get(`${YAW} .status`).attributes('id')).toBe(ids[1])
})

it('says a write the vehicle did not take is rejected, and keeps the draft', async () => {
  const { wrapper } = await screen('/tune/rate', { rounding: ['ATC_RAT_YAW_P'] })
  await type(wrapper, YAW, '0.2')
  await wrapper.get('#tune-rate-write').trigger('click')
  await vi.waitFor(() => expect(wrapper.get(YAW).attributes('data-status')).toBe('rejected'))

  expect(said(wrapper, YAW)).toMatch(/^Rejected: /u)
  expect(wrapper.get<HTMLInputElement>(`${YAW} input[type="text"]`).element.value).toBe('0.2')
})

it('keeps the slider\'s draft when the vehicle changes the parameter under it, and keeps it when asked', async () => {
  const { wrapper, control } = await screen()
  await type(wrapper, YAW, '0.2')
  control.announce?.('ATC_RAT_YAW_P', 0.25)
  await vi.waitFor(() => expect(wrapper.get(YAW).attributes('data-status')).toBe('conflict'))

  expect(said(wrapper, YAW)).toBe('Changed on the vehicle: it has 0.25.')
  expect(wrapper.get<HTMLInputElement>(`${YAW} input[type="text"]`).element.value).toBe('0.2')
  expect(wrapper.get(`${YAW} .conflict-box`).text()).toContain('Your draft is 0.2')
  await wrapper.get(`${YAW} .conflict-box button`).trigger('click')
  await flushPromises()

  // (kept: the draft is over the vehicle's new value now, so it is no conflict, and it is still to be written)
  expect(said(wrapper, YAW)).toBe('Modified: the vehicle has 0.25.')
  expect(wrapper.get('.tune-write-row[data-id="ATC_RAT_YAW_P"]').text()).toContain('0.25')
})

it('takes the vehicle\'s new value for the slider when asked: the draft is dropped', async () => {
  const { wrapper, control } = await screen()
  await type(wrapper, YAW, '0.2')
  control.announce?.('ATC_RAT_YAW_P', 0.25)
  await vi.waitFor(() => expect(wrapper.find(`${YAW} .conflict-box`).exists()).toBe(true))
  await wrapper.findAll(`${YAW} .conflict-box button`)[1]!.trigger('click')
  await flushPromises()

  expect(said(wrapper, YAW)).toBe('The vehicle\'s value.')
  expect(wrapper.get<HTMLInputElement>(`${YAW} input[type="text"]`).element.value).toBe('0.25')
  expect(wrapper.find('.tune-write-row[data-id="ATC_RAT_YAW_P"]').exists()).toBe(false)
})

it('says a conflict on either of a linked pair once, and taking it drops the draft of both', async () => {
  const { wrapper, control } = await screen()
  // (linked by the user: else roll and pitch that differ on the vehicle are shown apart; a box already ticked takes no click)
  await wrapper.get('.tune-link input').setValue(false)
  await wrapper.get('.tune-link input').setValue(true)
  await type(wrapper, PAIR, '0.2')

  expect(wrapper.get(`${PAIR} .tune-names`).text()).toBe('ATC_RAT_RLL_P + ATC_RAT_PIT_P')
  expect(said(wrapper, PAIR)).toBe('Modified: the vehicle has 0.135.')
  control.announce?.('ATC_RAT_PIT_P', 0.15)
  await vi.waitFor(() => expect(wrapper.get(PAIR).attributes('data-status')).toBe('conflict'))

  expect(said(wrapper, PAIR)).toBe('Changed on the vehicle: it has 0.15.')
  expect(wrapper.findAll(`${PAIR} .conflict-box`)).toHaveLength(1)
  await wrapper.findAll(`${PAIR} .conflict-box button`)[1]!.trigger('click')
  await flushPromises()

  expect(said(wrapper, PAIR)).toBe('The vehicle\'s value.')
  expect(wrapper.findAll('.tune-write-row')).toHaveLength(0)
})

it('keeps saying the slider\'s states while the vehicle is armed (Tune writes armed, after the hold)', async () => {
  const { wrapper, handle, control } = await screen()
  control.armed?.(true)
  feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()
  await type(wrapper, YAW, '0.2')

  expect(said(wrapper, YAW)).toBe('Modified: the vehicle has 0.18.')
  await wrapper.get('#tune-rate-write').trigger('click')
  await vi.waitFor(() => expect(said(wrapper, YAW)).toBe('Verified: the vehicle reads 0.2 back.'))
})

it('binds a named choice to its parameter: it says the vehicle\'s value, and a draft', async () => {
  const { wrapper } = await screen('/tune/more')
  const row = '[data-tune="TUNE"]'

  expect(wrapper.find(`${row} [data-param="TUNE"]`).exists()).toBe(true)
  expect(said(wrapper, row)).toBe('The vehicle\'s value.')
  // (the hover learning's button chooses a value of the named choice of the learning)
  expect(said(wrapper, '[data-tune="MOT_HOVER_LEARN"]')).toBe('The vehicle\'s value.')
})

it('says the bits\' draft under their boxes', async () => {
  const { wrapper } = await screen('/tune/more')
  const row = '[data-tune="AUTOTUNE_AXES"]'

  expect(said(wrapper, row)).toBe('The vehicle\'s value.')
  await wrapper.findAll(`${row} input[type="checkbox"]`)[0]!.setValue(false)
  await flushPromises()

  expect(said(wrapper, row)).toBe('Modified: the vehicle has 7.')
  expect(wrapper.get(row).attributes('data-status')).toBe('draft')
})
