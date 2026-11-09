import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { LAYOUT_KEY, decodeLayout, encodeLayout } from './flightLayoutKept'
import type { Settings } from './generated/app'
import FlightData from './screens/FlightData.vue'
import { mockBackend } from './mock-backend'
import { withI18n } from './testing'
import { type ConfiguratorHandle, createConfigurator } from './useConfigurator'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Flight data screen on a Configurator whose backend holds `settings`.
 *
 * @param settings what the backend kept
 * @returns the mounted screen, its bars, and the handle
 */
async function screenWith(settings: Settings) {
  const handle = createConfigurator(mockBackend({ settings }))
  mounted = mount(FlightData, { ...withI18n, attachTo: document.body })
  await flushPromises()
  const [main, side] = mounted.findAll('[role="separator"]')

  return { wrapper: mounted, main: main!, side: side!, handle }
}

/**
 * The settings of a backend that kept this text as the layout.
 *
 * @param text what was kept
 * @returns the settings
 */
function keeping(text: string): Settings {
  return { version: 1, ui: [{ key: LAYOUT_KEY, value: text }] }
}

it('shows the layout that was kept, as soon as the settings have been read', async () => {
  const kept = { main: 72, side: 30, tab: 'telemetry', reopen: { main: 72, side: 30 } }

  const { main, side } = await screenWith(keeping(encodeLayout(kept)))

  expect([main.attributes('aria-valuenow'), side.attributes('aria-valuenow')]).toEqual(['72', '30'])
})

it('shows a pane that was collapsed when the app closed as collapsed, and opens it at the size it had', async () => {
  const kept = { main: 5, side: 40, tab: 'telemetry', reopen: { main: 75, side: 40 } }

  const { wrapper, main } = await screenWith(keeping(encodeLayout(kept)))
  expect(wrapper.findAll('.flight-pane')[0]!.classes()).toContain('collapsed')
  await wrapper.find('button.toggle').trigger('click')

  expect(main.attributes('aria-valuenow')).toBe('75')
})

const OPEN = { main: 70, side: 30 }

it.each([
  ['not JSON', 'rubbish'],
  ['a layout of another version', JSON.stringify({ version: 2, ...OPEN, tab: 'telemetry', reopen: OPEN })],
  ['sizes outside the limits', JSON.stringify({ version: 1, main: 400, side: 30, tab: 'telemetry', reopen: OPEN })],
])('starts on the default layout when what was kept is %s', async (_what, text) => {
  const { main, side } = await screenWith(keeping(text))

  expect([main.attributes('aria-valuenow'), side.attributes('aria-valuenow')]).toEqual(['60', '40'])
})

/**
 * The layout the settings of a handle hold, as it is read back.
 *
 * @param handle the Configurator
 * @returns the layout, or null
 */
function keptBy(handle: ConfiguratorHandle) {
  return decodeLayout(handle.settings.uiValue(LAYOUT_KEY))
}

it('keeps a change, and the next start has it', async () => {
  const first = await screenWith({ version: 1, ui: [] })

  await first.main.trigger('keydown', { key: 'ArrowRight' })
  await first.side.trigger('keydown', { key: 'ArrowUp' })
  await vi.waitFor(() => expect(keptBy(first.handle)).toMatchObject({ main: 65, side: 35 }), { timeout: 3000, interval: 50 })
  mounted?.unmount()

  const second = await screenWith(first.handle.settings.settings.value)

  expect([second.main.attributes('aria-valuenow'), second.side.attributes('aria-valuenow')]).toEqual(['65', '35'])
})
