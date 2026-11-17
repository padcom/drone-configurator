// The Tune screen against the mock backend: sliders for the Copter groups, each with its parameter's name and "was X"; ranges
// warned, hard limits refused (here and again in the backend); roll and pitch linked in ONE question that names both; and the one
// place where a write goes to an ARMED vehicle (the leader's decision Q7): a banner, a hold, never when the state is not known.
// Nothing is drawn from the values of the sliders: there is no preview.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { KeepAlive, defineComponent, h, ref } from 'vue'
import { createConfigurator } from '@/composables/useConfigurator'
import type { Param } from '@/generated/app'
import { i18n, setLanguage } from '@/i18n/i18n'
import { SETUP_PARAMS, telemetryAt } from '@/mock/fixtures'
import { type MockControl, type MockOptions, mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import Tune from '../Tune.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/** What a test has: the screen, the Configurator, the mock's controls, and the questions asked. */
interface Rig {
  wrapper: VueWrapper
  handle: ReturnType<typeof createConfigurator>
  control: MockControl
  asked: string[]
}

/**
 * A configurator over a connected simulated vehicle that was set up and is disarmed, with its list downloaded.
 *
 * @param more more of the mock's options
 * @param params the vehicle's parameters
 * @param ask is given each question that is asked (all are answered yes)
 * @returns the configurator and the mock's controls
 */
async function vehicleOf(more: MockOptions, params: Param[], ask: (question: string) => void) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, params, control, ...more }), question => {
    ask(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  feed(handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await vi.waitFor(() => expect(handle.parameters.list.value).toBe('complete'))

  return { handle, control }
}

/**
 * The Tune screen over a connected simulated vehicle that was set up and is disarmed.
 *
 * @param path where it opens (a part of the screen)
 * @param more more of the mock's options
 * @param params the vehicle's parameters
 * @returns the screen and what drives it
 */
async function screen(path = '/tune/rate', more: MockOptions = {}, params = SETUP_PARAMS): Promise<Rig> {
  const asked: string[] = []
  const { handle, control } = await vehicleOf(more, params, question => asked.push(question))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push(path)
  await router.isReady()
  mounted = mount(defineComponent({ render: () => h(Tune) }), { global: { plugins: [i18n, router] } })
  await flushPromises()
  await flushPromises()

  return { wrapper: mounted, handle, control, asked }
}

/**
 * The value of a parameter on the vehicle, as the interface has it.
 *
 * @param rig the rig
 * @param id the parameter
 * @returns its value
 */
function valueOf(rig: Rig, id: string): number | undefined {
  return rig.handle.parameters.params.value.find(param => param.id === id)?.value
}

/**
 * Moves the slider of a row (the first parameter of it names the row).
 *
 * @param rig the rig
 * @param id the parameter
 * @param value the value
 */
async function slide(rig: Rig, id: string, value: number): Promise<void> {
  await rig.wrapper.get(`[data-tune="${id}"] input[type="range"]`).setValue(value)
}

/**
 * Types a value in the field of a row.
 *
 * @param rig the rig
 * @param id the parameter
 * @param text what is typed
 */
async function type(rig: Rig, id: string, text: string): Promise<void> {
  await rig.wrapper.get(`[data-tune="${id}"] input[type="text"]`).setValue(text)
}

/**
 * Presses Write of a part, and lets the writes go.
 *
 * @param rig the rig
 * @param part `rate` or `more`
 */
async function write(rig: Rig, part = 'rate'): Promise<void> {
  await rig.wrapper.get(`#tune-${part}-write`).trigger('click')
  await flushPromises()
  await flushPromises()
}

/**
 * The text of the note of a row.
 *
 * @param rig the rig
 * @param id the parameter
 * @returns the note
 */
function noteOf(rig: Rig, id: string): string {
  return rig.wrapper.get(`[data-tune="${id}"] .tune-note`).text()
}

it('has the tabs Rate, Analyse, More groups and Filters (after the logs), opens at Rate, and says which is shown', async () => {
  const { wrapper } = await screen('/tune')

  // (the nav lists them twice: the tabs, and the menu of a narrow window)
  const tabs = new Set(wrapper.findAll('nav[aria-label="Tune sections"] a').map(link => link.text()))
  expect([...tabs]).toEqual(['Rate', 'Analyse', 'More groups', 'Filters'])
  expect(wrapper.text()).toContain('Tune: Rate')
  const filters = await screen('/tune/filters')
  expect(filters.wrapper.find('#tune-filters-write').exists()).toBe(true)
})

it('has the fixed parts: "Put back initial values" under the main column, what it writes and Write in the aside', async () => {
  for (const path of ['/tune/rate', '/tune/more', '/tune/filters']) {
    // eslint-disable-next-line no-await-in-loop -- one part after the other
    const { wrapper } = await screen(path)
    const part = path.split('/').at(-1)

    // (the sliders scroll in the body; the two buttons are in the parts that stay)
    expect(wrapper.find('.tune-main .pane-body .setup-main .tune-block').exists(), path).toBe(true)
    expect(wrapper.find(`.tune-main .pane-bottom #tune-${part}-initial`).exists(), path).toBe(true)
    expect(wrapper.find(`.tune-main .pane-body #tune-${part}-initial`).exists(), path).toBe(false)
    expect(wrapper.find(`.tune-aside .pane-bottom #tune-${part}-write`).exists(), path).toBe(true)
    expect(wrapper.find('.tune-aside .pane-bottom .tune-write-list').exists(), path).toBe(true)
    expect(wrapper.find(`.tune-aside .pane-body #tune-${part}-status`).exists(), path).toBe(true)
  }
})

it('says in the top of the aside why nothing can be written, and has no top at all otherwise', async () => {
  const rig = await screen()

  expect(rig.wrapper.find('.tune-aside .pane-top').exists()).toBe(false)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true, heartbeatAgeMs: 5000 } })
  await flushPromises()

  expect(rig.wrapper.get('.tune-aside .pane-top #tune-rate-blocked').text()).toContain('not known')
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: false, heartbeatAgeMs: 0 } })
  await flushPromises()

  expect(rig.wrapper.find('.tune-aside .pane-top').exists()).toBe(false)
})

