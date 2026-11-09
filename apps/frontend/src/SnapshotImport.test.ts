import { afterEach, expect, it, vi } from 'vitest'
import { type DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import SnapshotImport from './SnapshotImport.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { VEHICLE } from './fixtures'
import type { Review } from './snapshot'

const review: Review = {
  snapshot: { format: 'drone-configurator/params', version: 1, savedAt: '2026-11-07T12:00:00.000Z', params: [] },
  changes: [
    { id: 'RTL_ALT', from: 1500, to: 2000, problem: null },
    { id: 'NOT_A_PARAM', from: null, to: 1, problem: 'not on this vehicle' },
  ],
  unchanged: 10,
  vehicleWarning: 'saved from a FIXED_WING (ARDUPILOTMEGA); this is a QUADROTOR (ARDUPILOTMEGA)',
}

afterEach(() => {
  delete window.picoDesktop
})

/**
 * Mounts the panel on a fresh Configurator whose actions are spies, connected, with `review` loaded.
 *
 * @returns the component, the Configurator and the spies
 */
async function panelWithSpies() {
  const handle = createConfigurator(mockBackend())
  const togglePick = vi.spyOn(handle.app, 'togglePick').mockImplementation(() => undefined)
  const applyImport = vi.spyOn(handle.app, 'applyImport').mockResolvedValue()
  const closeImport = vi.spyOn(handle.app, 'closeImport').mockImplementation(() => undefined)
  const wrapper = mount(SnapshotImport, withI18n)
  await flushPromises()
  feed(handle, { importReview: review, connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  return { wrapper, handle, togglePick, applyImport, closeImport }
}

it('is hidden until a snapshot is loaded', async () => {
  createConfigurator(mockBackend())
  const wrapper = mount(SnapshotImport, withI18n)
  await flushPromises()

  expect(wrapper.get('#import-panel').attributes('hidden')).toBeDefined()
})

it('shows what the snapshot would change, and the warning for a different vehicle', async () => {
  const { wrapper } = await panelWithSpies()
  const text = wrapper.get('#import').text()

  expect(wrapper.get('#import-panel').attributes('hidden')).toBeUndefined()
  expect(text).toContain('Snapshot from 2026-11-07T12:00:00.000Z')
  expect(text).toContain('It was saved from a FIXED_WING (ARDUPILOTMEGA); this is a QUADROTOR (ARDUPILOTMEGA).')
  expect(text).toContain('2 differ, 10 already the same. Tick the ones to write.')
  expect(text).toContain('RTL_ALT: 1500 → 2000')
  expect(text).toContain('NOT_A_PARAM: — → 1 (not on this vehicle)')
})

it('lets only the changes that can be applied be ticked, and passes the ticks on', async () => {
  const { wrapper, handle, togglePick } = await panelWithSpies()
  const box = (index: number) => wrapper.findAll<HTMLInputElement>('input[type=checkbox]')[index] as DOMWrapper<HTMLInputElement>

  expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(2)
  expect(box(0).attributes('disabled')).toBeUndefined()
  expect(box(1).attributes('disabled')).toBeDefined()

  await box(0).setValue(true)
  expect(togglePick).toHaveBeenCalledWith('RTL_ALT')

  feed(handle, { picked: ['RTL_ALT'] })
  await wrapper.vm.$nextTick()
  expect(box(0).element.checked).toBe(true)
})

it('writes the ticked changes only when something is ticked and the vehicle is connected', async () => {
  const { wrapper, handle, applyImport } = await panelWithSpies()
  expect(wrapper.get('#apply').attributes('disabled')).toBeDefined()

  feed(handle, { picked: ['RTL_ALT'] })
  await wrapper.vm.$nextTick()
  await wrapper.get('#apply').trigger('click')
  expect(applyImport).toHaveBeenCalledTimes(1)

  feed(handle, { applying: true })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#apply').attributes('disabled')).toBeDefined()
  expect(wrapper.findAll('input[type=checkbox]').every(box => box.attributes('disabled') !== undefined)).toBe(true)
})

it('says how each applied change went, and that the rest were not written when one did not verify', async () => {
  const { wrapper, handle } = await panelWithSpies()

  feed(handle, {
    applied: [
      { id: 'RTL_ALT', outcome: 'verified', detail: '2000' },
      { id: 'FENCE_ENABLE', outcome: 'failed', detail: 'TIMEOUT: no reply' },
    ],
  })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#import .ok').text()).toBe('RTL_ALT: written and read back: 2000')
  expect(wrapper.get('#import .error').text()).toBe('FENCE_ENABLE: TIMEOUT: no reply')
  expect(wrapper.get('#import').text()).toContain('Stopped there: the rest weren\'t written.')
})

it('offers the backup once there is one, and closes', async () => {
  const { wrapper, handle, closeImport } = await panelWithSpies()
  expect(wrapper.get('#backup').attributes('hidden')).toBeDefined()

  feed(handle, { backup: '{"backup":true}' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#backup').attributes('hidden')).toBeUndefined()

  await wrapper.get('#close-import').trigger('click')
  expect(closeImport).toHaveBeenCalledTimes(1)
})

it('saves the backup through the host in Pico Desktop', async () => {
  const { wrapper, handle } = await panelWithSpies()
  const saveFile = vi.spyOn(handle.app, 'saveFile').mockResolvedValue(null)
  window.picoDesktop = {} as never
  feed(handle, { backup: '{"backup":true}' })
  await wrapper.vm.$nextTick()

  await wrapper.get('#backup').trigger('click')

  expect(saveFile).toHaveBeenCalledWith(expect.stringMatching(/^backup-quadrotor-1-.*\.json$/u), '{"backup":true}')
})

it('shows why a file could not be loaded, as text', async () => {
  const { wrapper, handle } = await panelWithSpies()

  feed(handle, { importReview: null, importError: 'Can\'t load it: <b>not JSON</b>.' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#import .error').text()).toBe('Can\'t load it: <b>not JSON</b>.')
  expect(wrapper.find('#import b').exists()).toBe(false)
  expect(wrapper.get('#import-panel').attributes('hidden')).toBeUndefined()
})
