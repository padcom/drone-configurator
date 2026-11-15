// The dialog of Take off: the altitude (within 2 m and the user's highest takeoff, lower still under the vehicle's fence), a
// plain button that goes ahead (not a hold), Cancel with the focus, and what the button does with a vehicle armed in GUIDED.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { useTakeoff } from '@/composables/useTakeoff'
import { forgetTakeoffCeilingChoice } from '@/composables/useTakeoffCeiling'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { sentOf } from '@/testing/arming'
import { ready } from '@/testing/takeoff'
import { feed } from '@/testing/testing'
import TakeoffDialog from './TakeoffDialog.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetTakeoffCeilingChoice()
  useTakeoff().hide()
  useTakeoff().typed.value = '10'
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/** What a test gives the vehicle and the settings. */
interface Setup {
  /** The vehicle's parameters, by name. */
  params: Record<string, number>
  /** The settings' entries. */
  ui: { key: string, value: string }[]
  /** Whether the vehicle's fence parameters are there (they are, switched off, unless a test says not). */
  withFence: boolean
  /** What the list of parameters says it is: whole, or still coming. */
  list: 'complete' | 'loading'
}

const PLAIN: Setup = { params: {}, ui: [], withFence: true, list: 'complete' }

/**
 * The dialog over a connected vehicle that is armed in GUIDED (or not).
 *
 * @param armed whether the vehicle says it is armed
 * @param setup what the vehicle has and the settings say
 * @returns the dialog and what drives it
 */
async function open(armed: boolean, setup: Setup) {
  const { params, ui } = setup
  const fence = setup.withFence ? { FENCE_ENABLE: 0, FENCE_TYPE: 0, FENCE_ALT_MAX: 0 } : {}
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control, settings: { version: 1, ui } }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(armed)
  // (the mock's own parameter download is over before the test's parameters are put in)
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))
  feed(handle, {
    params: Object.entries({ ...fence, ...params })
      .map(([id, value], index) => ({ id, kind: 'int', type: 'INT32', value, index })),
    list: setup.list,
    telemetry: ready({ armed, mode: 'GUIDED' }),
  })
  await vi.waitFor(() => expect(handle.setup.modes.value).not.toBeNull())
  mounted = mount(TakeoffDialog, { global: { plugins: [i18n] }, attachTo: document.body })
  useTakeoff().show()
  await flushPromises()

  return { wrapper: mounted, control, handle }
}

/**
 * The dialog over a vehicle that has what the settings say and nothing else of note.
 *
 * @param armed whether the vehicle says it is armed
 * @returns the dialog and what drives it
 */
function dialog(armed: boolean) {
  return open(armed, PLAIN)
}

/**
 * Waits until the dialog takes presses (its first moments are over).
 *
 * @param wrapper the dialog
 */
async function takesPresses(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => expect(wrapper.get('#takeoff-go').attributes('data-armed')).toBe('true'))
}

/**
 * Types in the altitude field.
 *
 * @param wrapper the dialog
 * @param text what is typed
 */
async function type(wrapper: VueWrapper, text: string): Promise<void> {
  await wrapper.get('#takeoff-altitude').setValue(text)
  await flushPromises()
}

it('has the altitude of the last takeoff (10 m at first), Cancel with the focus, and a plain button', async () => {
  const { wrapper } = await dialog(true)

  expect((wrapper.get('#takeoff-altitude').element as HTMLInputElement).value).toBe('10')
  expect(document.activeElement?.id).toBe('takeoff-cancel')
  expect(wrapper.find('#confirm-hold').exists()).toBe(false)
  expect(wrapper.get('#takeoff-go').text()).toBe('Take off')
  expect(wrapper.get('#takeoff-limits').text()).toContain('2 to 50 m')
})

it('names the vehicle', async () => {
  const { wrapper } = await dialog(true)

  expect(wrapper.get('#takeoff-vehicle').text()).toContain('QUADROTOR')
})

it('ignores a press in its first moments (a click meant for what was under it), and goes ahead after them', async () => {
  const { wrapper, control } = await dialog(true)

  expect(wrapper.get('#takeoff-go').attributes('data-armed')).toBe('false')
  await wrapper.get('#takeoff-go').trigger('click')
  await flushPromises()

  expect(sentOf(control)).toEqual([])
  expect(wrapper.find('dialog').exists()).toBe(true)
  await takesPresses(wrapper)
  await wrapper.get('#takeoff-go').trigger('click')
  await vi.waitFor(() => expect(sentOf(control)).toEqual(['takeoff 10']))
})

