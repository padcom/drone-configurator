import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FramePresets from './FramePresets.vue'
import SnapshotImport from './SnapshotImport.vue'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { withI18n } from '@/testing/testing'
import { armedOf } from '@/lib/app/armed'
import { createConfigurator } from '@/composables/useConfigurator'
import { askForFocus } from '@/composables/useFocusIntent'

// The presets are the mock backend's (mock/mock-presets.ts), made up: ArduPilot's own are GPL and never part of the repository.

afterEach(() => {
  delete window.picoDesktop
  document.body.innerHTML = ''
})

/**
 * A Configurator connected to the mock's simulator, its parameters downloaded, armed or not.
 *
 * @param armed whether the vehicle is armed
 * @returns the Configurator
 */
async function connected(armed = false) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ telemetryMs: 5, control }))
  control.armed?.(armed)
  await handle.vehicle.connect({ transport: 'simulator' })
  const state = () => [handle.parameters.list.value, armedOf(handle.vehicle.telemetry.value)]
  await vi.waitFor(() => expect(state()).toEqual(['complete', armed]))

  return handle
}

/**
 * Mounts the presets on a connected Configurator, its list shown.
 *
 * @param armed whether the vehicle is armed
 * @returns the component and the Configurator
 */
async function shown(armed = false) {
  const handle = await connected(armed)
  await handle.presets.show()
  const wrapper = mount(FramePresets, { ...withI18n, attachTo: document.body })
  await flushPromises()

  return { wrapper, handle }
}

it('lists the presets, says where the list came from, and narrows it with the search', async () => {
  const { wrapper } = await shown()

  expect(wrapper.get('h3').text()).toBe('Frame presets from ArduPilot')
  expect(wrapper.get('#presets-source').text())
    .toBe('From ArduPilot master: the vehicle did not report a released firmware version.')
  expect(wrapper.get('#presets-freshness').text()).toBe('Kept on this computer.')
  expect(wrapper.findAll('[data-path]').map(row => row.attributes('data-path')))
    .toEqual(['Mock-Quad-Long-Range.param', 'Mock-Quad-Racer.param', 'Boats/Mock-Boat.parm'])
  expect(wrapper.get('#presets-count').text()).toBe('3 of 3 presets')

  await wrapper.get('#presets-search').setValue('racer')

  expect(wrapper.findAll('[data-path]').map(row => row.attributes('data-path'))).toEqual(['Mock-Quad-Racer.param'])
  expect(wrapper.get('#presets-count').text()).toBe('1 of 3 presets')
})

it('shows a preset\'s contents, and "Review and apply" puts every change under review', async () => {
  const { wrapper, handle } = await shown()
  expect(wrapper.get('#preset-review').attributes('disabled')).toBeDefined()

  await handle.presets.select('Mock-Quad-Long-Range.param')
  await flushPromises()

  expect(wrapper.get('#preset-name').text()).toBe('Mock-Quad-Long-Range')
  expect(wrapper.get('#preset-text').text()).toContain('WPNAV_SPEED,1200')
  expect(wrapper.text()).toContain('Every change is shown for review; nothing is written until you confirm.')
  await wrapper.get('#preset-review').trigger('click')

  const review = mount(SnapshotImport, withI18n)
  expect(review.get('h3').text()).toBe('Frame preset: Mock-Quad-Long-Range.param (ArduPilot master)')
  expect(review.findAll('input[data-pick]:checked').map(box => box.attributes('data-pick')))
    .toEqual(['BATT_CAPACITY', 'WPNAV_SPEED', 'RTL_ALT'])
  expect(handle.presets.open.value).toBe(false)
})

it('says that a preset is applied only while the vehicle is disarmed, and does not offer it', async () => {
  const { wrapper, handle } = await shown(true)
  await handle.presets.select('Mock-Quad-Racer.param')
  await flushPromises()

  expect(wrapper.get('.review-status.warn').text()).toMatch(/applied only while the vehicle is disarmed/u)
  expect(wrapper.get('.review-status.warn').attributes('role')).toBe('alert')
  expect(wrapper.get('#preset-review').attributes('disabled')).toBeDefined()
})

it('takes the focus into the search when the palette asked for it', async () => {
  const handle = await connected()
  askForFocus('presets.search')
  void handle.presets.show()
  mount(FramePresets, { ...withI18n, attachTo: document.body })

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('presets-search'))
})

it('closes', async () => {
  const { wrapper, handle } = await shown()

  await wrapper.get('#close-presets').trigger('click')

  expect(handle.presets.open.value).toBe(false)
})
