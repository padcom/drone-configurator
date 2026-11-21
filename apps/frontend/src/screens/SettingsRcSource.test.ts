// The Settings screen's choice of where the gamepad is read from: the browser's by default, the backend's when it is chosen (the
// backend's pad is there at once, before any stick is moved, with all of its axes), several pads, a pad that may not be opened,
// and what the browser kept for the radio (found again by the browser's name, to be confirmed once).
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetRcAllowChoice } from '@/composables/useRcSettings'
import { i18n, setLanguage } from '@/i18n/i18n'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import type { MockPadSpec } from '@/mock/mock-pad'
import { profileKey, serialiseProfile } from '@/lib/rc/store'
import { TX16S } from '@/testing/fakeGamepads'
import { confirmedSuggestion } from '@/testing/rcProfiles'
import Settings from './Settings.vue'

const RADIO: MockPadSpec = { id: '1209:4f54', name: 'Radiomaster TX16S', axes: 8, buttons: 8, legacyId: TX16S }
const SECOND: MockPadSpec = { id: '045e:028e', name: 'Second pad', axes: 4, buttons: 4 }

let mounted: VueWrapper | undefined

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null] })
})

afterEach(() => {
  setLanguage('en')
  forgetRcAllowChoice()
  mounted?.unmount()
  mounted = undefined
  Reflect.deleteProperty(navigator, 'getGamepads')
})

