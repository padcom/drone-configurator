// A parameter that was selected while the table was not there (the palette chose it before the screen was first shown, or while
// the screen was kept alive and hidden) is scrolled into view when the screen is shown, and a row that was scrolled to already
// is left where it is.
import { type Component, KeepAlive, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAMS } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import ParamTable from './ParamTable.vue'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'

/** The height the scroll box has (0 while the screen is hidden), and the tops it was scrolled to. */
const box = { height: 200, tops: [] as number[] }

beforeEach(() => {
  box.height = 200
  box.tops = []
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => box.height)
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => box.tops.at(-1) ?? 0)
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(value => void box.tops.push(value))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * A Configurator that has the fixture parameters.
 *
 * @returns the Configurator
 */
function configurator() {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'complete' })

  return handle
}

/**
 * The table in a kept-alive host that shows and hides it.
 *
 * @returns the mounted host and the switch
 */
async function kept() {
  const shown = ref(true)
  const Host = defineComponent({ render: () => h(KeepAlive, null, shown.value ? [h(ParamTable as Component)] : []) })
  const wrapper = mount(Host, { ...withI18n, attachTo: document.body })
  await flushPromises()

  return { wrapper, shown }
}

it('scrolls to the selected row when the screen is first shown with a parameter already selected', async () => {
  const handle = configurator()
  handle.parameters.select('WPNAV_SPEED')

  mount(ParamTable, { ...withI18n, attachTo: document.body })
  await flushPromises()

  expect(handle.fields.selected.value).toBe('WPNAV_SPEED')
  expect(box.tops.at(-1)).toBeGreaterThan(0)
})

it('scrolls to a row that was selected while the screen was kept alive and hidden, when it comes back', async () => {
  const handle = configurator()
  const { shown } = await kept()
  shown.value = false
  await nextTick()
  box.height = 0
  box.tops = []

  handle.parameters.select('WPNAV_SPEED')
  await flushPromises()
  expect(box.tops).toEqual([])
  box.height = 200
  shown.value = true
  await flushPromises()

  expect(box.tops.at(-1)).toBeGreaterThan(0)
})

it('leaves the list where it is when the screen comes back and the selected row was in view already', async () => {
  const handle = configurator()
  const { shown } = await kept()
  handle.parameters.select('WPNAV_SPEED')
  await flushPromises()
  const before = [...box.tops]
  shown.value = false
  await nextTick()
  shown.value = true
  await flushPromises()

  expect(before.length).toBeGreaterThan(0)
  expect(box.tops).toEqual(before)
})
