// The Parameters screen with the setting "Show parameter groups" off: no group list, no stars, no `*` key, the scope All, the
// search over everything, and the favourites in the settings untouched. And the Settings screen, which is the one place to
// change it.
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS } from './fixtures'
import { FAVOURITES_KEY } from './favourites'
import { mockBackend } from './mock-backend'
import Parameters from './screens/Parameters.vue'
import Settings from './screens/Settings.vue'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { GROUPS_KEY } from './useGroupsSetting'
import { useParamGroup } from './useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

/**
 * The Parameters screen on a Configurator that has the fixture parameters, two favourites, and the setting as given.
 *
 * @param groups what the settings hold for the setting
 * @returns the screen and the Configurator
 */
async function screen(groups?: string) {
  const stars = { key: FAVOURITES_KEY, value: '["RTL_ALT","BATT_CAPACITY"]' }
  const ui = groups ? [stars, { key: GROUPS_KEY, value: groups }] : [stars]
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await handle.settings.load()
  feed(handle, { params: PARAMS, list: 'complete' })
  const page = mount(Parameters, { ...withI18n, attachTo: document.body })
  await flushPromises()

  return { page, handle }
}

it('has no group list and no stars for a user who never touched the setting (it is off by default)', async () => {
  const { page } = await screen()

  expect(page.find('.param-groups').exists()).toBe(false)
  expect(page.find('td.star, th.star, col.col-star').exists()).toBe(false)
})

it('has the group list and the star column when the settings hold an explicit on', async () => {
  const { page } = await screen('on')

  expect(page.find('.param-groups').exists()).toBe(true)
  expect(page.findAll('#rows td.star')).toHaveLength(PARAMS.length)
  expect(page.find('thead th.star').exists()).toBe(true)
  expect(page.find('col.col-star').exists()).toBe(true)
})

it('has no group list, no star column and no star on a row when it is off', async () => {
  const { page } = await screen('off')

  expect(page.find('.param-groups').exists()).toBe(false)
  expect(page.find('td.star, th.star, col.col-star, .star button').exists()).toBe(false)
  expect(page.findAll('#rows tr')).toHaveLength(PARAMS.length)
  expect(page.find('#rows th.name').exists()).toBe(true)
})

it('does nothing on `*` when it is off, and keeps the favourites in the settings as they were', async () => {
  const { page, handle } = await screen('off')
  handle.parameters.select('FENCE_RADIUS')
  await flushPromises()

  await page.get('#param-list').trigger('keydown', { key: '*' })
  await flushPromises()

  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["RTL_ALT","BATT_CAPACITY"]')
  expect(page.find('#favourite-status').text()).toBe('')
})

it('lists every parameter whatever group was chosen before, and the search spans everything', async () => {
  const { page, handle } = await screen('off')
  useParamGroup().choose('BATT')
  await flushPromises()

  expect(page.findAll('#rows tr')).toHaveLength(PARAMS.length)
  handle.parameters.setFilter('RTL')
  await flushPromises()
  expect(page.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['RTL_ALT'])
})

it('brings the groups and the stars back, with the favourites that were kept, when it is turned on again', async () => {
  const { page, handle } = await screen('off')

  await handle.settings.setUi(GROUPS_KEY, 'on')
  await flushPromises()

  expect(page.find('.param-groups').exists()).toBe(true)
  expect(page.get('tr[data-id="RTL_ALT"] td.star button').attributes('aria-pressed')).toBe('true')
  expect(page.get('tr[data-id="FENCE_RADIUS"] td.star button').attributes('aria-pressed')).toBe('false')
})

it('is a switch in the Settings screen, labelled, with its help, off by default', async () => {
  await screen()
  const settings = mount(Settings, withI18n)
  const toggle = settings.get('#show-groups')

  expect(toggle.attributes('role')).toBe('switch')
  expect(toggle.attributes('aria-checked')).toBe('false')
  expect(toggle.text()).toBe('Show parameter groups')
  const help = settings.get(`#${toggle.attributes('aria-describedby')}`)
  expect(help.text()).toBe('Shows the group list and the favourites stars. Your favourites are kept while it is off.')
})

it('turns the groups on from the Settings screen, and keeps it', async () => {
  const { page, handle } = await screen()
  const settings = mount(Settings, withI18n)

  await settings.get('#show-groups').trigger('click')
  await flushPromises()

  expect(settings.get('#show-groups').attributes('aria-checked')).toBe('true')
  expect(handle.settings.uiValue(GROUPS_KEY)).toBe('on')
  expect(page.find('.param-groups').exists()).toBe(true)
})

it('turns the groups off from the Settings screen, keeps it, and resets the scope to All', async () => {
  const { page, handle } = await screen('on')
  const settings = mount(Settings, withI18n)
  useParamGroup().choose('BATT')

  await settings.get('#show-groups').trigger('click')
  await flushPromises()

  expect(settings.get('#show-groups').attributes('aria-checked')).toBe('false')
  expect(handle.settings.uiValue(GROUPS_KEY)).toBe('off')
  expect(useParamGroup().chosen.value).toBe('')
  expect(page.find('.param-groups').exists()).toBe(false)
  expect(handle.settings.uiValue(FAVOURITES_KEY)).toBe('["RTL_ALT","BATT_CAPACITY"]')
})

it('puts the switch back when the settings could not keep the choice', async () => {
  const { handle } = await screen()
  const settings = mount(Settings, withI18n)
  vi.spyOn(handle.settings, 'setUi').mockResolvedValue()

  await settings.get('#show-groups').trigger('click')
  await flushPromises()

  expect(settings.get('#show-groups').attributes('aria-checked')).toBe('false')
})