it('shows a slider for each rate parameter with its name and "was X", roll and pitch linked as one by default', async () => {
  const { wrapper } = await screen()

  // linked: one row for both, naming both parameters
  expect(wrapper.get('[data-tune="ATC_RAT_RLL_P"] .tune-names').text()).toBe('ATC_RAT_RLL_P + ATC_RAT_PIT_P')
  expect(wrapper.get('[data-tune="ATC_RAT_RLL_P"] .tune-was').text()).toBe('was 0.135')
  expect(wrapper.find('[data-tune="ATC_RAT_PIT_P"]').exists()).toBe(false)
  // yaw is its own
  expect(wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-names').text()).toBe('ATC_RAT_YAW_P')
  expect(wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-was').text()).toBe('was 0.18')
  // a slider is held to ArduPilot's range for it
  const range = wrapper.get('[data-tune="ATC_RAT_RLL_P"] input[type="range"]')
  expect([range.attributes('min'), range.attributes('max')]).toEqual(['0.01', '0.5'])
})

it('shows roll and pitch apart when they are not linked', async () => {
  const { wrapper } = await screen()
  await wrapper.get('.tune-link input').setValue(false)

  expect(wrapper.get('[data-tune="ATC_RAT_RLL_P"] .tune-names').text()).toBe('ATC_RAT_RLL_P')
  expect(wrapper.get('[data-tune="ATC_RAT_PIT_P"] .tune-names').text()).toBe('ATC_RAT_PIT_P')
})

it('writes roll and pitch together in ONE question that names both parameters, each read back', async () => {
  const rig = await screen()
  await slide(rig, 'ATC_RAT_RLL_P', 0.2)

  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeUndefined()
  await write(rig)
  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('ATC_RAT_RLL_P 0.135 → 0.2')
  expect(rig.asked[0]).toContain('ATC_RAT_PIT_P 0.135 → 0.2')
  expect(valueOf(rig, 'ATC_RAT_RLL_P')).toBeCloseTo(0.2, 5)
  expect(valueOf(rig, 'ATC_RAT_PIT_P')).toBeCloseTo(0.2, 5)
  expect(rig.control.writesSent?.()).toEqual(['ATC_RAT_RLL_P', 'ATC_RAT_PIT_P'])
  // the question is the plain one: the vehicle is disarmed
  expect(rig.asked[0]).not.toContain('Armed')
})

it('warns about a value outside ArduPilot\'s range, and still writes it', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_YAW_P', '0.05')

  expect(noteOf(rig, 'ATC_RAT_YAW_P')).toContain('0.1')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-note').classes()).not.toContain('problem')
  await write(rig)
  expect(valueOf(rig, 'ATC_RAT_YAW_P')).toBeCloseTo(0.05, 5)
})

it('refuses a value above the most of the table: it says so, and nothing is written', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_YAW_P', '2.6')

  expect(noteOf(rig, 'ATC_RAT_YAW_P')).toContain('refused')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-note').classes()).toContain('problem')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] input[type="text"]').attributes('aria-invalid')).toBe('true')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  await write(rig)
  expect(rig.asked).toHaveLength(0)
  expect(rig.control.writesSent?.()).toEqual([])
})

