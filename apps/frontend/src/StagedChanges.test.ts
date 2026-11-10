import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS, VEHICLE } from './fixtures'
import { mockBackend } from './mock-backend'
import StagedChanges from './StagedChanges.vue'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

/**
 * The list on a fresh Configurator with the parameters downloaded and a vehicle connected, saying yes to every question.
 *
 * @returns the component and the Configurator
 */
async function listWith() {
  const handle = createConfigurator(mockBackend(), () => Promise.resolve(true))
  const wrapper = mount(StagedChanges, withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, list: 'complete', connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  return { wrapper, handle }
}

/**
 * Adds a change to the list.
 *
 * @param handle the Configurator
 * @param id the parameter
 * @param value the new value, as typed
 */
function add(handle: Awaited<ReturnType<typeof listWith>>['handle'], id: string, value: string): void {
  handle.parameters.select(id)
  handle.parameters.editDraft(value)
  handle.staged.stage()
}

it('shows nothing of its own when there are no changes, keeps its name for a screen reader, and cannot write', async () => {
  const { wrapper } = await listWith()

  expect(wrapper.find('h2').exists()).toBe(false)
  expect(wrapper.find('.staged-list').exists()).toBe(false)
  expect(wrapper.text()).toBe('Write 0 and verify')
  expect(wrapper.get('#staged').attributes('aria-label')).toBe('Changes to write')
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#write-staged').text()).toBe('Write 0 and verify')
})

it('lists each change with the value now and the value to write, and takes one out with Discard', async () => {
  const { wrapper, handle } = await listWith()
  add(handle, 'RTL_ALT', '1600')
  add(handle, 'BATT_LOW_VOLT', '11')
  await wrapper.vm.$nextTick()

  const rows = wrapper.findAll('.staged-row')
  expect(rows.map(row => row.get('.name').text())).toEqual(['RTL_ALT', 'BATT_LOW_VOLT'])
  expect(rows[0]?.get('.values').text()).toBe('1500 → 1600')
  expect(wrapper.find('h2').exists()).toBe(false)
  expect(wrapper.get('#write-staged').text()).toBe('Write 2 and verify')

  // A trash can on the right of the row, named for the parameter it takes out, with a tooltip; no word on it.
  const trash = rows[0]!.get('.discard')
  expect(trash.attributes('aria-label')).toBe('Discard RTL_ALT')
  expect(trash.attributes('title')).toBe('Discard RTL_ALT')
  expect(trash.text()).toBe('')
  expect(trash.find('svg path').attributes('d')).toBeDefined()
  expect(rows[1]!.get('.discard').attributes('aria-label')).toBe('Discard BATT_LOW_VOLT')

  await trash.trigger('click')

  expect(wrapper.findAll('.staged-row').map(row => row.get('.name').text())).toEqual(['BATT_LOW_VOLT'])
})

it('writes the changes on the button, and says each was written and read back, and that all were', async () => {
  const { wrapper, handle } = await listWith()
  // This one needs a vehicle that answers: the simulated one is really connected.
  await handle.vehicle.connect({ transport: 'simulator' })
  await handle.parameters.refresh()
  const call = vi.spyOn(handle.staged, 'writeAll')
  add(handle, 'RTL_ALT', '1600')
  await wrapper.vm.$nextTick()

  await wrapper.get('#write-staged').trigger('click')
  await flushPromises()
  await wrapper.vm.$nextTick()

  expect(call).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.staged-row .line.ok').text()).toBe('✓ Written and read back: 1600')
  expect(wrapper.get('.staged-status[role="status"]').text()).toBe('All 1 written and read back.')
  expect(wrapper.find('.staged-row .discard').exists()).toBe(false)
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeDefined()
})

it('says in an alert that writing stopped, and marks the change that was not confirmed with a cross', async () => {
  const { wrapper, handle } = await listWith()
  add(handle, 'RTL_ALT', '1600')
  add(handle, 'BATT_LOW_VOLT', '11')
  handle.staged.results.value = [{ id: 'RTL_ALT', outcome: 'changed', detail: 'the vehicle reports 1599, not 1600' }]
  await wrapper.vm.$nextTick()

  expect(wrapper.get('.staged-row .line.error').text()).toBe('✕ the vehicle reports 1599, not 1600')
  expect(wrapper.get('.staged-status[role="alert"]').text()).toBe('Stopped there: the rest weren\'t written.')
  expect(wrapper.get('.staged-status[role="status"]').text()).toBe('')
  expect(wrapper.find('.staged-row.changed .discard').exists()).toBe(true)
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeUndefined()
})

it('turns the run off while another write holds the lock (the single Write, a snapshot), and on again after', async () => {
  const { wrapper, handle } = await listWith()
  add(handle, 'RTL_ALT', '1600')
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeUndefined()

  const release = handle.parameters.lock.take()
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeDefined()
  release?.()
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#write-staged').attributes('disabled')).toBeUndefined()
})

it('forgets the changes when the link is ended or another vehicle comes up, and keeps them across a resumed link', async () => {
  const { wrapper, handle } = await listWith()
  add(handle, 'RTL_ALT', '1600')
  feed(handle, { connection: { state: 'lost', vehicle: { ...VEHICLE } } })
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE }, resumed: true } })
  await wrapper.vm.$nextTick()
  expect(handle.staged.changes.value).toHaveLength(1)

  feed(handle, { connection: { state: 'disconnected' } })
  await wrapper.vm.$nextTick()
  expect(handle.staged.changes.value).toEqual([])

  add(handle, 'RTL_ALT', '1700')
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()
  expect(handle.staged.changes.value).toEqual([])
})

it('has its polite and its assertive region from the start, and cannot write while the vehicle is not connected', async () => {
  const { wrapper, handle } = await listWith()
  add(handle, 'RTL_ALT', '1600')
  feed(handle, { connection: { state: 'lost', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  expect(wrapper.find('.staged-status[role="status"]').exists()).toBe(true)
  expect(wrapper.find('.staged-status[role="alert"]').exists()).toBe(true)
  expect(wrapper.get('#write-staged').attributes('disabled')).toBeDefined()
})
