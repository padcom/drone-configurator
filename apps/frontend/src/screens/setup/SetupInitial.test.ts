// The Initial tune page against the mock backend: the size, the battery and the cells, the table of what each parameter is now
// and what is suggested, "Use these values" choosing (not writing), and the one question that writes them, guarded like every
// Setup page.
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
import { CENTI_DEGREE_IDS, INITIAL_TUNE_IDS } from '@/lib/setup/initialTune'
import SetupInitial from './SetupInitial.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** The parameters of the initial tune this vehicle has: not ATC_RAT_YAW_FLTE (a vehicle without it) and not the old limits. */
const TUNE_PARAMS: Param[] = INITIAL_TUNE_IDS
  .filter(id => id !== 'ATC_RAT_YAW_FLTE' && !CENTI_DEGREE_IDS.includes(id))
  .map((id, index) => ({ id, kind: 'real', type: 'REAL32', value: 1 + index / 10, index: 500 + index }))

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
 * @param extra more parameters the vehicle has
 * @returns the page and what drives it
 */
async function page(values: Record<string, number> = {}, extra: Param[] = []): Promise<Rig> {
  const control: MockControl = {}
  const asked: string[] = []
  const params = [...SETUP_PARAMS, ...TUNE_PARAMS.map(param => ({ ...param, value: values[param.id] ?? param.value })), ...extra]
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
 * Says the size and the cells.
 *
 * @param rig the rig
 * @param inches the size (a text)
 * @param cells the cells (a text)
 */
async function choose(rig: Rig, inches: string, cells: string): Promise<void> {
  await rig.wrapper.get('#setup-initial-size').setValue(inches)
  await rig.wrapper.get('#setup-initial-cells').setValue(cells)
  await flushPromises()
}

it('shows the table at once, and says to say the size and the cells where they are needed; nothing can be used yet', async () => {
  const { wrapper } = await page()

  expect(wrapper.find('#setup-initial-table').exists()).toBe(true)
  expect(wrapper.findAll('[id^="setup-initial-chemistry-"]').map(button => button.text())).toEqual(['LiPo', 'LiPoHV', 'LiIon'])
  expect(wrapper.get('#setup-initial-chemistry-LiPo').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('[data-param="INS_GYRO_FILTER"] td:last-child').text()).toBe('say the propeller size')
  expect(wrapper.get('[data-param="MOT_BAT_VOLT_MAX"] td:last-child').text()).toBe('say the cells')
  // (what is fixed needs neither)
  expect(wrapper.get('[data-param="INS_ACCEL_FILTER"] td:last-child').text()).toBe('10')
  expect(wrapper.get('[data-param="ATC_THR_MIX_MAN"] td:last-child').text()).toBe('0.1')
})

it('shows each parameter now and suggested, from the formulas of Mission Planner (not from what the vehicle has)', async () => {
  const rig = await page()
  await choose(rig, '9', '4')

  expect(suggestedOf(rig, 'INS_GYRO_FILTER')).toBe('46')
  expect(suggestedOf(rig, 'ATC_RAT_RLL_FLTD')).toBe('23')
  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('1259')
  expect(suggestedOf(rig, 'ATC_ACC_Y_MAX')).toBe('279')
  expect(suggestedOf(rig, 'MOT_THST_EXPO')).toBe('0.58')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('16.8')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MIN')).toBe('13.2')
  expect(suggestedOf(rig, 'BATT_ARM_VOLT')).toBe('14.7')
  expect(suggestedOf(rig, 'BATT_CRT_VOLT')).toBe('14')
  // what the vehicle has now is shown beside it, and does not change what is suggested
  expect(rig.wrapper.get('[data-param="INS_ACCEL_FILTER"] td:nth-child(2)').text()).toBe('1')
})

it('takes any size, and the kind of battery changes the voltages', async () => {
  const rig = await page()
  await choose(rig, '5', '3')

  expect(suggestedOf(rig, 'INS_GYRO_FILTER')).toBe('75')
  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('1686')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('12.6')
  await rig.wrapper.get('#setup-initial-chemistry-LiIon').trigger('click')
  await flushPromises()

  expect(rig.wrapper.get('#setup-initial-chemistry-LiIon').attributes('aria-pressed')).toBe('true')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('12.3')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MIN')).toBe('8.4')
})

it('says a parameter is not on this vehicle', async () => {
  const rig = await page()
  await choose(rig, '10', '4')

  expect(suggestedOf(rig, 'ATC_RAT_YAW_FLTE')).toBe('not on this vehicle')
})

it('shows the acceleration limits in the unit the vehicle has (centi-degrees if it has ATC_ACCEL_P_MAX)', async () => {
  const degrees = await page()
  await choose(degrees, '9', '4')

  expect(degrees.wrapper.find('[data-param="ATC_ACC_P_MAX"]').exists()).toBe(true)
  expect(degrees.wrapper.find('[data-param="ATC_ACCEL_P_MAX"]').exists()).toBe(false)
  mounted?.unmount()
  const old: Param[] = CENTI_DEGREE_IDS.map((id, index) => ({
    id, kind: 'real', type: 'REAL32', value: 100_000, index: 700 + index,
  }))
  const centi = await page({}, old)
  await choose(centi, '9', '4')

  expect(centi.wrapper.find('[data-param="ATC_ACC_P_MAX"]').exists()).toBe(false)
  expect(suggestedOf(centi, 'ATC_ACCEL_P_MAX')).toBe('125900')
  expect(suggestedOf(centi, 'ATC_ACCEL_Y_MAX')).toBe('27900')
})

it('asks for the size and the cells before it suggests, and does not take a text that is not a size or cells', async () => {
  const rig = await page()
  const field = rig.wrapper.get('#setup-initial-cells')
  const sizeField = rig.wrapper.get('#setup-initial-size')

  // (one text after the other, each checked before the next is typed)
  for (const text of ['0', '13', '2.5', '1e1', 'abc']) {
    // eslint-disable-next-line no-await-in-loop -- one text after the other
    await field.setValue(text)
    expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('say the cells')
  }
  await field.setValue('3')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('12.6')

  for (const text of ['0', '61', '9,5', '1e1', 'abc', '9.55']) {
    // eslint-disable-next-line no-await-in-loop -- one text after the other
    await sizeField.setValue(text)
    expect(suggestedOf(rig, 'INS_GYRO_FILTER')).toBe('say the propeller size')
  }
  await sizeField.setValue('7.5')
  expect(suggestedOf(rig, 'INS_GYRO_FILTER')).toBe('53')
})

it('only chooses the values when asked: nothing is written, the side lists them, and the one question writes them', async () => {
  const rig = await page()
  await choose(rig, '10', '4')
  expect(rig.wrapper.get('#setup-initial-write').attributes('disabled')).toBeDefined()

  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(0)
  expect(rig.control.writesSent?.()).toEqual([])
  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).toContain('INS_GYRO_FILTER')
  expect(listed).toContain('MOT_BAT_VOLT_MAX')
  // not the one the vehicle does not have
  expect(listed).not.toContain('ATC_RAT_YAW_FLTE')
  await rig.wrapper.get('#setup-initial-write').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('INS_GYRO_FILTER')
  expect(rig.asked[0]).toMatch(/MOT_BAT_VOLT_MAX [\d.]+ → 16\.8/u)
  expect(rig.wrapper.get('#setup-initial-status').text()).toBe('Written and read back')
  expect(rig.control.writesSent?.()).toContain('MOT_THST_EXPO')
})

