// The card of a Go here: not there until a place is picked, then the place, how far it is, why Go here may not run (or the
// button that
// runs it, with the setting's confirmation), and Clear. With the setting at "none" the button flies at once: the speed, then
// one reposition.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { useGoHere } from '@/composables/useGoHere'
import { forgetGuidedChoices } from '@/composables/useGuidedPreferences'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { sentOf } from '@/testing/arming'
import { HOME, NORTH, inTheAir } from '@/testing/guided'
import { feed } from '@/testing/testing'
import GoHerePanel from './GoHerePanel.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  forgetGuidedChoices()
  useGoHere().clear()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * The card over a connected vehicle that is armed in GUIDED, in the air, with its whole parameter list.
 *
 * @param ui the settings' entries
 * @returns the card and what drives it
 */
async function card(ui: { key: string, value: string }[] = []) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 600_000, control, settings: { version: 1, ui } }))
  await handle.vehicle.connect({ transport: 'simulator' })
  control.armed?.(true)
  await vi.waitFor(() => expect(handle.fields.list.value).toBe('complete'))
  feed(handle, { telemetry: inTheAir(), list: 'complete' })
  await vi.waitFor(() => expect(handle.setup.modes.value).not.toBeNull())
  mounted = mount(GoHerePanel, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, control, handle }
}

it('is not there until a place is picked', async () => {
  const { wrapper } = await card()

  expect(wrapper.find('#go-here').exists()).toBe(false)
  useGoHere().pick(NORTH)
  await flushPromises()

  expect(wrapper.find('#go-here').exists()).toBe(true)
})

it('says the place, and offers Go here and Clear; the distances are the confirmation\'s to say (once)', async () => {
  const { wrapper } = await card()
  useGoHere().pick(NORTH)
  await flushPromises()

  expect(wrapper.get('#go-here-place').text()).toContain('52.23020, 21.01220')
  expect(wrapper.find('#go-here-away').exists()).toBe(false)
  expect(wrapper.get('#go-here-go').text()).toBe('Go here')
  expect(wrapper.get('#go-here-go').attributes('aria-disabled')).toBeUndefined()
  expect(wrapper.find('#go-here-why').exists()).toBe(false)
})

it('says why Go here may not run: a place farther from home than the limit', async () => {
  const { wrapper } = await card()
  useGoHere().pick({ lat: HOME.lat + 0.01, lon: HOME.lon })
  await flushPromises()

  expect(wrapper.get('#go-here-why').text()).toBe('That place is farther from home than your limit in Settings.')
  expect(wrapper.get('#go-here-go').attributes('aria-disabled')).toBe('true')
})

it('drops the place with Clear, and sends nothing', async () => {
  const { wrapper, control } = await card()
  useGoHere().pick(NORTH)
  await flushPromises()
  await wrapper.get('#go-here-clear').trigger('click')
  await flushPromises()

  expect(wrapper.find('#go-here').exists()).toBe(false)
  expect(useGoHere().target.value).toBeNull()
  expect(sentOf(control)).toEqual([])
})

it('flies at once when Settings say not to ask: the speed, then one reposition, and the place is dropped', async () => {
  const { wrapper, control } = await card([{ key: 'guided.confirmation', value: 'none' }])
  useGoHere().pick(NORTH)
  await flushPromises()
  await wrapper.get('#go-here-go').trigger('click')
  await vi.waitFor(() => expect(sentOf(control)).toEqual(['speed 5', 'reposition 52.2302,21.0122 20 block']))

  expect(useGoHere().target.value).toBeNull()
})

it('says how far the place is when no confirmation will say it', async () => {
  const { wrapper } = await card([{ key: 'guided.confirmation', value: 'none' }])
  useGoHere().pick(NORTH)
  await flushPromises()

  expect(wrapper.get('#go-here-away').text()).toBe('56 m from the vehicle, 56 m from home')
})

it('says before the click that Go here will switch the vehicle to GUIDED, when it is in another mode', async () => {
  const { wrapper, handle } = await card()
  useGoHere().pick(NORTH)
  await flushPromises()

  expect(wrapper.find('#go-here-mode').exists()).toBe(false)
  feed(handle, { telemetry: inTheAir({ mode: 'LOITER' }) })
  await flushPromises()

  expect(wrapper.get('#go-here-mode').text()).toBe('Go here will switch the vehicle to GUIDED.')
})

it('says that the speed stays set when the move is refused', async () => {
  const { wrapper } = await card()
  useGoHere().pick(NORTH)
  await flushPromises()

  expect(wrapper.get('#go-here').text()).toContain('sets the speed of GUIDED to 5 m/s; it stays so if the move is then refused')
})

it.each([
  ['RTL', 'The vehicle is returning home or landing: change its mode yourself first.'],
  ['LAND', 'The vehicle is returning home or landing: change its mode yourself first.'],
])('refuses a vehicle that is in %s: the user changes the mode on purpose', async (mode, words) => {
  const { wrapper, handle } = await card()
  useGoHere().pick(NORTH)
  feed(handle, { telemetry: inTheAir({ mode }) })
  await flushPromises()

  expect(wrapper.get('#go-here-why').text()).toBe(words)
  expect(wrapper.find('#go-here-mode').exists()).toBe(false)
})

it('refuses a vehicle above the highest altitude of the user instead of sending it down', async () => {
  const { wrapper, handle } = await card()
  useGoHere().pick(NORTH)
  feed(handle, { telemetry: inTheAir({ position: { ...inTheAir().position!, relativeAltitude: 70 } }) })
  await flushPromises()

  expect(wrapper.get('#go-here-why').text()).toBe('The vehicle is above your highest altitude in Settings.')
})

it('drops the place when the link is lost, and when another vehicle answers: it was picked for one vehicle', async () => {
  const vehicle = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' }
  const { control } = await card()
  useGoHere().pick(NORTH)
  control.connection?.({ state: 'reconnecting', vehicle, attempt: 1 })
  await flushPromises()

  expect(useGoHere().target.value).toBeNull()
  useGoHere().pick(NORTH)
  control.connection?.({ state: 'connected', vehicle, resumed: true })
  await flushPromises()

  // (the same vehicle coming back: a place picked now is kept)
  expect(useGoHere().target.value).toEqual(NORTH)
  control.connection?.({ state: 'connected', vehicle, errorCode: 'VEHICLE_CHANGED', error: 'another vehicle' })
  await flushPromises()

  expect(useGoHere().target.value).toBeNull()
})
