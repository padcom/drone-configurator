// The Initial tune page against the mock backend: the size and the cells, the table of what each parameter is now and what is
// suggested, "Use these values" choosing (not writing), and the one question that writes them, guarded like every Setup page.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import type { Param } from '@/generated/app'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import { INITIAL_TUNE_IDS } from '@/lib/setup/initialTune'
import SetupInitial from './SetupInitial.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** The parameters of the initial tune that this vehicle has: every one but ATC_RAT_YAW_FLTE (a vehicle that does not have it). */
const TUNE_PARAMS: Param[] = INITIAL_TUNE_IDS.filter(id => id !== 'ATC_RAT_YAW_FLTE').map((id, index) => ({
  id, kind: 'real', type: 'REAL32', value: 1 + index / 10, index: 500 + index,
}))

/** What a test has: the page, the Configurator, the mock's controls and the questions asked. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
  asked: string[]
}

/**
 * The page over a connected, disarmed simulated vehicle that has the parameters of the initial tune (except one).
 *
 * @param values values to give some of the parameters (a vehicle that is not at the usual)
 * @returns the page and what drives it
 */
async function page(values: Record<string, number> = {}): Promise<Rig> {
  const control: MockControl = {}
  const asked: string[] = []
  const params = [...SETUP_PARAMS, ...TUNE_PARAMS.map(param => ({ ...param, value: values[param.id] ?? param.value }))]
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params, control }), question => {
    asked.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/setup/initial')
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(SetupInitial) }), { global: { plugins: [i18n, router] } })
  await flushPromises()

  return { wrapper: mounted, handle, control, asked }
}

/**
 * The text of the suggested column of a parameter.
 *
 * @param rig the rig
 * @param id the parameter
 * @returns the text
 */
function suggestedOf(rig: Rig, id: string): string {
  return rig.wrapper.get(`[data-param="${id}"] td:last-child`).text()
}

/**
 * Chooses the size and says the cells.
 *
 * @param rig the rig
 * @param inches the size
 * @param cells the cells (a text)
 */
async function choose(rig: Rig, inches: number, cells: string): Promise<void> {
  await rig.wrapper.get(`#setup-initial-size-${inches}`).trigger('click')
  await rig.wrapper.get('input[type="text"]').setValue(cells)
  await flushPromises()
}

it('offers the four sizes of the page and nothing else, and shows no table before one is chosen', async () => {
  const { wrapper } = await page()

  const sizes = wrapper.findAll('[id^="setup-initial-size-"]').map(button => button.text())

  expect(sizes).toEqual(['5 inch', '10 inch', '20 inch', '30 inch'])
  expect(wrapper.find('#setup-initial-table').exists()).toBe(false)
  expect(wrapper.get('#setup-initial-pick').text()).toContain('Choose the size')
  expect(wrapper.get('#setup-initial-use').attributes('disabled')).toBeDefined()
})

it('shows each parameter now and suggested, computed from the size and the cells (not from what the vehicle has)', async () => {
  const rig = await page()
  await choose(rig, 10, '4')

  expect(suggestedOf(rig, 'INS_GYRO_FILTER')).toBe('40')
  expect(suggestedOf(rig, 'ATC_RAT_RLL_FLTD')).toBe('20')
  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('1100')
  expect(suggestedOf(rig, 'MOT_THST_EXPO')).toBe('0.65')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('16.8')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MIN')).toBe('13.2')
  // what the vehicle has now is shown beside it, and does not change what is suggested
  expect(rig.wrapper.get('[data-param="INS_ACCEL_FILTER"] td:nth-child(2)').text()).toBe('1')
})

it('says a parameter is not on this vehicle, and says the page gives no acceleration for 5 inch', async () => {
  const rig = await page()
  await choose(rig, 5, '3')

  expect(suggestedOf(rig, 'ATC_RAT_YAW_FLTE')).toBe('not on this vehicle')
  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('not given by ArduPilot\'s page for this size')
  expect(suggestedOf(rig, 'ATC_ACC_Y_MAX')).toBe('not given by ArduPilot\'s page for this size')
  expect(suggestedOf(rig, 'INS_GYRO_FILTER')).toBe('80')
})

