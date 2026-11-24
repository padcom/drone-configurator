// The filters and groups of #36 in the parameter list: "Modified from default" (the one filter that narrows a search), a
// search over every parameter whatever the group and the view, the Recently used group, the grouping by the metadata, and the
// keys of the search box (Escape clears it, Enter opens the result).
import { afterEach, beforeAll, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS } from '@/mock/fixtures'
import type { ParamMeta } from '@/lib/params/metadata'
import { mockBackend } from '@/mock/mock-backend'
import ModifiedFilter from './ModifiedFilter.vue'
import ParamFilter from './ParamFilter.vue'
import ParamGroups from './ParamGroups.vue'
import ParamTable from './ParamTable.vue'
import { RECENT_GROUP } from '@/lib/params/paramGroups'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { GROUPS_KEY } from '@/composables/useGroupsSetting'
import { GROUP_BY_KEY } from '@/composables/useParamGrouping'
import { RECENT_KEY } from '@/composables/recentParams'
import { VIEW_KEY } from '@/lib/params/paramView'
import { useModifiedFilter } from '@/composables/useModifiedFilter'
import { useParamGroup } from '@/composables/useParamGroup'
import { loadEverydayWords } from '@/composables/useParamSearchIndex'

beforeAll(loadEverydayWords)

afterEach(() => {
  useParamGroup().choose('')
  useModifiedFilter().set(false)
  document.body.innerHTML = ''
})

const METADATA = new Map<string, ParamMeta>([
  ['RTL_ALT', { description: 'RTL Altitude', user: 'standard', group: 'ArduCopter' }],
  ['FS_THR_ENABLE', { description: 'Throttle failsafe', user: 'advanced', group: 'ArduCopter' }],
  ['BATT_CAPACITY', { description: 'Battery capacity', user: 'standard', group: 'BATT_' }],
  ['BATT_LOW_VOLT', { description: 'Low voltage', user: 'standard', group: 'BATT_' }],
])

/**
 * The list, its groups and the search box, on a Configurator with the fixture parameters, the metadata and the settings given.
 *
 * @param ui the interface's settings
 * @returns the components and the Configurator
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const settings = { version: 1, ui: [{ key: GROUPS_KEY, value: 'on' }, ...ui] }
  const handle = createConfigurator(mockBackend({ settings }))
  await handle.settings.load()
  feed(handle, { params: PARAMS, list: 'complete', metadata: METADATA })
  // The firmware's defaults, as a download by file transfer gives them: BATT_CAPACITY and FS_THR_ENABLE are away from theirs.
  handle.parameters.defaults.value = new Map(PARAMS.map(param => [param.id, param.value]))
    .set('BATT_CAPACITY', 3300).set('FS_THR_ENABLE', 0)
  const table = mount(ParamTable, { ...withI18n, attachTo: document.body })
  const groups = mount(ParamGroups, withI18n)
  const filter = mount(ParamFilter, { ...withI18n, attachTo: document.body })
  const modified = mount(ModifiedFilter, withI18n)
  await flushPromises()

  return { table, groups, filter, modified, handle }
}

type Screen = Awaited<ReturnType<typeof screen>>

const rows = (s: Screen) => s.table.findAll('#rows tr[data-id]').map(row => row.attributes('data-id'))

/**
 * Types in the search box.
 *
 * @param s the screen
 * @param text what is typed
 */
async function type(s: Screen, text: string) {
  await s.filter.get('#filter').setValue(text)
  await flushPromises()
}

it('lists only the parameters modified from default when asked, in a group and in a search', async () => {
  const s = await screen()
  await s.modified.get('#modified-only').setValue(true)
  await flushPromises()

  expect(rows(s)).toEqual(['BATT_CAPACITY', 'FS_THR_ENABLE'])
  await type(s, 'batt')
  expect(rows(s)).toEqual(['BATT_CAPACITY'])
  // A value written back to its default is not modified any more.
  feed(s.handle, { params: PARAMS.map(param => param.id === 'BATT_CAPACITY' ? { ...param, value: 3300 } : param) })
  await flushPromises()
  expect(rows(s)).toEqual([])
})

