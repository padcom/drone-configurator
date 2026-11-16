// The dialog of Change altitude: it proposes the altitude the vehicle is at, takes an altitude from 2 m to the user's highest,
// has a plain
// button (not a hold) that ignores presses in its first moments, says that the vehicle changes to GUIDED first when it is not
// in it, and sends
// ONE change of altitude when the button is pressed.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { useChangeAltitude } from '@/composables/useChangeAltitude'
import { forgetGuidedChoices } from '@/composables/useGuidedPreferences'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { sentOf } from '@/testing/arming'
import { inTheAir } from '@/testing/guided'
import { feed } from '@/testing/testing'
import ChangeAltitudeDialog from './ChangeAltitudeDialog.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetGuidedChoices()
  useChangeAltitude().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * The dialog over a connected vehicle that is armed in the air (in GUIDED, or in the mode given).
 *
 * @param mode the vehicle's flight mode
 * @returns the dialog and what drives it
 */
async function dialog(mode = 'GUIDED') {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(true)
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))
  feed(handle, { telemetry: inTheAir({ mode }), list: 'complete' })
  await vi.waitFor(() => expect(handle.setup.modes.value).not.toBeNull())
  mounted = mount(ChangeAltitudeDialog, { global: { plugins: [i18n] }, attachTo: document.body })
  useChangeAltitude().show()
  await flushPromises()

  return { wrapper: mounted, control }
}

/**
 * Waits until the dialog takes presses (its first moments are over).
 *
 * @param wrapper the dialog
 */
async function takesPresses(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => expect(wrapper.get('#altitude-go').attributes('data-armed')).toBe('true'))
}

it('proposes the altitude the vehicle is at, has Cancel with the focus, and a plain button', async () => {
  const { wrapper } = await dialog()

  expect((wrapper.get('#altitude-field').element as HTMLInputElement).value).toBe('20')
  expect(document.activeElement?.id).toBe('altitude-cancel')
  expect(wrapper.find('#confirm-hold').exists()).toBe(false)
  expect(wrapper.get('#altitude-go').text()).toBe('Change altitude')
  expect(wrapper.get('#altitude-limits').text()).toContain('2 to 50 m')
  expect(wrapper.get('#altitude-vehicle').text()).toContain('QUADROTOR')
  expect(wrapper.get('#altitude-what').text()).toContain('cancelled')
})

it('does not go ahead with an altitude that is not a number, below 2 m or above the highest, and says why', async () => {
  const { wrapper, control } = await dialog()
  const cases: [string, string][] = [
    ['', 'Type a number'], ['x', 'Type a number'], ['1', 'At least 2 m.'], ['51', 'At most 50 m.'],
  ]

  for (const [text, words] of cases) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await wrapper.get('#altitude-field').setValue(text)

    expect(wrapper.get('#altitude-go').attributes('disabled'), text).toBeDefined()
    expect(wrapper.get('#altitude-problem').text(), text).toContain(words)
  }
  await wrapper.get('#altitude-go').trigger('click')

  expect(sentOf(control)).toEqual([])
})

it('says that the vehicle changes to GUIDED first when it is in another mode, and not when it is in GUIDED', async () => {
  const guided = await dialog()

  expect(guided.wrapper.get('#altitude-what').text()).not.toContain('GUIDED first')
  mounted?.unmount()
  document.body.innerHTML = ''
  useChangeAltitude().hide()
  const loiter = await dialog('LOITER')

  expect(loiter.wrapper.get('#altitude-what').text()).toContain('changes to GUIDED first')
})

it('ignores a press in its first moments, and then sends ONE change of altitude and closes', async () => {
  const { wrapper, control } = await dialog()
  await wrapper.get('#altitude-field').setValue('25')

  expect(wrapper.get('#altitude-go').attributes('data-armed')).toBe('false')
  await wrapper.get('#altitude-go').trigger('click')

  expect(sentOf(control)).toEqual([])
  expect(wrapper.find('dialog').exists()).toBe(true)
  await takesPresses(wrapper)
  await wrapper.get('#altitude-go').trigger('click')
  await vi.waitFor(() => expect(sentOf(control)).toEqual(['altitude 25 block']))

  expect(wrapper.find('dialog').exists()).toBe(false)
})

it('closes with Cancel and sends nothing', async () => {
  const { wrapper, control } = await dialog()
  await wrapper.get('#altitude-cancel').trigger('click')

  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(sentOf(control)).toEqual([])
})
