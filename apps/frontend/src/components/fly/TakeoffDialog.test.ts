// The dialog of Take off: the altitude (within 2 m and the user's highest takeoff, lower still under the vehicle's fence), a
// plain button that goes ahead (not a hold), Cancel with the focus, and what the button does with a vehicle armed in GUIDED.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { useTakeoff } from '@/composables/useTakeoff'
import { forgetTakeoffCeilingChoice } from '@/composables/useTakeoffCeiling'
import { i18n, setLanguage } from '@/i18n/i18n'
import { telemetryAt } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { sentOf } from '@/testing/arming'
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

/**
 * The dialog over a connected vehicle that is armed in GUIDED (or not).
 *
 * @param armed whether the vehicle says it is armed
 * @param params the vehicle's parameters, by name
 * @param ui the settings' entries
 * @returns the dialog and what drives it
 */
async function dialog(armed: boolean, params: Record<string, number> = {}, ui: { key: string, value: string }[] = []) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control, settings: { version: 1, ui } }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(armed)
  // (the mock's own parameter download is over before the test's parameters are put in)
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))
  feed(handle, {
    params: Object.entries(params).map(([id, value], index) => ({ id, kind: 'int', type: 'INT32', value, index })),
    list: 'complete',
    telemetry: { ...telemetryAt(0), armed, mode: 'GUIDED' },
  })
  await vi.waitFor(() => expect(handle.setup.modes.value).not.toBeNull())
  mounted = mount(TakeoffDialog, { global: { plugins: [i18n] }, attachTo: document.body })
  useTakeoff().show()
  await flushPromises()

  return { wrapper: mounted, control }
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
  const { wrapper } = await dialog(true, { FENCE_ENABLE: 1, FENCE_TYPE: 1, FENCE_ALT_MAX: 25 })
  await type(wrapper, '30')

  expect(wrapper.get('#takeoff-limits').text()).toContain("the vehicle's own fence")
  expect(wrapper.get('#takeoff-problem').text()).toContain('At most 25 m.')
  await type(wrapper, '25')

  expect(wrapper.get('#takeoff-go').attributes('disabled')).toBeUndefined()
})

it('uses the highest takeoff of the settings', async () => {
  const { wrapper } = await dialog(true, {}, [{ key: 'takeoff.ceiling', value: '30' }])

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
  await wrapper.get('#takeoff-go').trigger('click')
  await vi.waitFor(() => expect(sentOf(control)).toEqual(['takeoff 15']))

  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(useTakeoff().typed.value).toBe('15')
})
