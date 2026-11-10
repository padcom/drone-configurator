// The star in the list and the Favourites group: a star is a button in the row that does not select it, the key `*` stars the
// selected row, the group lists the starred parameters that the vehicle has (with a count and an empty state), and the stars
// are kept in the settings.
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS, VEHICLE } from './fixtures'
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

it('has a star in every row: a toggle with one label that names the parameter, and its state in aria-pressed', async () => {
  const { table } = await screen(['RTL_ALT'])
  const star = (id: string) => table.get(`tr[data-id="${id}"] td.star button`)

  expect(star('RTL_ALT').attributes('aria-pressed')).toBe('true')
  expect(star('RTL_ALT').attributes('aria-label')).toBe('Favourite: RTL_ALT')
  expect(star('BATT_CAPACITY').attributes('aria-pressed')).toBe('false')
  expect(star('BATT_CAPACITY').attributes('aria-label')).toBe('Favourite: BATT_CAPACITY')
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

it('says politely what was done to a favourite, for the click and the key alike, in a region that is always there', async () => {
  const { table } = await screen()
  const said = () => table.get('#favourite-status')
  expect(said().attributes('role')).toBe('status')
  expect(said().text()).toBe('')

  await table.get('tr[data-id="RTL_ALT"] td.star button').trigger('click')
  await flushPromises()
  expect(said().text()).toBe('RTL_ALT added to the favourites')

  await table.get('tr[data-id="RTL_ALT"]').trigger('click')
  await table.get('#param-list').trigger('keydown', { key: '*' })
  await flushPromises()
  expect(said().text()).toBe('RTL_ALT removed from the favourites')
})

it('lets Enter on a star toggle it (the button\'s own), and keeps Enter on the list for the Value field', async () => {
  const { table, handle } = await screen()
  const field = document.body.appendChild(document.createElement('input'))
  field.id = 'draft'
  handle.parameters.select('RTL_ALT')

  const onStar = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  table.get('tr[data-id="BATT_CAPACITY"] td.star button').element.dispatchEvent(onStar)
  expect(onStar.defaultPrevented).toBe(false)
  expect(document.activeElement).not.toBe(field)

  await table.get('#param-list').trigger('keydown', { key: 'Enter' })
  expect(document.activeElement).toBe(field)
  field.remove()
})

/**
 * The Favourites group chosen, on a screen whose vehicle is connected with its whole list.
 *
 * @param starred the names the settings hold as favourites
 * @returns the components and the Configurator
 */
async function favouritesOfConnected(starred: string[]) {
  const shown = await screen(starred)
  feed(shown.handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await shown.table.vm.$nextTick()
  await shown.groups.get(`button[data-group="${FAVOURITES_GROUP}"]`).trigger('click')
  await flushPromises()

  return shown
}

it('takes the favourites out that are not on this vehicle, with a button that asks first, in the Favourites group', async () => {
  const { table, groups, handle } = await favouritesOfConnected(['RTL_ALT', 'GONE_ONE', 'GONE_TWO'])
  const button = table.get('#clear-missing-favourites')
  expect(button.text()).toBe('Remove the 2 not on this vehicle…')
  expect(button.attributes('title')).toContain('for every vehicle')

  // One press asks, and removes nothing.
  await button.trigger('click')
  await flushPromises()
  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["RTL_ALT","GONE_ONE","GONE_TWO"]')
  expect(button.text()).toBe('Remove 2 from your list for every vehicle? Press again')
  expect(table.get('#favourite-status').text()).toBe('Remove 2 from your list for every vehicle? Press again')

  await button.trigger('click')
  await flushPromises()

  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["RTL_ALT"]')
  expect(table.find('#clear-missing-favourites').exists()).toBe(false)
  expect(table.get('#favourite-status').text()).toBe('2 removed from the favourites')
  expect(groups.get(`button[data-group="${FAVOURITES_GROUP}"]`).attributes('title')).toBeUndefined()
})

it('goes back to asking when the second press does not come in time', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const { table } = await favouritesOfConnected(['GONE_ONE'])
  const button = table.get('#clear-missing-favourites')
  await button.trigger('click')
  expect(button.text()).toContain('Press again')

  vi.advanceTimersByTime(7000)
  await table.vm.$nextTick()

  expect(button.text()).toBe('Remove the 1 not on this vehicle…')
  vi.useRealTimers()
})

it('is not offered without the whole list of a connected vehicle (nothing is "missing" then; the list is global)', async () => {
  const none = await screen(['GONE_ONE'])
  await none.groups.get(`button[data-group="${FAVOURITES_GROUP}"]`).trigger('click')
  await flushPromises()
  // Not connected.
  expect(none.table.find('#clear-missing-favourites').exists()).toBe(false)

  feed(none.handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } }, list: 'incomplete' })
  await none.table.vm.$nextTick()
  expect(none.table.find('#clear-missing-favourites').exists()).toBe(false)

  feed(none.handle, { list: 'failed', params: [] })
  await none.table.vm.$nextTick()
  expect(none.table.find('#clear-missing-favourites').exists()).toBe(false)
  expect(none.handle.settings.uiValue(FAVOURITES_KEY)).toBe('["GONE_ONE"]')

  feed(none.handle, { list: 'complete', params: PARAMS })
  await none.table.vm.$nextTick()
  expect(none.table.find('#clear-missing-favourites').exists()).toBe(true)
})

it('says nothing of a star that the settings could not keep: the star goes back, and their notice speaks', async () => {
  const { table, handle } = await screen()
  vi.spyOn(handle.settings, 'setUi').mockResolvedValue()

  await table.get('tr[data-id="RTL_ALT"] td.star button').trigger('click')
  await flushPromises()

  expect(table.get('#favourite-status').text()).toBe('')
  expect(table.get('tr[data-id="RTL_ALT"] td.star button').attributes('aria-pressed')).toBe('false')
})

it('has a Favourites group after All, with the count of the starred parameters the vehicle has', async () => {
  const { groups } = await screen(['RTL_ALT', 'BATT_CAPACITY', 'NOT_ON_THIS_VEHICLE'])
  const buttons = groups.findAll('button').map(button => button.attributes('data-group'))
  const favourites = groups.get(`button[data-group="${FAVOURITES_GROUP}"]`)

  expect(buttons.slice(0, 3)).toEqual(['', FAVOURITES_GROUP, 'ARMING'])
  expect(favourites.text()).toBe('Favourites2')
  expect(favourites.attributes('title')).toBe('1 of your favourites are not on this vehicle.')
  expect(favourites.attributes('aria-description')).toBe('1 of your favourites are not on this vehicle.')
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