it('says when "Modified from default" hides every match, and turns it off from there', async () => {
  const s = await screen()
  await s.modified.get('#modified-only').setValue(true)
  await type(s, 'rtl alt')

  expect(s.table.get('.kit-empty, [class*="empty"]').text()).toContain('No modified parameter matches "rtl alt"')
  expect(s.table.text()).toContain('Modified from default is on, so the rest of the list is hidden.')
  await s.table.get('#show-unmodified').trigger('click')
  await flushPromises()

  expect(rows(s)).toEqual(['RTL_ALT'])
  expect(s.modified.get<HTMLInputElement>('#modified-only').element.checked).toBe(false)
})

it('offers "Modified from default" only when the defaults are known, and says why not', async () => {
  const s = await screen()
  s.handle.parameters.defaults.value = null
  await flushPromises()
  const box = s.modified.get<HTMLInputElement>('#modified-only')

  expect(box.element.disabled).toBe(true)
  expect(box.attributes('aria-description')).toContain('defaults are not known')
})

it('searches every parameter, whatever the group and the Standard view, which hide them when nothing is typed', async () => {
  const s = await screen([{ key: VIEW_KEY, value: 'standard' }])
  useParamGroup().choose('BATT')
  await flushPromises()
  expect(rows(s)).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])

  // FS_THR_ENABLE is advanced (hidden by Standard) and in another group.
  await type(s, 'radio lost')

  expect(rows(s)).toEqual(['FS_THR_ENABLE'])
  expect(s.table.get('tr[data-id="FS_THR_ENABLE"] .also').text()).toContain('Also: radio lost')
})

it('keeps the recently used, newest first, in a group of their own that survives in the settings', async () => {
  const s = await screen([{ key: RECENT_KEY, value: '["NOT_ON_THIS_ONE","RTL_ALT"]' }])
  expect(s.groups.get(`button[data-group="${RECENT_GROUP}"]`).text()).toBe('Recently used1')

  await s.table.get('tr[data-id="BATT_CAPACITY"]').trigger('click')
  await type(s, 'fence radius')
  await s.filter.get('#filter').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  await s.groups.get(`button[data-group="${RECENT_GROUP}"]`).trigger('click')
  await flushPromises()

  expect(rows(s)).toEqual(['FENCE_RADIUS', 'BATT_CAPACITY', 'RTL_ALT'])
  expect(JSON.parse(s.handle.settings.uiValue(RECENT_KEY) ?? '[]')).toEqual(['FENCE_RADIUS',
    'BATT_CAPACITY',
    'NOT_ON_THIS_ONE',
    'RTL_ALT'])
})

it('says so when nothing was used yet', async () => {
  const s = await screen()
  useParamGroup().choose(RECENT_GROUP)
  await flushPromises()

  expect(s.table.text()).toContain('Nothing used yet')
})

it('clears the search with Escape in the search box, and leaves the key alone when nothing is typed', async () => {
  const s = await screen()
  await type(s, 'batt')
  expect(rows(s)).toHaveLength(2)

  await s.filter.get('#filter').trigger('keydown', { key: 'Escape' })
  await flushPromises()

  expect(s.handle.fields.filter.value).toBe('')
  expect(rows(s)).toHaveLength(PARAMS.length)
})

it('groups by the metadata when asked, and keeps the choice in the settings', async () => {
  const s = await screen()
  const ids = () => s.groups.findAll('button.param-group').map(button => button.attributes('data-group'))
  expect(ids()).toContain('FS')

  await s.groups.get('#param-group-by input[value="metadata"]').setValue(true)
  await flushPromises()

  expect(ids().slice(3)).toEqual(['ArduCopter', 'BATT', 'OTHER'])
  expect(s.handle.settings.uiValue(GROUP_BY_KEY)).toBe('metadata')
  await s.groups.get('button[data-group="ArduCopter"]').trigger('click')
  await flushPromises()
  expect(rows(s)).toEqual(['FS_THR_ENABLE', 'RTL_ALT'])
})