it('asks for the cells before it suggests a voltage, and does not take a text that is not a number of cells', async () => {
  const rig = await page()
  await choose(rig, 10, '')

  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  const field = rig.wrapper.get('input[type="text"]')

  // (one text after the other, each checked before the next is typed)
  await field.setValue('0')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  await field.setValue('13')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  await field.setValue('2.5')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  await field.setValue('1e1')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  await field.setValue('abc')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  await field.setValue('3')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('12.6')
})

it('only chooses the values when asked: nothing is written, the side lists them, and the one question writes them', async () => {
  const rig = await page()
  await choose(rig, 10, '4')
  expect(rig.wrapper.get('#setup-initial-write').attributes('disabled')).toBeDefined()

  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(0)
  expect(rig.control.writesSent?.()).toEqual([])
  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).toContain('INS_GYRO_FILTER')
  expect(listed).toContain('MOT_BAT_VOLT_MAX')
  // not the one the vehicle does not have, and not those the page gives no value for
  expect(listed).not.toContain('ATC_RAT_YAW_FLTE')
  await rig.wrapper.get('#setup-initial-write').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('INS_GYRO_FILTER')
  expect(rig.asked[0]).toMatch(/MOT_BAT_VOLT_MAX [\d.]+ → 16\.8/u)
  expect(rig.wrapper.get('#setup-initial-status').text()).toBe('Written and read back')
  expect(rig.control.writesSent?.()).toContain('MOT_THST_EXPO')
})

it('does not choose or write anything for 5 inch that the page does not give', async () => {
  const rig = await page()
  await choose(rig, 5, '3')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed.some(name => name.startsWith('ATC_ACC_'))).toBe(false)
  expect(listed).toContain('INS_GYRO_FILTER')
})

it('is refused while the vehicle is armed: the page says why and writes nothing', async () => {
  const rig = await page()
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()
  await choose(rig, 10, '4')

  expect(rig.wrapper.get('#setup-initial-use').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('#setup-initial-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('#setup-initial-blocked').text()).toContain('armed')
  expect(rig.control.writesSent?.()).toEqual([])
})

it('names the page it is from, once, and puts no other title on the page', async () => {
  const { wrapper } = await page()
  const text = wrapper.text()

  expect(text.split('Setting the Aircraft Up for Tuning')).toHaveLength(2)
  expect(text).toContain('verify MOT_THST_EXPO on a thrust stand')
  expect(wrapper.get('h3').classes()).toContain('visually-hidden')
})

it('puts the choices back when the size changes: 10 inch values are not written under a table with none for 5', async () => {
  const rig = await page()
  await choose(rig, 10, '4')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  expect(rig.wrapper.findAll('.setup-writes li').map(item => item.text())).toContain('ATC_ACC_P_MAX')

  await rig.wrapper.get('#setup-initial-size-5').trigger('click')
  await flushPromises()

  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('not given by ArduPilot\'s page for this size')
  expect(rig.wrapper.findAll('.setup-writes li')).toHaveLength(0)
  expect(rig.wrapper.get('#setup-initial-write').attributes('disabled')).toBeDefined()
  // and what is chosen again for 5 inch is what the table shows
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).toContain('INS_GYRO_FILTER')
  expect(listed.some(name => name.startsWith('ATC_ACC_'))).toBe(false)
  expect(rig.control.writesSent?.()).toEqual([])
})

it('puts the choices back when the cells change: the voltages of 4 cells are not written for 3', async () => {
  const rig = await page()
  await choose(rig, 10, '4')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  expect(rig.wrapper.findAll('.setup-writes li').map(item => item.text())).toContain('MOT_BAT_VOLT_MAX')

  await rig.wrapper.get('input[type="text"]').setValue('3')
  await flushPromises()

  expect(rig.wrapper.findAll('.setup-writes li')).toHaveLength(0)
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  await rig.wrapper.get('#setup-initial-write').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toMatch(/MOT_BAT_VOLT_MAX [\d.]+ → 12\.6/u)
  expect(rig.asked[0]).not.toContain('16.8')
})

it('does not offer an acceleration limit beyond its range on the vehicle (another unit), and says why', async () => {
  const rig = await page({ ATC_ACC_P_MAX: 110_000, ATC_ACC_Y_MAX: 720 })
  await choose(rig, 10, '4')

  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toContain('above this parameter\'s range')
  // (720 is the range's greatest for yaw: inside it)
  expect(suggestedOf(rig, 'ATC_ACC_Y_MAX')).toBe('200')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).not.toContain('ATC_ACC_P_MAX')
  expect(listed).toContain('ATC_ACC_Y_MAX')
})