it('refuses a negative value: it says so, and nothing is written', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_RLL_D', '-0.001')

  expect(noteOf(rig, 'ATC_RAT_RLL_D')).toContain('Negative')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  await write(rig)
  expect(rig.control.writesSent?.()).toEqual([])
})

it('says a text that is not a number is not written', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_YAW_P', 'abc')

  expect(noteOf(rig, 'ATC_RAT_YAW_P')).toContain('not a number')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
})

it('puts the initial values back as choices, and writes them through the one question', async () => {
  const rig = await screen()
  await slide(rig, 'ATC_RAT_YAW_P', 0.3)
  await write(rig)
  expect(valueOf(rig, 'ATC_RAT_YAW_P')).toBeCloseTo(0.3, 5)
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-was').text()).toBe('was 0.18')

  await rig.wrapper.get('#tune-rate-initial').trigger('click')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeUndefined()
  // (the changed value, as the Parameters page lists a change: the name, what the vehicle has, and what it will have)
  const row = rig.wrapper.get('.tune-write-row[data-id="ATC_RAT_YAW_P"]')
  expect([row.get('.name').text(), row.get('.from').text(), row.get('.to').text()]).toEqual(['ATC_RAT_YAW_P', '0.3', '0.18'])
  await write(rig)
  expect(rig.asked.at(-1)).toContain('ATC_RAT_YAW_P 0.3 → 0.18')
  expect(valueOf(rig, 'ATC_RAT_YAW_P')).toBeCloseTo(0.18, 5)
})

it('says exactly which were written, which were not confirmed and which were not written when a write stops', async () => {
  // the vehicle rounds this one to a whole number (0.14 becomes 0): it is read back as another value
  const rig = await screen('/tune/rate', { rounding: ['ATC_RAT_PIT_P'] })
  await rig.wrapper.get('.tune-link input').setValue(false)
  await slide(rig, 'ATC_RAT_RLL_P', 0.2)
  await slide(rig, 'ATC_RAT_PIT_P', 0.14)
  await slide(rig, 'ATC_RAT_YAW_P', 0.3)
  await write(rig)

  const lines = rig.wrapper.findAll('#tune-rate-outcome li').map(line => line.text())
  expect(lines).toHaveLength(3)
  expect(lines[0]).toBe('Written and read back: ATC_RAT_RLL_P.')
  expect(lines[1]).toContain('Written, not confirmed: ATC_RAT_PIT_P (')
  expect(lines[2]).toBe('Not written: ATC_RAT_YAW_P.')
  // it was not tried again, and the yaw was never sent
  expect(rig.control.writesSent?.()).toEqual(['ATC_RAT_RLL_P', 'ATC_RAT_PIT_P'])
  expect(valueOf(rig, 'ATC_RAT_YAW_P')).toBeCloseTo(0.18, 5)
})

it('shows only the parameters the vehicle has, and names the others', async () => {
  const params = SETUP_PARAMS.filter(param => !param.id.startsWith('PSC_') && param.id !== 'ATC_ANG_YAW_P')
  const { wrapper } = await screen('/tune/more', {}, params)

  expect(wrapper.find('[data-tune="PSC_NE_POS_P"]').exists()).toBe(false)
  expect(wrapper.find('[data-tune="ATC_ANG_RLL_P"]').exists()).toBe(true)
  expect(wrapper.find('[data-tune="ATC_ANG_YAW_P"]').exists()).toBe(false)
  expect(wrapper.get('#tune-more-missing').text()).toContain('ATC_ANG_YAW_P')
  expect(wrapper.get('#tune-more-missing').text()).toContain('PSC_NE_POS_P')
})