it('does not go ahead while the vehicle\'s fence is not known (the parameters are still coming), and says so', async () => {
  const { wrapper, control } = await open(true, { ...PLAIN, withFence: false, list: 'loading' })
  await takesPresses(wrapper)

  expect(wrapper.get('#takeoff-fence').text()).toContain('fence is not known')
  expect(wrapper.get('#takeoff-go').attributes('disabled')).toBeDefined()
  await wrapper.get('#takeoff-go').trigger('click')

  expect(sentOf(control)).toEqual([])
})

it('looks at the vehicle again when the button is pressed: a fix that was lost while it was open sends nothing', async () => {
  const { wrapper, control, handle } = await dialog(true)
  await takesPresses(wrapper)
  feed(handle, { telemetry: ready({ armed: true, mode: 'GUIDED', gps: { fixType: 1, ageMs: 10 } }) })
  await flushPromises()
  await wrapper.get('#takeoff-go').trigger('click')
  await flushPromises()

  expect(sentOf(control)).toEqual([])
  expect(wrapper.find('dialog').exists()).toBe(false)
})

it('says it arms first when the vehicle is disarmed, and does not when it is armed', async () => {
  const disarmed = await dialog(false)
  const said = disarmed.wrapper.get('#takeoff-what').text()
  mounted?.unmount()
  document.body.innerHTML = ''
  useTakeoff().hide()
  const armed = await dialog(true)

  expect(said).toContain('hold to arm')
  expect(armed.wrapper.get('#takeoff-what').text()).not.toContain('hold to arm')
})

it('does not go ahead with an altitude outside the limits or one that is not a number, and says why', async () => {
  const { wrapper, control } = await dialog(true)
  const cases: [string, string][] = [
    ['1', 'At least 2 m.'], ['51', 'At most 50 m.'], ['ten', 'Type a number'], ['', 'Type a number'],
  ]

  for (const [text, words] of cases) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await type(wrapper, text)

    expect(wrapper.get('#takeoff-go').attributes('disabled'), text).toBeDefined()
    expect(wrapper.get('#takeoff-problem').text(), text).toContain(words)
  }
  await wrapper.get('#takeoff-go').trigger('click')

  expect(sentOf(control)).toEqual([])
  expect(wrapper.find('dialog').exists()).toBe(true)
})

it('limits the altitude to the vehicle\'s fence when the fence is lower than the setting, and says so', async () => {
  const { wrapper } = await open(true, { ...PLAIN, params: { FENCE_ENABLE: 1, FENCE_TYPE: 1, FENCE_ALT_MAX: 25 } })
  await type(wrapper, '30')

  expect(wrapper.get('#takeoff-limits').text()).toContain("the vehicle's own fence")
  expect(wrapper.get('#takeoff-problem').text()).toContain('At most 25 m.')
  await type(wrapper, '25')

  expect(wrapper.get('#takeoff-go').attributes('disabled')).toBeUndefined()
})

it('uses the highest takeoff of the settings', async () => {
  const { wrapper } = await open(true, { ...PLAIN, ui: [{ key: 'takeoff.ceiling', value: '30' }] })

  expect(wrapper.get('#takeoff-limits').text()).toContain('2 to 30 m')
  await type(wrapper, '40')

  expect(wrapper.get('#takeoff-problem').text()).toContain('At most 30 m.')
})

it('closes with Cancel and sends nothing', async () => {
  const { wrapper, control } = await dialog(true)
  await wrapper.get('#takeoff-cancel').trigger('click')

  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(sentOf(control)).toEqual([])
})

it('takes off an armed vehicle in GUIDED when the button is pressed: it closes, and sends the takeoff once', async () => {
  const { wrapper, control } = await dialog(true)
  await type(wrapper, '15')
  await takesPresses(wrapper)
  await wrapper.get('#takeoff-go').trigger('click')
  await vi.waitFor(() => expect(sentOf(control)).toEqual(['takeoff 15']))

  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(useTakeoff().typed.value).toBe('15')
})

it('goes ahead for a firmware without a fence: the whole list is there and has no FENCE_ENABLE', async () => {
  const { wrapper } = await open(true, { ...PLAIN, withFence: false })
  await takesPresses(wrapper)

  expect(wrapper.get('#takeoff-fence').text()).toBe('')
  expect(wrapper.get('#takeoff-go').attributes('disabled')).toBeUndefined()
})
