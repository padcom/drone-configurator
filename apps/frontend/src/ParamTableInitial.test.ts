// The list with initial values: the footer that says when they were taken, the mark of a changed row, "Reset N changed to initial
// values", and what turns Download and the writing off.
import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS, VEHICLE } from './fixtures'
import { initialOf } from './initialValues'
import { mockBackend } from './mock-backend'
import ParamFilter from './ParamFilter.vue'
import ParamTable from './ParamTable.vue'
import StagedChanges from './StagedChanges.vue'
import { feed, withI18n } from './testing'
import { useToasts } from './toasts'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
  const toasts = useToasts()
  for (const toast of [...toasts.visible.value]) {
    toasts.dismiss(toast.key)
  }
})

/**
 * The list on a Configurator that has downloaded the fixture parameters (the initial values are theirs), with a vehicle there.
 *
 * @returns the component and the Configurator
 */
async function screen() {
  const handle = createConfigurator(mockBackend(), () => Promise.resolve(true))
  const table = mount(ParamTable, withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, list: 'complete', connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await table.vm.$nextTick()
  // The connection that came up is a new session, which forgets the initial values: they are the ones of its download.
  feed(handle, { initial: initialOf(PARAMS, new Date(2026, 10, 10, 14, 2, 11).getTime()) })
  await table.vm.$nextTick()

  return { table, handle }
}

/**
 * Changes a value of the list, as a write or another ground station would.
 *
 * @param handle the Configurator
 * @param id the parameter
 * @param value its new value
 */
function change(handle: Awaited<ReturnType<typeof screen>>['handle'], id: string, value: number): void {
  feed(handle, { params: handle.fields.params.value.map(param => param.id === id ? { ...param, value } : param) })
}

it('says when the initial values were taken, under the list', async () => {
  const { table } = await screen()

  expect(table.get('#initial-status').text()).toBe('Initial values: downloaded 14:02:11')
  expect(table.get('#list-status').text()).toBe('12 parameters')
})

it('says nothing of initial values before there is a complete download', () => {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'incomplete' })
  const table = mount(ParamTable, withI18n)

  expect(table.find('#initial-status').exists()).toBe(false)
  expect(table.find('#reset-all').exists()).toBe(false)
})

it('marks a changed value (accent, heavier) with a tooltip and a description for a screen reader; the number stays', async () => {
  const { table, handle } = await screen()

  change(handle, 'RTL_ALT', 1600)
  await table.vm.$nextTick()

  const cell = table.get('tr[data-id="RTL_ALT"] td.num')
  expect(cell.classes()).toContain('changed')
  expect(cell.text()).toBe('1600')
  expect(cell.attributes('title')).toBe('Changed from its initial value 1500')
  expect(cell.attributes('aria-description')).toBe('Changed from its initial value 1500')
  expect(table.findAll('td.num.changed')).toHaveLength(1)
  change(handle, 'RTL_ALT', 1500)
  await table.vm.$nextTick()
  expect(table.findAll('td.num.changed')).toHaveLength(0)
})

it('says how many parameters changed on the button, which is off at none', async () => {
  const { table, handle } = await screen()
  const button = table.get('#reset-all')
  expect(button.text()).toBe('Reset 0 changed to initial values')
  expect(button.attributes('disabled')).toBeDefined()

  change(handle, 'RTL_ALT', 1600)
  change(handle, 'BATT_CAPACITY', 6000)
  await table.vm.$nextTick()

  expect(button.text()).toBe('Reset 2 changed to initial values')
  expect(button.attributes('disabled')).toBeUndefined()
})

it('queues the initial value of every changed parameter, and writes nothing', async () => {
  const { table, handle } = await screen()
  change(handle, 'RTL_ALT', 1600)
  change(handle, 'BATT_CAPACITY', 6000)
  await table.vm.$nextTick()

  await table.get('#reset-all').trigger('click')

  expect(handle.staged.changes.value.map(c => [c.id, c.from, c.to, c.origin])).toEqual([
    ['BATT_CAPACITY', 6000, 5200, 'reset'],
    ['RTL_ALT', 1600, 1500, 'reset'],
  ])
  expect(handle.staged.writing.value).toBe(false)
  expect(useToasts().visible.value.map(toast => toast.text))
    .toContain('2 queued to go back to their initial values. Press Write to send them.')
})

it('leaves the counters STAT_* out of the bulk reset, and every other parameter that changed in', async () => {
  const stat = { id: 'STAT_RUNTIME', index: 50, kind: 'int' as const, type: 'UINT32', value: 100 }
  const params = [...PARAMS, stat]
  const handle = createConfigurator(mockBackend())
  const table = mount(ParamTable, withI18n)
  await flushPromises()
  feed(handle, { params, list: 'complete', connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await table.vm.$nextTick()
  feed(handle, { initial: initialOf(params, 0) })
  const now: Record<string, number> = { STAT_RUNTIME: 500, RTL_ALT: 1 }
  feed(handle, { params: params.map(p => p.id in now ? { ...p, value: now[p.id] as number } : p) })
  await table.vm.$nextTick()

  expect(table.get('#reset-all').text()).toBe('Reset 1 changed to initial values')
  await table.get('#reset-all').trigger('click')

  expect(handle.staged.changes.value.map(c => c.id)).toEqual(['RTL_ALT'])
})

it('is off while a write holds the lock, while the list is downloading, and without a connection', async () => {
  const { table, handle } = await screen()
  change(handle, 'RTL_ALT', 1600)
  await table.vm.$nextTick()
  const disabled = () => table.get('#reset-all').attributes('disabled') !== undefined
  expect(disabled()).toBe(false)

  const release = handle.parameters.lock.take()
  await table.vm.$nextTick()
  expect(disabled()).toBe(true)
  release?.()
  feed(handle, { list: 'loading' })
  await table.vm.$nextTick()
  expect(disabled()).toBe(true)
  feed(handle, { list: 'complete', connection: { state: 'lost', vehicle: { ...VEHICLE } } })
  await table.vm.$nextTick()
  expect(disabled()).toBe(true)
})

it('turns Download off while a write holds the lock, and on again after', async () => {
  const { handle } = await screen()
  const toolbar = mount(ParamFilter, withI18n)
  await toolbar.vm.$nextTick()
  expect(toolbar.get('#refresh').attributes('disabled')).toBeUndefined()

  const release = handle.parameters.lock.take()
  await toolbar.vm.$nextTick()
  expect(toolbar.get('#refresh').attributes('disabled')).toBeDefined()

  release?.()
  await toolbar.vm.$nextTick()
  expect(toolbar.get('#refresh').attributes('disabled')).toBeUndefined()
})

it('turns Write off while the list is being downloaded, and on again after', async () => {
  const { handle } = await screen()
  const staged = mount(StagedChanges, withI18n)
  handle.parameters.select('RTL_ALT')
  handle.parameters.editDraft('1600')
  handle.staged.sync()
  await staged.vm.$nextTick()
  expect(staged.get('#write-staged').attributes('disabled')).toBeUndefined()

  feed(handle, { list: 'loading' })
  await staged.vm.$nextTick()
  expect(staged.get('#write-staged').attributes('disabled')).toBeDefined()
  await handle.staged.writeAll()
  expect(handle.staged.writing.value).toBe(false)

  feed(handle, { list: 'complete' })
  await staged.vm.$nextTick()
  expect(staged.get('#write-staged').attributes('disabled')).toBeUndefined()
})