it('has the groups of the other tuning, each with names, the knob a named choice', async () => {
  const { wrapper } = await screen('/tune/more')

  const groups = wrapper.findAll('.tune-block h4').map(heading => heading.text())
  expect(groups).toEqual(['Attitude', 'Pilot feel', 'Position', 'Hover throttle', 'AutoTune', 'Radio knob'])
  expect(wrapper.get('[data-tune="ATC_INPUT_TC"] .tune-names').text()).toBe('ATC_INPUT_TC')
  expect(wrapper.get('[data-tune="PSC_NE_VEL_P"] .tune-was').text()).toBe('was 2')
  expect(wrapper.get('[data-tune="TUNE"] .tune-names').text()).toBe('TUNE')
  expect((wrapper.get('[data-tune="TUNE"] input').element as HTMLInputElement).value).toBe('None')
  expect(wrapper.find('[data-tune="TUNE"] input[type="range"]').exists()).toBe(false)
})

/**
 * The vehicle's parameters, and the hover throttle with its learning and AutoTune's axes.
 *
 * @param learn the value of MOT_HOVER_LEARN
 * @returns the parameters
 */
function hoverParams(learn: number): Param[] {
  const extra: Param[] = [
    { id: 'MOT_THST_HOVER', index: 900, kind: 'real', type: 'REAL32', value: 0.3 },
    { id: 'MOT_HOVER_LEARN', index: 901, kind: 'int', type: 'INT8', value: learn },
    { id: 'AUTOTUNE_AXES', index: 902, kind: 'int', type: 'INT8', value: 7 },
  ]

  return [...SETUP_PARAMS, ...extra]
}

it('says that the hover throttle is not kept while the learning is on, and puts the learning off with one press', async () => {
  const rig = await screen('/tune/more', {}, hoverParams(2))

  expect(rig.wrapper.get('[data-testid="hover-learning"]').text()).toContain('a number written here is not kept')
  await rig.wrapper.get('[data-testid="hover-learning"] button').trigger('click')
  await write(rig, 'more')

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]).toContain('MOT_HOVER_LEARN 2 → 0')
  expect(valueOf(rig, 'MOT_HOVER_LEARN')).toBe(0)
})

it('says nothing of it when the learning is off, and says to set AutoTune\'s axes before it is engaged', async () => {
  const rig = await screen('/tune/more', {}, hoverParams(0))

  expect(rig.wrapper.find('[data-testid="hover-learning"]').exists()).toBe(false)
  expect(rig.wrapper.get('[data-tune="AUTOTUNE_AXES"]').text()).toContain('Set before AutoTune is engaged')
})

it('the chart renders nothing from the slider values alone: no curve, no preview, whatever they are set to', async () => {
  const rig = await screen()
  await slide(rig, 'ATC_RAT_YAW_P', 0.4)
  await slide(rig, 'ATC_RAT_RLL_P', 0.3)
  const more = await screen('/tune/more')
  await slide(more, 'ATC_ANG_RLL_P', 8)

  // the chart of the live response is there, and has no line: nothing came from the vehicle
  expect(rig.wrapper.find('#tune-response-chart').exists()).toBe(true)
  expect(rig.wrapper.findAll('.chart-series .line, .chart-series .dot')).toHaveLength(0)
  expect(rig.wrapper.get('#tune-response-chart').text()).toContain('No data: fly or connect')
  expect(rig.wrapper.get('#tune-overshoot').text()).toBe('—')

  for (const wrapper of [rig.wrapper, more.wrapper]) {
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.find('polyline').exists()).toBe(false)
  }
  expect(more.wrapper.find('#tune-response-chart').exists()).toBe(false)
})

/**
 * What the vehicle sends for a step of the desired roll rate and a first-order response to it: the test's own signal, pushed
 * as the backend would send it (the page makes nothing of its own).
 *
 * @returns the batch
 */
function stepBatch() {
  const desired = []
  const actual = []
  let x = 0

  for (let at = 0; at <= 3000; at += 40) {
    const level = at >= 1000 ? 57.3 : 0
    x += (level - x) * (1 - Math.exp(-40 / 100))
    desired.push({ t: 5000 + at, v: level })
    actual.push({ t: 5000 + at, v: x })
  }

  return { actual, desired, dropped: 3, asked: { actual: true, desired: true } }
}

