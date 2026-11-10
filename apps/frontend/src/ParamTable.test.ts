import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ParamTable from './ParamTable.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'
import { PARAMS, telemetryAt } from './fixtures'
import type { Param } from './generated/app'

/**
 * Mounts the table on a fresh Configurator that already holds `params`.
 *
 * @param params the downloaded parameters
 * @returns the component and the Configurator
 */
function tableWith(params: Param[]) {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params, list: 'complete' })

  return { wrapper: mount(ParamTable, withI18n), handle }
}

it('lists the parameters with their value and type, and says how many', () => {
  const { wrapper } = tableWith(PARAMS)

  expect(wrapper.get('#list-status').text()).toBe('12 parameters')
  expect(wrapper.findAll('#rows tr')).toHaveLength(PARAMS.length)
  expect(wrapper.get('tr[data-id="RTL_ALT"]').text()).toContain('RTL_ALT')
})

it('marks the selected row, and selects the row that is clicked', async () => {
  const { wrapper, handle } = tableWith(PARAMS)
  const select = vi.spyOn(handle.parameters, 'select').mockImplementation(() => undefined)

  await wrapper.get('tr[data-id="BATT_CAPACITY"]').trigger('click')
  expect(select).toHaveBeenCalledWith('BATT_CAPACITY')

  feed(handle, { selected: 'BATT_CAPACITY' })
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('tr.selected')).toHaveLength(1)
  expect(wrapper.get('tr.selected').attributes('data-id')).toBe('BATT_CAPACITY')
})

it('shows only the parameters matching the filter, and says so', async () => {
  const { wrapper, handle } = tableWith(PARAMS)

  feed(handle, { filter: 'batt' })
  await wrapper.vm.$nextTick()

  expect(wrapper.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])
  expect(wrapper.get('#list-status').text()).toBe('2 of 12 parameters')
})

it('draws the group part of a name dimmed and the rest bright, with the value on the right', () => {
  const { wrapper } = tableWith(PARAMS)
  const row = wrapper.get('tr[data-id="BATT_LOW_VOLT"]')

  expect(row.get('.prefix').text()).toBe('BATT_')
  expect(row.get('th.name').text()).toBe('BATT_LOW_VOLT')
  expect(row.get('td.num').text()).toBe('10.5')
  expect(wrapper.get('thead').text()).not.toContain('Meaning')
  // Without metadata the table is two columns, as it was: nothing marks it as one with a description column.
  expect(wrapper.get('table').classes()).not.toContain('described')
  expect(wrapper.find('colgroup').exists()).toBe(false)
})

it('shows only the chosen group, and says how many of the whole it is', async () => {
  const { wrapper } = tableWith(PARAMS)

  useParamGroup().choose('BATT')
  await wrapper.vm.$nextTick()

  expect(wrapper.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])
  expect(wrapper.get('#list-status').text()).toBe('2 of 12 parameters')
  useParamGroup().choose('')
})

it('has a column of what the parameters mean once metadata is loaded', async () => {
  const { wrapper, handle } = tableWith(PARAMS)

  feed(handle, { metadata: new Map([['RTL_ALT', { description: 'Return altitude' }]]) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('thead').text()).toContain('Meaning')
  expect(wrapper.get('tr[data-id="RTL_ALT"] .meaning').text()).toBe('Return altitude')
  expect(wrapper.get('tr[data-id="BATT_CAPACITY"] .meaning').text()).toBe('')
  // The table is laid out for it (name and value as wide as their text, the description the rest of the row), and a
  // description that is cut short has its whole text as its tooltip; a row without one has no tooltip.
  expect(wrapper.get('table').classes()).toContain('described')
  // The widths of the first two columns come from the widest name (SERIAL0_BAUD, PILOT_SPEED_UP: 13) and value of the list,
  // in characters, whatever is shown; the third has none, it is what is left.
  const cols = wrapper.findAll('colgroup col')
  expect(cols.map(col => col.attributes('style'))).toEqual([
    expect.stringContaining('calc(14ch + var(--cell-padding))'),
    expect.stringContaining('calc(6ch + var(--cell-padding))'),
    undefined,
  ])
  expect(wrapper.get('tr[data-id="RTL_ALT"] .meaning').attributes('title')).toBe('Return altitude')
  expect(wrapper.get('tr[data-id="BATT_CAPACITY"] .meaning').attributes('title')).toBeUndefined()
})

it('keeps the header in a table of its own scroll area, and the count outside it', () => {
  const { wrapper } = tableWith(PARAMS)

  expect(wrapper.find('.param-scroll thead').exists()).toBe(true)
  expect(wrapper.find('.param-scroll #list-status').exists()).toBe(false)
  expect(wrapper.get('#list-status').classes()).toContain('list-status')
})

it('says there are no parameters yet, with what to do, when there are none', () => {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: [], list: 'none' })
  const wrapper = mount(ParamTable, withI18n)

  expect(wrapper.find('table').exists()).toBe(false)
  expect(wrapper.get('.kit-empty').text()).toContain('No parameters yet')
  expect(wrapper.get('.kit-empty').text()).toContain('Connect a vehicle to read its parameters.')
})

it.each([
  ['none', 'Connect a vehicle to read its parameters.'],
  ['loading', 'The parameters are on their way.'],
  ['failed', 'The download failed. Press Download to try again.'],
] as const)('says what an empty list is waiting for: %s', (list, help) => {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: [], list })
  const wrapper = mount(ParamTable, withI18n)

  expect(wrapper.get('.kit-empty').text()).toContain('No parameters yet')
  expect(wrapper.get('.kit-empty .help').text()).toBe(help)
})

it('says no parameter matches, and offers to show all of them again', async () => {
  const { wrapper, handle } = tableWith(PARAMS)
  const setFilter = vi.spyOn(handle.parameters, 'setFilter')

  feed(handle, { filter: 'zzz' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('.kit-empty').text()).toContain('No parameter matches')
  useParamGroup().choose('BATT')
  await wrapper.get('#clear-search').trigger('click')

  expect(setFilter).toHaveBeenCalledWith('')
  expect(useParamGroup().chosen.value).toBe('')
})

it('shows a parameter name as text, not markup', () => {
  const { wrapper } = tableWith([{ id: '<b>X</b>', index: 0, kind: 'int', type: 'UINT8', value: 1 }])

  expect(wrapper.get('#rows tr').text()).toContain('<b>X</b>')
  expect(wrapper.find('#rows b').exists()).toBe(false)
})

it('does not touch the rows when only the telemetry changes', async () => {
  const param = (i: number): Param => ({ id: `P_${i}`, index: i, kind: 'int', type: 'UINT16', value: i })
  const params = Array.from({ length: 1200 }, (_, i) => param(i))
  const { wrapper, handle } = tableWith(params)
  const row = wrapper.get('tr[data-id="P_600"]').element
  const mutations = new MutationObserver(() => undefined)
  const everything = { subtree: true, childList: true, attributes: true, characterData: true }
  mutations.observe(wrapper.element.parentElement ?? wrapper.element, everything)

  feed(handle, { telemetry: telemetryAt(1) })
  await wrapper.vm.$nextTick()
  feed(handle, { telemetry: telemetryAt(2) })
  await wrapper.vm.$nextTick()
  feed(handle, { telemetry: telemetryAt(3) })
  await wrapper.vm.$nextTick()

  expect(mutations.takeRecords()).toEqual([])
  expect(wrapper.get('tr[data-id="P_600"]').element).toBe(row)
  expect(wrapper.findAll('#rows tr')).toHaveLength(1200)
})
