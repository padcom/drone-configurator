// The View switch: Standard leaves out the parameters the metadata marks as advanced, Full lists all. It is offered only when the
// metadata has a User for some parameter, is kept in the settings, changes the group counts, and does not limit a search.
import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import ParamGroups from './ParamGroups.vue'
import ParamTable from './ParamTable.vue'
import ParamView from './ParamView.vue'
import { VIEW_KEY } from '@/lib/params/paramView'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { useParamGroup } from '@/composables/useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

const METADATA = new Map([
  ['BATT_CAPACITY', { user: 'advanced' as const, description: 'Battery capacity' }],
  ['BATT_LOW_VOLT', { user: 'standard' as const, description: 'Low voltage' }],
  ['FENCE_RADIUS', { user: 'advanced' as const, description: 'Fence radius' }],
])

/**
 * The screen's parts on a Configurator that has the fixture parameters.
 *
 * @param options what the settings hold under the view's key, and whether the metadata is loaded
 * @param options.stored the view the settings hold
 * @param options.metadata whether the metadata is loaded
 * @returns the components and the Configurator
 */
async function screen(options: { stored?: string, metadata?: boolean } = {}) {
  const ui = options.stored ? [{ key: VIEW_KEY, value: options.stored }] : []
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await handle.settings.load()
  feed(handle, { params: PARAMS, list: 'complete', metadata: options.metadata === false ? new Map() : METADATA })
  const table = mount(ParamTable, { ...withI18n, attachTo: document.body })
  const groups = mount(ParamGroups, withI18n)
  const view = mount(ParamView, withI18n)
  await flushPromises()

  return { table, groups, view, handle }
}

type Table = Awaited<ReturnType<typeof screen>>['table']
const ids = (table: Table) => table.findAll('#rows tr').map(row => row.attributes('data-id'))

it('is a choice of Standard and Full, Full chosen, once the metadata has a User', async () => {
  const { view } = await screen()
  const radios = view.findAll<HTMLInputElement>('input[type="radio"]')

  expect(view.get('[role="radiogroup"]').attributes('aria-label')).toBe('View')
  expect(radios.map(radio => radio.element.value)).toEqual(['standard', 'full'])
  expect(radios.map(radio => radio.element.checked)).toEqual([false, true])
})

it('is not offered without metadata, or with metadata that has no User, and lists everything then', async () => {
  const none = await screen({ metadata: false, stored: 'standard' })
  expect(none.view.find('[role="radiogroup"]').exists()).toBe(false)
  expect(ids(none.table)).toHaveLength(PARAMS.length)

  feed(none.handle, { metadata: new Map([['RTL_ALT', { description: 'x' }]]) })
  await flushPromises()
  expect(none.view.find('[role="radiogroup"]').exists()).toBe(false)
  expect(ids(none.table)).toHaveLength(PARAMS.length)
})

it('leaves out the advanced ones in Standard, keeps the order, and keeps the choice in the settings', async () => {
  const { table, view, handle } = await screen()

  await view.get('input[value="standard"]').setValue(true)
  await flushPromises()

  expect(ids(table)).toEqual(PARAMS.map(param => param.id).filter(id => id !== 'BATT_CAPACITY' && id !== 'FENCE_RADIUS'))
  expect(handle.settings.uiValue(VIEW_KEY)).toBe('standard')
  expect(table.get('#list-status').text()).toBe('10 of 12 parameters')
  await view.get('input[value="full"]').setValue(true)
  await flushPromises()
  expect(ids(table)).toHaveLength(PARAMS.length)
})

it('starts in the view the settings hold', async () => {
  const { table, view } = await screen({ stored: 'standard' })

  expect(ids(table)).not.toContain('BATT_CAPACITY')
  expect(view.get<HTMLInputElement>('input[value="standard"]').element.checked).toBe(true)
})

it('has the counts of the groups, and of All, of what the view lists', async () => {
  const { groups } = await screen({ stored: 'standard' })
  const count = (id: string) => groups.get(`button[data-group="${id}"] .count`).text()

  expect(count('')).toBe('10')
  expect(count('BATT')).toBe('1')
  expect(count('FENCE')).toBe('1')
})

it('does not limit a search, which is over every parameter, advanced ones included', async () => {
  const { table, handle } = await screen({ stored: 'standard' })

  handle.parameters.setFilter('BATT_CAPACITY')
  await flushPromises()

  expect(ids(table)).toEqual(['BATT_CAPACITY'])
})
