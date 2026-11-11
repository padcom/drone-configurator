// The search in the parameter list: by name and by what a parameter does, the marks, the close matches, and what it does not do
// (it is not run again for a telemetry tick, and the table is not touched by one).
import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { PARAMS, telemetryAt } from '@/mock/fixtures'
import type { ParamMeta } from '@/lib/params/metadata'
import { mockBackend } from '@/mock/mock-backend'
import ParamTable from './ParamTable.vue'
import * as paramSearch from '@/lib/params/paramSearch'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { useParamGroup } from '@/composables/useParamGroup'

vi.mock('@/lib/params/paramSearch', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/params/paramSearch')>()

  return { ...actual, search: vi.fn(actual.search), indexFor: vi.fn(actual.indexFor) }
})

afterEach(() => {
  useParamGroup().choose('')
  vi.mocked(paramSearch.search).mockClear()
  vi.mocked(paramSearch.indexFor).mockClear()
})

const METADATA = new Map<string, ParamMeta>([
  ['RTL_ALT', { description: 'RTL Altitude', longDescription: 'The minimum alt before returning: the return height.' }],
  ['BATT_CAPACITY', { description: 'Battery capacity', longDescription: 'Capacity of the battery in mAh when full' }],
  ['WPNAV_SPEED', { description: 'Waypoint speed', longDescription: 'The horizontal speed in cm/s used during missions' }],
])

type Screen = ReturnType<typeof table>

/**
 * The table on a fresh Configurator with the fixture parameters and some metadata.
 *
 * @returns the component and the Configurator
 */
function table() {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'complete', metadata: METADATA })

  return { wrapper: mount(ParamTable, withI18n), handle }
}

/**
 * Searches, and waits for the rows.
 *
 * @param handle the Configurator
 * @param wrapper the table
 * @param filter what is typed
 */
async function searchFor(handle: Screen['handle'], wrapper: Screen['wrapper'], filter: string) {
  feed(handle, { filter })
  await wrapper.vm.$nextTick()
}

it('finds a parameter by what it does, and shows the piece of the description that has the words, marked', async () => {
  const { wrapper, handle } = table()

  await searchFor(handle, wrapper, 'return height')

  expect(wrapper.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['RTL_ALT'])
  const meaning = wrapper.get('tr[data-id="RTL_ALT"] .meaning')
  expect(meaning.text()).toContain('return height')
  // Every place of a word is marked, also inside another word ("returning").
  expect(meaning.findAll('mark').map(mark => mark.text())).toEqual(['return', 'return', 'height'])
  expect(wrapper.get('#list-status').text()).toBe('1 of 12 parameters')
  // The tooltip is the whole description, not the piece that is shown.
  expect(meaning.attributes('title')).toBe('The minimum alt before returning: the return height.')
})

it('marks the words in the name, and shows the text as text', async () => {
  const { wrapper, handle } = table()

  await searchFor(handle, wrapper, 'batt cap')

  const name = wrapper.get('tr[data-id="BATT_CAPACITY"] th.name')
  expect(name.findAll('mark').map(mark => mark.text())).toEqual(['BATT', 'CAP'])
  expect(name.text()).toBe('BATT_CAPACITY')
})

it('spans every parameter whatever the group, and says a typo is a close match', async () => {
  const { wrapper, handle } = table()
  useParamGroup().choose('RTL')
  await wrapper.vm.$nextTick()

  await searchFor(handle, wrapper, 'batery')

  expect(wrapper.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['BATT_CAPACITY'])
  expect(wrapper.get('tr[data-id="BATT_CAPACITY"] .why').text()).toBe('Close match')
})

it('searches the names only without descriptions', async () => {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'complete' })
  const wrapper = mount(ParamTable, withI18n)

  await searchFor(handle, wrapper, 'return height')
  expect(wrapper.find('#rows').exists()).toBe(false)
  await searchFor(handle, wrapper, 'low')

  expect(wrapper.findAll('#rows tr').map(row => row.attributes('data-id'))).toEqual(['BATT_LOW_VOLT'])
})

it('does not search again, or touch the table, for a hundred telemetry ticks', async () => {
  const { wrapper, handle } = table()
  await searchFor(handle, wrapper, 'speed')
  const before = [vi.mocked(paramSearch.search).mock.calls.length, vi.mocked(paramSearch.indexFor).mock.calls.length]
  const mutations = new MutationObserver(() => undefined)
  const everything = { subtree: true, childList: true, attributes: true, characterData: true }
  mutations.observe(wrapper.element.parentElement ?? wrapper.element, everything)

  for (let tick = 0; tick < 100; tick += 1) {
    feed(handle, { telemetry: telemetryAt(tick) })
  }
  await wrapper.vm.$nextTick()

  expect(mutations.takeRecords()).toEqual([])
  expect([vi.mocked(paramSearch.search).mock.calls.length, vi.mocked(paramSearch.indexFor).mock.calls.length]).toEqual(before)
})

it('makes the index again for other metadata, and not for a new value of a parameter', async () => {
  const { wrapper, handle } = table()
  await searchFor(handle, wrapper, 'speed')
  const indexes = () => vi.mocked(paramSearch.indexFor).mock.results.map(result => result.value as unknown)
  const first = indexes().at(-1)

  feed(handle, { params: PARAMS.map(param => param.id === 'RTL_ALT' ? { ...param, value: 1 } : param) })
  await wrapper.vm.$nextTick()
  expect(indexes().at(-1)).toBe(first)

  feed(handle, { metadata: new Map(METADATA) })
  await wrapper.vm.$nextTick()
  expect(indexes().at(-1)).not.toBe(first)
})