it('the chart does not change when a slider moves: its lines are the stream\'s, the same before and after', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))
  rig.control.tuning?.push(stepBatch())
  await flushPromises()
  const drawn = () => rig.wrapper.findAll('.chart-series .line').map(line => line.attributes('d'))
  const before = drawn()
  expect(before).toHaveLength(2)

  await slide(rig, 'ATC_RAT_YAW_P', 0.4)
  await slide(rig, 'ATC_RAT_RLL_P', 0.01)
  await type(rig, 'ATC_RAT_RLL_I', '1.5')

  expect(drawn()).toEqual(before)
})

it('draws the two lines the vehicle sends, measures the step of the desired rate, and shows what was dropped', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))

  rig.control.tuning?.push(stepBatch())
  await flushPromises()

  expect(rig.wrapper.findAll('.chart-series .line')).toHaveLength(2)
  expect(rig.wrapper.get('#tune-response-chart').text()).not.toContain('No data')
  const rise = Number.parseInt(rig.wrapper.get('#tune-rise').text(), 10)
  expect(rise).toBeGreaterThan(200)
  expect(rise).toBeLessThan(250)
  expect(rig.wrapper.get('#tune-overshoot').text()).toBe('0.0 %')
  expect(rig.wrapper.get('#tune-settling').text()).toMatch(/^\d+ ms$/u)
  expect(rig.wrapper.get('#tune-step').text()).toContain('0 to 57 degrees a second')
  expect(rig.wrapper.get('#tune-dropped').text()).toBe('Points dropped by the backend: 3')
})

it('says there is no step, with dashes, when the desired rate does not move', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))

  const flat = (v: number) => [{ t: 100, v }, { t: 140, v }]
  rig.control.tuning?.push({ actual: flat(1), desired: flat(0), dropped: 0, asked: { actual: true, desired: true } })
  await flushPromises()

  expect(rig.wrapper.findAll('.chart-series .line')).toHaveLength(2)
  expect(rig.wrapper.get('#tune-step').text()).toBe('No step in the last 10 seconds: nothing is measured.')
  const shown = ['#tune-overshoot', '#tune-rise', '#tune-settling'].map(id => rig.wrapper.get(id).text())
  expect(shown).toEqual(['—', '—', '—'])
})

it('says when the vehicle did not take the request for the desired rate: no line of it, and nothing measured', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))

  const actual = [{ t: 100, v: 1 }, { t: 140, v: 2 }]
  rig.control.tuning?.push({ actual, desired: [], dropped: 0, asked: { actual: true, desired: false } })
  await flushPromises()

  expect(rig.wrapper.get('.tune-response-missing').text()).toContain('ATTITUDE_TARGET')
  expect(rig.wrapper.findAll('.chart-series .line')).toHaveLength(1)
})

it('asks for the stream at 25 Hz when the screen is shown, and ends it when the screen is left', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))
  expect(rig.control.tuning?.rateHz()).toBe(25)

  rig.wrapper.unmount()

  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(false))
})

it('ends the stream when the screen is deactivated (pages are kept alive), and asks again when it is shown again', async () => {
  const asked: string[] = []
  const { handle, control } = await vehicleOf({}, SETUP_PARAMS, question => asked.push(question))
  const router = createAppRouter(createMemoryHistory(), () => 0)
  await router.push('/tune/rate')
  await router.isReady()
  const open = ref(true)
  mounted = mount(defineComponent({ render: () => h(KeepAlive, null, () => (open.value ? h(Tune, { key: 'tune' }) : null)) }), {
    global: { plugins: [i18n, router] },
  })
  await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
  expect(handle.tuning.state.value).not.toBe('idle')

  open.value = false
  await flushPromises()
  await vi.waitFor(() => expect(control.tuning?.running()).toBe(false))

  open.value = true
  await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
  expect(control.tuning?.began()).toBe(2)
})

it('marks old data: the stream ended (the link was lost), says why, and does not show the last step as current', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))
  rig.control.tuning?.push(stepBatch())
  await flushPromises()

  rig.control.tuning?.end('LINK_LOST')
  await flushPromises()

  expect(rig.wrapper.get('#tune-response-chart').text()).toContain('Old data')
  expect(rig.wrapper.get('#tune-response-problem').text()).toContain('LINK_LOST')
  // the numbers of the last step are not shown as if they were current: dashes, and the text says why
  expect(rig.wrapper.get('#tune-rise').text()).toBe('—')
  expect(rig.wrapper.get('#tune-overshoot').text()).toBe('—')
  expect(rig.wrapper.get('#tune-step').text()).toBe('Old data: the last step is not shown as if it were current.')
})

