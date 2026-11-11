// The edges of the View switch: a choice the settings could not keep, a group that Standard empties, the bulk reset that acts on
// parameters the view hides, and the selected row coming back into view.
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { initialOf } from '@/lib/params/initialValues'
import type { Metadata, ParamMeta } from '@/lib/params/metadata'
import { mockBackend } from '@/mock/mock-backend'
import ParamGroups from './ParamGroups.vue'
import ParamTable from './ParamTable.vue'
import ParamView from './ParamView.vue'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { GROUPS_KEY } from '@/composables/useGroupsSetting'
import { useParamGroup } from '@/composables/useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

const advanced: ParamMeta = { user: 'advanced' }
const METADATA: Metadata = new Map<string, ParamMeta>([
  ['RTL_ALT', { user: 'standard' }],
  ['FENCE_ENABLE', advanced],
  ['FENCE_RADIUS', advanced],
  ['BATT_CAPACITY', advanced],
])

/**
 * The screen's parts on a connected Configurator that has the fixture parameters and the metadata above.
 *
 * @returns the components and the Configurator
 */
async function screen() {
  const shownGroups = { key: GROUPS_KEY, value: 'on' }
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui: [shownGroups] } }), () => Promise.resolve(true))
  await handle.settings.load()
  const table = mount(ParamTable, { ...withI18n, attachTo: document.body })
  const groups = mount(ParamGroups, withI18n)
  const view = mount(ParamView, withI18n)
  await flushPromises()
  const connection = { state: 'connected' as const, vehicle: { ...VEHICLE } }
  feed(handle, { params: PARAMS, list: 'complete', metadata: METADATA, connection })
  await table.vm.$nextTick()
  feed(handle, { initial: initialOf(PARAMS, Date.now()) })
  await flushPromises()

  return { table, groups, view, handle }
}

type Screen = Awaited<ReturnType<typeof screen>>
const ids = (table: Screen['table']) => table.findAll('#rows tr').map(row => row.attributes('data-id'))
const radios = (view: Screen['view']) => view.findAll<HTMLInputElement>('input')
const checked = (view: Screen['view']) => radios(view).find(radio => radio.element.checked)?.element.value

it('goes back to Full, in the control and in the list, when the settings could not keep Standard', async () => {
  const { table, view, handle } = await screen()
  vi.spyOn(handle.settings, 'setUi').mockResolvedValue()

  await view.get('input[value="standard"]').setValue(true)
  await flushPromises()

  expect(checked(view)).toBe('full')
  expect(ids(table)).toHaveLength(PARAMS.length)
})

it('shows the choice at once, before the settings have answered, in the control and in the list', async () => {
  const { table, view, handle } = await screen()
  let answer: () => void = () => undefined
  vi.spyOn(handle.settings, 'setUi').mockReturnValue(new Promise<void>(resolve => {
    answer = resolve
  }))

  await view.get('input[value="standard"]').setValue(true)

  expect(checked(view)).toBe('standard')
  expect(ids(table)).not.toContain('BATT_CAPACITY')
  answer()
})

it('says that Standard hides a group whose parameters are all advanced, and offers Full', async () => {
  const { table, groups, view } = await screen()
  await view.get('input[value="standard"]').setValue(true)
  await flushPromises()

  await groups.get('button[data-group="FENCE"]').trigger('click')
  await flushPromises()

  expect(table.text()).toContain('Standard view hides these parameters')
  await table.get('#show-full').trigger('click')
  await flushPromises()
  expect(ids(table)).toEqual(['FENCE_ENABLE', 'FENCE_RADIUS'])
  expect(checked(view)).toBe('full')
})

it('does not say that for a search with no result, or for a group Standard does not empty', async () => {
  const { table, groups, view, handle } = await screen()
  await view.get('input[value="standard"]').setValue(true)
  await flushPromises()

  handle.parameters.setFilter('NO_SUCH_PARAMETER')
  await flushPromises()
  expect(table.text()).not.toContain('Standard view hides')
  expect(table.text()).toContain('No parameter matches')
  handle.parameters.setFilter('')
  await groups.get('button[data-group="RTL"]').trigger('click')
  await flushPromises()
  expect(ids(table)).toEqual(['RTL_ALT'])
})

it('says in the help of the bulk reset how many of the changed parameters the Standard view hides', async () => {
  const { table, view, handle } = await screen()
  feed(handle, { params: PARAMS.map(param => param.id === 'BATT_CAPACITY' ? { ...param, value: 6000 } : param) })
  await flushPromises()
  const plain = table.get('#reset-all').attributes('title')
  expect(plain).not.toContain('hidden by the Standard view')

  await view.get('input[value="standard"]').setValue(true)
  await flushPromises()

  expect(table.get('#reset-all').text()).toBe('Reset 1 changed parameter to its initial value')
  expect(table.get('#reset-all').attributes('title')).toContain('This includes 1 parameter hidden by the Standard view.')
})

it('selects the first row of the new list, at the top, after a change of view', async () => {
  const { table, view, handle } = await screen()
  const box = table.get('.param-scroll').element
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 200 })
  handle.parameters.select('WPNAV_SPEED')
  await flushPromises()
  box.scrollTop = 300

  await view.get('input[value="standard"]').setValue(true)
  await flushPromises()

  expect(box.scrollTop).toBe(0)
  expect(handle.fields.selected.value).toBe('ARMING_CHECK')
})
