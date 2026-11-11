// A new list, from its top: when what is searched changes, when a group is chosen, the first row is selected and the list is
// scrolled to the top, once, with the focus where it was.
import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS } from './fixtures'
import { mockBackend } from './mock-backend'
import ParamFilter from './ParamFilter.vue'
import ParamGroups from './ParamGroups.vue'
import ParamTable from './ParamTable.vue'
import { feed, groupsOff, groupsOn, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
  groupsOff()
})

/**
 * The list, its search and its groups on a Configurator with the fixture parameters; the scroll box has a height of 200 px and
 * counts how many times it is set to the top.
 *
 * @returns the components, the Configurator, the box and the count
 */
async function screen() {
  const handle = createConfigurator(mockBackend())
  groupsOn()
  feed(handle, { params: PARAMS, list: 'complete' })
  const table = mount(ParamTable, { ...withI18n, attachTo: document.body })
  const filter = mount(ParamFilter, { ...withI18n, attachTo: document.body })
  const groups = mount(ParamGroups, withI18n)
  await flushPromises()
  const box = table.get('.param-scroll').element
  const tops = { count: 0, at: 300 }
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 200 })
  Object.defineProperty(box, 'scrollTop', {
    configurable: true,
    get: () => tops.at,
    set: (value: number) => {
      tops.count += value === 0 ? 1 : 0
      tops.at = value
    },
  })

  return { table, filter, groups, handle, tops }
}

it('selects the first match and scrolls to the top, once, when the search changes', async () => {
  const { handle, tops, filter } = await screen()
  handle.parameters.select('WPNAV_SPEED')
  await flushPromises()
  tops.count = 0
  tops.at = 300
  const search = filter.get<HTMLInputElement>('#filter')
  search.element.focus()

  await search.setValue('FENCE')
  await flushPromises()

  expect(handle.fields.selected.value).toBe('FENCE_ENABLE')
  expect(tops.at).toBe(0)
  expect(tops.count).toBe(1)
  expect(document.activeElement).toBe(search.element)
})

it('selects the first parameter and scrolls to the top when a group is chosen', async () => {
  const { handle, tops, groups } = await screen()
  tops.at = 300
  tops.count = 0

  await groups.get('button[data-group="FENCE"]').trigger('click')
  await flushPromises()

  expect(handle.fields.selected.value).toBe('FENCE_ENABLE')
  expect(tops.at).toBe(0)
  expect(tops.count).toBe(1)
})

it('says nothing politely while the first match changes with every key typed, and speaks when the user moves', async () => {
  const { handle, table, filter } = await screen()
  handle.parameters.select('WPNAV_SPEED')
  await flushPromises()
  const said = table.get('#selection-status').text()
  expect(said).toBe('WPNAV_SPEED, 12 of 12')
  const search = filter.get<HTMLInputElement>('#filter')

  await search.setValue('A')
  await flushPromises()
  const first = handle.fields.selected.value
  await search.setValue('FE')
  await flushPromises()
  await search.setValue('FENCE')
  await flushPromises()

  expect(handle.fields.selected.value).toBe('FENCE_ENABLE')
  expect(first).not.toBe('FENCE_ENABLE')
  expect(table.get('#selection-status').text()).toBe(said)
  handle.parameters.select('FENCE_RADIUS')
  await flushPromises()
  expect(table.get('#selection-status').text()).toBe('FENCE_RADIUS, 2 of 2')
})

it('does it again when the search is cleared, and when a search finds nothing the list is still left at the top', async () => {
  const { handle, tops, filter } = await screen()
  const search = filter.get<HTMLInputElement>('#filter')
  await search.setValue('NO_SUCH_PARAMETER')
  await flushPromises()
  tops.at = 300

  await search.setValue('')
  await flushPromises()

  expect(handle.fields.selected.value).toBe('ARMING_CHECK')
  expect(tops.at).toBe(0)
})