// The armed case: the one place where a write goes to a vehicle in flight.

it('shows a banner while the vehicle is armed, announces arming and disarming once each, politely, and not before', async () => {
  const rig = await screen()
  expect(rig.wrapper.find('#tune-armed').exists()).toBe(false)
  expect(rig.wrapper.get('#tune-armed-status').text()).toBe('')

  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()
  expect(rig.wrapper.get('#tune-armed').text()).toBe('Armed: changes apply in flight')
  expect(rig.wrapper.get('#tune-armed-status').text()).toBe('The vehicle is armed: changes apply in flight.')
  expect(rig.wrapper.get('#tune-armed-status').attributes('role')).toBe('status')

  rig.control.armed?.(false)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: false } })
  await flushPromises()
  expect(rig.wrapper.find('#tune-armed').exists()).toBe(false)
  expect(rig.wrapper.get('#tune-armed-status').text()).toBe('The vehicle is disarmed.')
})

it('writes while the vehicle is armed, after a HOLD that says the changes apply in flight and names each parameter', async () => {
  const rig = await screen()
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()
  await slide(rig, 'ATC_RAT_RLL_P', 0.22)
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeUndefined()
  await write(rig)

  expect(rig.asked).toHaveLength(1)
  expect(rig.asked[0]?.split('\n')[0]).toBe('Armed: changes apply in flight.')
  expect(rig.asked[0]).toContain('ATC_RAT_RLL_P 0.135 → 0.22')
  expect(rig.asked[0]).toContain('ATC_RAT_PIT_P 0.135 → 0.22')
  expect(valueOf(rig, 'ATC_RAT_RLL_P')).toBeCloseTo(0.22, 5)
  expect(valueOf(rig, 'ATC_RAT_PIT_P')).toBeCloseTo(0.22, 5)
})

it('asks the hold again, and writes nothing, when the vehicle arms while the single question is open', async () => {
  const asked: string[] = []
  const state: { arm: () => void } = { arm: () => undefined }
  const { handle, control } = await vehicleOf({}, SETUP_PARAMS, question => {
    asked.push(question)
    state.arm()
  })
  state.arm = () => {
    control.armed?.(true)
    feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  }
  handle.staged.stage([{ id: 'ATC_RAT_YAW_P', to: 0.3 }], { tuning: true })
  await handle.staged.writeAll()

  // the plain question was answered yes, and the vehicle armed meanwhile: that is not the hold it needs
  expect(asked).toHaveLength(1)
  expect(asked[0]).not.toContain('Armed')
  expect(control.writesSent?.()).toEqual([])
  expect(handle.staged.pending()).toHaveLength(1)
})

it('does not write when the vehicle\'s state is not known (no recent heartbeat), and says why', async () => {
  const rig = await screen()
  await slide(rig, 'ATC_RAT_YAW_P', 0.3)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true, heartbeatAgeMs: 5000 } })
  await flushPromises()

  expect(rig.wrapper.get('#tune-rate-blocked').text()).toContain('not known')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] input[type="range"]').attributes('disabled')).toBeDefined()
  await write(rig)
  expect(rig.asked).toHaveLength(0)
  expect(rig.control.writesSent?.()).toEqual([])
})

it('does not write while the link is lost or reconnecting, and says why', async () => {
  const rig = await screen()
  await slide(rig, 'ATC_RAT_YAW_P', 0.3)
  rig.control.connection?.({ state: 'reconnecting', attempt: 1, nextRetryMs: 1000 })
  await flushPromises()

  expect(rig.wrapper.find('#tune-rate-blocked').exists()).toBe(true)
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  await write(rig)
  expect(rig.asked).toHaveLength(0)
  expect(rig.control.writesSent?.()).toEqual([])
})

it('has the Setup pages\' writes still refused while the vehicle is armed (tuning is the one exception)', async () => {
  const rig = await screen()
  rig.control.armed?.(true)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed: true } })
  await flushPromises()

  expect(rig.handle.staged.stage([{ id: 'ATC_RAT_YAW_P', to: 0.3 }], { guarded: true })).toBe(0)
  expect(rig.handle.staged.refused.value).toContain('Setup changes are not written while the vehicle is armed')
  expect(rig.handle.staged.stage([{ id: 'ATC_RAT_YAW_P', to: 0.3 }], { tuning: true })).toBe(1)
})

