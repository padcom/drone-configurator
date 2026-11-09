import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ParamTable from './ParamTable.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
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