it('chooses and writes nothing that has no value yet: no size, no voltage without the cells', async () => {
  const rig = await page()
  await choose(rig, '', '')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).not.toContain('INS_GYRO_FILTER')
  expect(listed).not.toContain('MOT_BAT_VOLT_MAX')
  expect(listed).toContain('INS_ACCEL_FILTER')
})

it('is refused while the vehicle is armed: the page says why and writes nothing', async () => {
  const rig = await page()
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()
  await choose(rig, '10', '4')

  expect(rig.wrapper.get('#setup-initial-use').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('#setup-initial-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('#setup-initial-blocked').text()).toContain('armed')
  expect(rig.control.writesSent?.()).toEqual([])
})

it('names Mission Planner as the source once, advises what to set after a flight, and has no other title', async () => {
  const { wrapper } = await page()
  const text = wrapper.text()

  expect(text.split('ConfigInitialParams.cs')).toHaveLength(2)
  expect(text).toContain('MOT_THST_EXPO is best measured on a thrust stand')
  expect(wrapper.get('#setup-initial-after').text()).toContain('ATC_THR_MIX_MAN to 0.5')
  expect(wrapper.get('h3').classes()).toContain('visually-hidden')
})

it('puts the choices back when the size changes: values chosen for 10 inch are not written under a table for 5', async () => {
  const rig = await page()
  await choose(rig, '10', '4')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  expect(rig.wrapper.findAll('.setup-writes li').map(item => item.text())).toContain('ATC_ACC_P_MAX')

  await rig.wrapper.get('#setup-initial-size').setValue('5')
  await flushPromises()

  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('1686')
  expect(rig.wrapper.findAll('.setup-writes li')).toHaveLength(0)
  expect(rig.wrapper.get('#setup-initial-write').attributes('disabled')).toBeDefined()
  // and what is chosen again for 5 inch is what the table shows
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  expect(rig.wrapper.findAll('.setup-writes li').map(item => item.text())).toContain('ATC_ACC_P_MAX')
  expect(rig.control.writesSent?.()).toEqual([])
})

it('puts the choices back when the cells or the battery change: the voltages of 4 cells are not written for 3', async () => {
  const rig = await page()
  await choose(rig, '10', '4')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  expect(rig.wrapper.findAll('.setup-writes li').map(item => item.text())).toContain('MOT_BAT_VOLT_MAX')

  await rig.wrapper.get('#setup-initial-cells').setValue('3')
  await flushPromises()

  expect(rig.wrapper.findAll('.setup-writes li')).toHaveLength(0)
  await rig.wrapper.get('#setup-initial-chemistry-LiPoHV').trigger('click')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()
  await rig.wrapper.get('#setup-initial-write').trigger('click')
  await flushPromises()

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toMatch(/MOT_BAT_VOLT_MAX [\d.]+ → 13\.05/u)
  expect(rig.asked[0]).not.toContain('16.8')
})

it('does not offer a value outside its documented range, says why, and chooses nothing for it', async () => {
  const rig = await page()
  await choose(rig, '4', '1')

  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toBe('the calculated value is outside this parameter\'s range: not offered')
  expect(suggestedOf(rig, 'MOT_BAT_VOLT_MAX')).toBe('the calculated value is outside this parameter\'s range: not offered')
  expect(suggestedOf(rig, 'ATC_ACC_Y_MAX')).toBe('324')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).not.toContain('ATC_ACC_P_MAX')
  expect(listed).not.toContain('MOT_BAT_VOLT_MAX')
  expect(listed).toContain('ATC_ACC_Y_MAX')
})

it('does not offer an acceleration limit beyond its range on the vehicle (another unit), and says why', async () => {
  const rig = await page({ ATC_ACC_P_MAX: 110_000, ATC_ACC_Y_MAX: 720 })
  await choose(rig, '10', '4')

  expect(suggestedOf(rig, 'ATC_ACC_P_MAX')).toContain('above this parameter\'s range')
  // (720 is the range's greatest for yaw: inside it, and 270 is the suggestion)
  expect(suggestedOf(rig, 'ATC_ACC_Y_MAX')).toBe('270')
  await rig.wrapper.get('#setup-initial-use').trigger('click')
  await flushPromises()

  const listed = rig.wrapper.findAll('.setup-writes li').map(item => item.text())
  expect(listed).not.toContain('ATC_ACC_P_MAX')
  expect(listed).toContain('ATC_ACC_Y_MAX')
})