it('refuses to queue a value beyond the limits, or a name that is not the Tune screen\'s, whatever the page says', async () => {
  const rig = await screen()

  expect(rig.handle.staged.stage([{ id: 'ATC_RAT_YAW_P', to: 9 }], { tuning: true })).toBe(0)
  expect(rig.handle.staged.refused.value).toContain('above')
  expect(rig.handle.staged.stage([{ id: 'ATC_RAT_YAW_P', to: -1 }], { tuning: true })).toBe(0)
  expect(rig.handle.staged.refused.value).toContain('negative')
  expect(rig.handle.staged.stage([{ id: 'FS_THR_ENABLE', to: 0 }], { tuning: true })).toBe(0)
  expect(rig.handle.staged.refused.value).toContain('not a parameter the Tune screen writes')
})

/**
 * Tells the page and the mock that the vehicle is armed (or not).
 *
 * @param rig the rig
 * @param armed whether it is armed
 */
async function arm(rig: Rig, armed: boolean): Promise<void> {
  rig.control.armed?.(armed)
  feed(rig.handle, { telemetry: { ...telemetryAt(0), armed } })
  await flushPromises()
}

it('refuses a value below the least of the table while armed: the page says so, and nothing is written', async () => {
  const rig = await screen()
  await arm(rig, true)
  await type(rig, 'ATC_RAT_YAW_P', '0')

  expect(noteOf(rig, 'ATC_RAT_YAW_P')).toContain('refused')
  expect(noteOf(rig, 'ATC_RAT_YAW_P')).toContain('0.1')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-note').classes()).toContain('problem')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  await write(rig)
  expect(rig.asked).toHaveLength(0)
  expect(rig.control.writesSent?.()).toEqual([])
})

it('only warns of that value while the vehicle is disarmed, and writes it', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_YAW_P', '0')

  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-note').classes()).not.toContain('problem')
  await write(rig)
  expect(valueOf(rig, 'ATC_RAT_YAW_P')).toBe(0)
})

it('takes the least of the table itself while the vehicle is armed (after the hold)', async () => {
  const rig = await screen()
  await arm(rig, true)
  await type(rig, 'ATC_RAT_YAW_P', '0.1')

  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeUndefined()
  await write(rig)
  expect(rig.asked[0]?.split('\n')[0]).toBe('Armed: changes apply in flight.')
  expect(valueOf(rig, 'ATC_RAT_YAW_P')).toBeCloseTo(0.1, 5)
})

it('refuses to queue 0 armed for the names that have a least, and queues it disarmed', async () => {
  const rig = await screen()
  const names = ['ATC_RAT_RLL_P', 'ATC_RAT_PIT_P', 'ATC_ANG_RLL_P', 'PSC_D_ACC_P']

  await arm(rig, false)

  for (const id of names) {
    expect(rig.handle.staged.stage([{ id, to: 0 }], { tuning: true })).toBe(1)
  }
  rig.handle.staged.reset()
  await arm(rig, true)

  for (const id of names) {
    expect(rig.handle.staged.stage([{ id, to: 0 }], { tuning: true })).toBe(0)
    expect(rig.handle.staged.refused.value).toContain(`${id}: 0 is below`)
  }
})

it('does not write what was queued while disarmed when the vehicle arms before the answer, and says so', async () => {
  const asked: string[] = []
  const state: { arm: () => void } = { arm: () => undefined }
  const { handle, control } = await vehicleOf({}, SETUP_PARAMS, question => {
    asked.push(question)
    state.arm()
  })
  state.arm = () => {
    control.armed?.(true)
    feed(handle, { telemetry: { ...telemetryAt(0), armed: true } })
  }
  handle.staged.stage([{ id: 'ATC_RAT_YAW_P', to: 0 }], { tuning: true })
  await handle.staged.writeAll()

  expect(control.writesSent?.()).toEqual([])
  expect(handle.staged.refused.value).toContain('nothing was written')
})

