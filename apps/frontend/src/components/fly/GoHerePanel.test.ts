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

it('says the place and how far it is from the vehicle and from home, and offers Go here and Clear', async () => {
  const { wrapper } = await card()
  useGoHere().pick(NORTH)
  await flushPromises()

  expect(wrapper.get('#go-here-place').text()).toContain('52.23020, 21.01220')
  expect(wrapper.get('#go-here-place').text()).toContain('56 m from the vehicle, 56 m from home')
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