/**
 * The Settings screen over settings that hold these entries.
 *
 * @param ui the entries
 * @returns the screen and what a test does with the mock's pads
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, control }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return { wrapper: mounted, handle, pads: control.pads! }
}

it('reads the browser\'s pad by default: the backend\'s pad is not read', async () => {
  const { wrapper, pads } = await screen()

  pads.plug(RADIO)
  await flushPromises()

  expect((wrapper.get('input[id$="-source-browser"]').element as HTMLInputElement).checked).toBe(true)
  expect(pads.reading()).toBe(0)
  expect(wrapper.find('#rc-device-name').exists()).toBe(false)
})

it('drops the browser\'s pad at once when the backend is chosen, and says the backend sees none', async () => {
  const pad = { id: TX16S, index: 0, connected: true, axes: [0, 0, -1, 0, 0, 0, 0, 0], buttons: [{ value: 0 }] }

  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
  const { wrapper } = await screen()

  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(TX16S), { timeout: 5000 })
  await wrapper.get('input[id$="-source-backend"]').setValue(true)
  await vi.waitFor(() => expect(wrapper.find('#rc-device-name').exists()).toBe(false), { timeout: 5000 })

  expect(wrapper.get('#rc-no-device').text()).toContain('The backend sees no gamepad')
  expect(wrapper.find('.rc-mapping').exists()).toBe(false)
})

it('shows the browser\'s pad again when the browser is chosen again', async () => {
  const pad = { id: TX16S, index: 0, connected: true, axes: [0, 0, -1, 0, 0, 0, 0, 0], buttons: [{ value: 0 }] }

  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
  const { wrapper } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  await vi.waitFor(() => expect(wrapper.find('#rc-no-device').exists()).toBe(true), { timeout: 5000 })
  await wrapper.get('input[id$="-source-browser"]').setValue(true)
  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(TX16S), { timeout: 5000 })
})

it('shows the browser\'s pad again when the source flips there and back between two reads of the pad', async () => {
  const pad = { id: TX16S, index: 0, connected: true, axes: [0, 0, -1, 0, 0, 0, 0, 0], buttons: [{ value: 0 }] }

  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
  const { wrapper } = await screen()

  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(TX16S), { timeout: 5000 })
  // (no read of the pad comes between these: the screen was never told that the pad went, and it is there again)
  await wrapper.get('input[id$="-source-backend"]').setValue(true)
  await wrapper.get('input[id$="-source-browser"]').setValue(true)
  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(TX16S), { timeout: 5000 })

  expect(wrapper.find('.rc-mapping').exists()).toBe(true)
})

it('shows the backend\'s pad at once, with its axes and buttons, when the backend is chosen', async () => {
  const { wrapper, pads } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  pads.plug(RADIO)
  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(RADIO.id), { timeout: 5000 })
  await vi.waitFor(() => expect(wrapper.findAll('.rc-axes li.rc-absent')).toHaveLength(0), { timeout: 5000 })

  expect(wrapper.findAll('.rc-axes li')).toHaveLength(16)
  expect(pads.reading()).toBe(1)
})

it('says the backend is not reading the pad any more once it is unplugged, not "move a stick"', async () => {
  const { wrapper, pads } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  pads.plug(RADIO)
  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(RADIO.id), { timeout: 5000 })
  pads.unplug(RADIO.id)
  await vi.waitFor(() => expect(wrapper.find('#rc-device-gone').exists()).toBe(true), { timeout: 5000 })

  expect(wrapper.get('#rc-device-gone').text()).toContain('The backend is not reading this gamepad')
})

it('says the backend could not list the pads (not "no gamepad") when it has no pad service (an old build)', async () => {
  const control: MockControl = {}
  const settings = { version: 1, ui: [{ key: 'rc.padSource', value: 'backend' }] }
  const handle = createConfigurator(mockBackend({ settings, control, withoutPads: true }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  mounted = mount(Settings, { global: { plugins: [i18n] }, attachTo: document.body })

  await vi.waitFor(() => expect(mounted!.find('#rc-source-unavailable').exists()).toBe(true), { timeout: 5000 })

  expect(mounted.get('#rc-source-unavailable').text()).toContain('UNKNOWN_METHOD')
  expect(mounted.get('#rc-source-unavailable').text()).toContain('built before this feature')
  expect(mounted.find('#rc-no-device').exists()).toBe(false)
  expect(mounted.find('#rc-source-answer').exists()).toBe(false)
})

it('says what the backend answered, once it has: how many gamepads it lists and how many it may not open', async () => {
  const { wrapper, pads } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  pads.plug(RADIO)
  pads.plug(SECOND)
  pads.deny(SECOND.id, true)
  await vi.waitFor(() => {
    expect(wrapper.get('#rc-source-answer').text()).toBe('Gamepads the backend lists: 1. Gamepads it may not open: 1.')
  }, { timeout: 5000 })

  expect(wrapper.find('#rc-source-unavailable').exists()).toBe(false)
})

it('says there is no pad, in the backend\'s words, while it sees none', async () => {
  const { wrapper } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  await vi.waitFor(() => expect(wrapper.get('#rc-no-device').text()).toContain('The backend sees no gamepad'))
  // (said once: the answer's own line adds nothing when the backend listed none and may open all of them)
  expect(wrapper.find('#rc-source-answer').exists()).toBe(false)
  expect(wrapper.find('#rc-source-asking').exists()).toBe(false)
  expect(wrapper.find('#rc-source-unavailable').exists()).toBe(false)
})

it('chooses the source and keeps it in the settings', async () => {
  const { wrapper, handle } = await screen()

  await wrapper.get('input[id$="-source-backend"]').setValue(true)
  await flushPromises()

  expect(handle.settings.uiValue('rc.padSource')).toBe('backend')
})

it('lets the person choose among several pads, and keeps the choice', async () => {
  const { wrapper, handle, pads } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  pads.plug(RADIO)
  pads.plug(SECOND)
  await vi.waitFor(() => expect(wrapper.find('select[id$="-pad"]').exists()).toBe(true), { timeout: 5000 })
  await wrapper.get('select[id$="-pad"]').setValue(SECOND.id)
  await flushPromises()

  expect(handle.settings.uiValue('rc.padDevice')).toBe(SECOND.id)
  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(SECOND.id), { timeout: 5000 })
})

it('says a pad may not be opened, and what to do, and offers no read of it', async () => {
  const { wrapper, pads } = await screen([{ key: 'rc.padSource', value: 'backend' }])

  pads.plug(RADIO)
  pads.deny(RADIO.id, true)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="rc-denied"]').exists()).toBe(true), { timeout: 5000 })

  expect(wrapper.get('[data-testid="rc-denied"]').text()).toContain('udev')
  expect(pads.reading()).toBe(0)
})

it('says the backend cannot read pads here, and goes on with the browser\'s', async () => {
  const { wrapper, pads } = await screen([{ key: 'rc.padSource', value: 'auto' }])

  pads.supported(false)
  await vi.waitFor(() => expect(wrapper.find('#rc-source-unsupported').exists()).toBe(true), { timeout: 5000 })

  expect(pads.reading()).toBe(0)
})

it('finds what the browser kept for the radio by its old name: for the new id, not confirmed', async () => {
  const kept = { ...confirmedSuggestion(TX16S, 'centred') }
  const ui = [{ key: 'rc.padSource', value: 'backend' }, { key: profileKey(TX16S), value: serialiseProfile(kept) }]
  const { wrapper, pads } = await screen(ui)

  pads.plug(RADIO)
  await vi.waitFor(() => expect(wrapper.get('#rc-device-name').text()).toBe(RADIO.id), { timeout: 5000 })
  await vi.waitFor(() => expect(wrapper.find('#rc-unconfirmed').exists()).toBe(true), { timeout: 5000 })

  expect(wrapper.get('input[type="radio"][value="centred"]').element as HTMLInputElement).toHaveProperty('checked', true)
  expect(wrapper.find('#rc-confirmed').exists()).toBe(false)
})