it('does not link roll and pitch silently when they differ on the vehicle: the link is off, and says why', async () => {
  const params = SETUP_PARAMS.map(param => (param.id === 'ATC_RAT_PIT_P' ? { ...param, value: 0.2 } : param))
  const rig = await screen('/tune/rate', {}, params)

  expect(rig.wrapper.get('.tune-link input').element).toHaveProperty('checked', false)
  expect(rig.wrapper.get('#tune-rate-differ').text()).toContain('differ')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_RLL_P"] .tune-names').text()).toBe('ATC_RAT_RLL_P')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_PIT_P"] .tune-names').text()).toBe('ATC_RAT_PIT_P')
  // moving roll leaves pitch where it is
  await slide(rig, 'ATC_RAT_RLL_P', 0.3)
  await write(rig)
  expect(valueOf(rig, 'ATC_RAT_RLL_P')).toBeCloseTo(0.3, 5)
  expect(valueOf(rig, 'ATC_RAT_PIT_P')).toBeCloseTo(0.2, 5)
})

it('lets the user link roll and pitch that differ, and then names both in the question', async () => {
  const params = SETUP_PARAMS.map(param => (param.id === 'ATC_RAT_PIT_P' ? { ...param, value: 0.2 } : param))
  const rig = await screen('/tune/rate', {}, params)
  await rig.wrapper.get('.tune-link input').setValue(true)
  await slide(rig, 'ATC_RAT_RLL_P', 0.3)
  await write(rig)

  expect(rig.asked[0]).toContain('ATC_RAT_RLL_P 0.135 → 0.3')
  expect(rig.asked[0]).toContain('ATC_RAT_PIT_P 0.2 → 0.3')
  expect(valueOf(rig, 'ATC_RAT_PIT_P')).toBeCloseTo(0.3, 5)
})

it('puts the field back to the vehicle\'s value when the initial values are put back (the one button)', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_YAW_P', '0.25')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeUndefined()

  expect(rig.wrapper.find('#tune-rate-revert').exists()).toBe(false)
  await rig.wrapper.get('#tune-rate-initial').trigger('click')
  await flushPromises()
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] input[type="text"]').element).toHaveProperty('value', '0.18')
  expect(rig.wrapper.get('[data-tune="ATC_RAT_YAW_P"] .tune-was').text()).toBe('was 0.18')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  expect(rig.control.writesSent?.()).toEqual([])
})

it('lists under "What this writes" only what would be written: a refused value is shown as refused', async () => {
  const rig = await screen()
  await type(rig, 'ATC_RAT_YAW_P', '-1')
  await type(rig, 'ATC_RAT_YAW_I', '0.3')

  const lines = rig.wrapper.findAll('.tune-write-row')
  const written = lines.filter(line => !line.classes().includes('refused')).map(line => line.get('.name').text())
  expect(written).toEqual(['ATC_RAT_YAW_I'])
  const refused = rig.wrapper.get('.tune-write-row.refused')
  expect([refused.get('.name').text(), refused.get('.values').text()]).toEqual(['ATC_RAT_YAW_P', 'refused: not written'])
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
})

it('has nothing to write when a typed value is the float the vehicle holds (0.18 and the vehicle\'s 0.18000000298)', async () => {
  const params = SETUP_PARAMS.map(param => (param.id === 'ATC_RAT_YAW_P' ? { ...param, value: Math.fround(0.18) } : param))
  const rig = await screen('/tune/rate', {}, params)
  await type(rig, 'ATC_RAT_YAW_P', '0.25')
  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeUndefined()
  await type(rig, 'ATC_RAT_YAW_P', '0.18')

  expect(rig.wrapper.get('#tune-rate-write').attributes('disabled')).toBeDefined()
  expect(rig.wrapper.findAll('.tune-write-row')).toHaveLength(0)
})

it('draws no point of a rate that is not a number, and shows no number made of one', async () => {
  const rig = await screen()
  await vi.waitFor(() => expect(rig.control.tuning?.running()).toBe(true))
  const bad = [{ t: 100, v: Number.NaN }, { t: 140, v: Number.POSITIVE_INFINITY }, { t: 180, v: 2 }, { t: 220, v: 3 }]

  rig.control.tuning?.push({ actual: bad, desired: bad, dropped: 2, asked: { actual: true, desired: true } })
  await flushPromises()

  // only the two real points of each line are drawn; nothing says NaN
  expect(rig.wrapper.findAll('.chart-series .line')).toHaveLength(2)
  expect(rig.wrapper.get('#tune-response-chart').text()).not.toMatch(/NaN|Infinity/u)
  expect(rig.wrapper.get('#tune-overshoot').text()).toBe('—')
  expect(rig.wrapper.get('#tune-dropped').text()).toBe('Points dropped by the backend: 2')
})
