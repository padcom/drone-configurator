// The star in the list and the Favourites group: a star is a button in the row that does not select it, the key `*` stars the
// selected row, the group lists the starred parameters that the vehicle has (with a count and an empty state), and the stars
// are kept in the settings.
import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS } from './fixtures'
import { FAVOURITES_KEY } from './favourites'
import { mockBackend } from './mock-backend'
import ParamGroups from './ParamGroups.vue'
import ParamTable from './ParamTable.vue'
import { FAVOURITES_GROUP } from './paramGroups'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

/**
 * The list and the groups on a Configurator that has the fixture parameters, with the stars the settings hold.
 *
 * @param starred the names the settings hold as favourites
 * @returns the components and the Configurator
 */
async function screen(starred: string[] = []) {
  const settings = { version: 1, ui: [{ key: FAVOURITES_KEY, value: JSON.stringify(starred) }] }
  const handle = createConfigurator(mockBackend({ settings }))
  await handle.settings.load()
  feed(handle, { params: PARAMS, list: 'complete' })
  const table = mount(ParamTable, { ...withI18n, attachTo: document.body })
  const groups = mount(ParamGroups, withI18n)
  await flushPromises()

  return { table, groups, handle }
}

it('has a star in every row: a button that says what it does, not a stop of the Tab key, pressed for a favourite', async () => {
  const { table } = await screen(['RTL_ALT'])
  const star = (id: string) => table.get(`tr[data-id="${id}"] td.star button`)

  expect(star('RTL_ALT').attributes('aria-pressed')).toBe('true')
  expect(star('RTL_ALT').attributes('aria-label')).toBe('Remove RTL_ALT from the favourites')
  expect(star('BATT_CAPACITY').attributes('aria-pressed')).toBe('false')
  expect(star('BATT_CAPACITY').attributes('aria-label')).toBe('Add BATT_CAPACITY to the favourites')
  expect(table.findAll('#rows td.star button[tabindex="-1"]')).toHaveLength(PARAMS.length)
  expect(table.get('thead th.star').text()).toBe('Favourite')
})

it('stars a parameter with a click on its star, keeps it in the settings, and does not select the row', async () => {
  const { table, handle } = await screen()

  await table.get('tr[data-id="FENCE_RADIUS"] td.star button').trigger('click')
  await flushPromises()

  expect(table.get('tr[data-id="FENCE_RADIUS"] td.star button').attributes('aria-pressed')).toBe('true')
  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["FENCE_RADIUS"]')
  expect(handle.fields.selected.value).toBeNull()
  await table.get('tr[data-id="FENCE_RADIUS"] td.star button').trigger('click')
  await flushPromises()
  expect(table.get('tr[data-id="FENCE_RADIUS"] td.star button').attributes('aria-pressed')).toBe('false')
})

it('stars the selected row with the key `*`, and does nothing without a selected row or with Ctrl', async () => {
  const { table, handle } = await screen()
  await table.get('#param-list').trigger('keydown', { key: '*' })
  await flushPromises()
  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('[]')

  handle.parameters.select('RTL_ALT')
  await table.get('#param-list').trigger('keydown', { key: '*', ctrlKey: true })
  await flushPromises()
  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('[]')

  await table.get('#param-list').trigger('keydown', { key: '*' })
  await flushPromises()
  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["RTL_ALT"]')
})

it('has a Favourites group after All, with the count of the starred parameters the vehicle has', async () => {
  const { groups } = await screen(['RTL_ALT', 'BATT_CAPACITY', 'NOT_ON_THIS_VEHICLE'])
  const buttons = groups.findAll('button').map(button => button.attributes('data-group'))
  const favourites = groups.get(`button[data-group="${FAVOURITES_GROUP}"]`)

  expect(buttons.slice(0, 3)).toEqual(['', FAVOURITES_GROUP, 'ARMING'])
  expect(favourites.text()).toBe('Favourites2')
  expect(favourites.attributes('title')).toBe('1 of your favourites are not on this vehicle.')
  expect(groups.get('button[data-group="BATT"]').attributes('title')).toBeUndefined()
})

it('lists only the favourites when the group is chosen, in the list\'s order, and the table follows the stars', async () => {
  const { table, groups } = await screen(['WPNAV_SPEED', 'RTL_ALT', 'NOT_ON_THIS_VEHICLE'])

  await groups.get(`button[data-group="${FAVOURITES_GROUP}"]`).trigger('click')
  await flushPromises()

  expect(table.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['RTL_ALT', 'WPNAV_SPEED'])
  expect(table.get('#list-status').text()).toBe('2 of 12 parameters')
  await table.get('tr[data-id="RTL_ALT"] td.star button').trigger('click')
  await flushPromises()
  expect(table.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['WPNAV_SPEED'])
})

it('says there are no favourites yet, and offers all the parameters, when the group is empty', async () => {
  const { table, groups } = await screen()

  await groups.get(`button[data-group="${FAVOURITES_GROUP}"]`).trigger('click')
  await flushPromises()

  expect(table.text()).toContain('No favourites yet')
  expect(table.text()).toContain('Press the star next to a parameter, or * with the parameter selected, to keep it here.')
  await table.get('#clear-search').trigger('click')
  await flushPromises()
  expect(table.findAll('#rows tr')).toHaveLength(PARAMS.length)
})

it('keeps the group, with a count of none, when the vehicle has none of the starred parameters', async () => {
  const { groups, handle } = await screen(['GONE_ONE'])
  expect(groups.get(`button[data-group="${FAVOURITES_GROUP}"]`).text()).toBe('Favourites0')

  feed(handle, { params: [] })
  await flushPromises()

  expect(groups.find(`button[data-group="${FAVOURITES_GROUP}"]`).exists()).toBe(true)
})
