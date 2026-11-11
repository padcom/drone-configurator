import { afterEach, expect, it, vi } from 'vitest'
import { type DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import SnapshotImport from './SnapshotImport.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { VEHICLE } from '@/mock/fixtures'
import type { Review } from '@/lib/params/snapshot'

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
  const togglePick = vi.spyOn(handle.snapshots, 'toggle').mockImplementation(() => undefined)
  const applyImport = vi.spyOn(handle.snapshots, 'apply').mockResolvedValue()
  const closeImport = vi.spyOn(handle.snapshots, 'close').mockImplementation(() => undefined)
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
  expect(text).toContain('Different: 2; already the same: 10. Tick the ones to write.')
  const row = (id: string) => wrapper.findAll('tbody tr').find(candidate => candidate.get('th').text() === id)
  const cells = (id: string) => row(id)?.findAll('td').map(cell => cell.text())
  expect(cells('RTL_ALT')).toEqual(['', '1500', '→ 2000', ''])
  expect(cells('NOT_A_PARAM')).toEqual(['', '—', '→ 1', 'not on this vehicle'])
  expect(wrapper.findAll('thead th').map(cell => cell.text()))
    .toEqual(['Apply', 'Name', 'On the vehicle', 'In the snapshot', 'Result'])
})

it('names each box by the parameter it applies, and says what is ticked, in a region that is always there', async () => {
  const { wrapper, handle } = await panelWithSpies()
  const status = () => wrapper.get('.review-status[role="status"]')

  expect(status().attributes('role')).toBe('status')
  expect(status().text()).toBe('Tick the changes you want.')
  expect(wrapper.get('input[data-pick="RTL_ALT"]').attributes('aria-label')).toBe('Apply RTL_ALT')
  expect(wrapper.get('#apply').text()).toBe('Write 0 ticked')

  feed(handle, { picked: ['RTL_ALT'] })
  await wrapper.vm.$nextTick()
  expect(status().text()).toContain('1 ticked.')
  expect(wrapper.get('#apply').text()).toBe('Write 1 ticked')
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

  expect(wrapper.get('td.result.ok').text()).toBe('✓ Written and read back: 2000')
  expect(wrapper.get('.review-status[role="alert"]').text()).toBe('Stopped there: the rest weren\'t written.')
  expect(wrapper.get('.review-status[role="status"]').text()).toBe('')
})

it('turns Write off while another write (the single one, the collected changes) holds the lock', async () => {
  const { wrapper, handle } = await panelWithSpies()
  feed(handle, { picked: ['RTL_ALT'] })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#apply').attributes('disabled')).toBeUndefined()

  const release = handle.parameters.lock.take()
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#apply').attributes('disabled')).toBeDefined()
  release?.()
})

it('marks a row whose write did not verify with a cross and its reason, and never as written', async () => {
  const { wrapper, handle } = await panelWithSpies()

  feed(handle, { picked: ['RTL_ALT'], applied: [{ id: 'RTL_ALT', outcome: 'failed', detail: 'TIMEOUT: no reply' }] })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('td.result.error').text()).toBe('✕ TIMEOUT: no reply')
  expect(wrapper.find('td.result.ok').exists()).toBe(false)
  expect(wrapper.get('tbody tr.error').text()).toContain('RTL_ALT')
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
  const saveFile = vi.spyOn(handle.snapshots, 'saveFile').mockResolvedValue(null)
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
