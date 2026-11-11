// Parameters in the command palette, in the shell: found by the Parameters screen's own search, the starred ones first, and
// chosen with Enter (or a click) they are shown on the Parameters screen, selected, with the search and any group that hid
// them cleared.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { FAVOURITES_KEY } from '@/composables/favourites'
import { i18n, setLanguage } from '@/i18n/i18n'
import { PARAMS } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import Shell from './Shell.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useParamGroup } from '@/composables/useParamGroup'

let mounted: VueWrapper | undefined

/**
 * The shell at the flight screen on a Configurator that has the given parameters.
 *
 * @param params the vehicle's parameters (none: not downloaded yet)
 * @param starred the names the settings hold as favourites
 * @returns the shell, its router and the Configurator
 */
async function shellWith(params: typeof PARAMS = PARAMS, starred: string[] = []) {
  const settings = { version: 1, ui: [{ key: FAVOURITES_KEY, value: JSON.stringify(starred) }] }
  const handle = createConfigurator(mockBackend({ settings }))
  await handle.settings.load()
  feed(handle, { params, list: params.length > 0 ? 'complete' : 'none' })

  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return { wrapper: mounted, router, handle }
}

/**
 * Opens the palette and types.
 *
 * @param wrapper the shell
 * @param text what to type
 */
async function ask(wrapper: VueWrapper, text: string): Promise<void> {
  useCommandPalette().show()
  await flushPromises()
  await wrapper.get('#palette-input').setValue(text)
  await flushPromises()
}

const rows = (wrapper: VueWrapper) => wrapper.findAll('.palette-row[data-command^="param."]')

afterEach(() => {
  setLanguage('en')
  useCommandPalette().hide()
  useParamGroup().choose('')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

it('lists the parameters that match, in the Parameter group, with the name as it is', async () => {
  const { wrapper } = await shellWith()
  await ask(wrapper, 'BATT')

  const found = rows(wrapper)
  expect(found.length).toBeGreaterThan(0)
  expect(found.every(row => row.get('.palette-label').text().startsWith('BATT'))).toBe(true)
  expect(found[0]?.get('.palette-group').text()).toBe('Parameter')
})

it('offers no parameter for one letter, and none (no stubs) before the parameters are downloaded', async () => {
  const { wrapper } = await shellWith()
  await ask(wrapper, 'b')
  expect(rows(wrapper)).toHaveLength(0)
  mounted?.unmount()
  document.body.innerHTML = ''

  const { wrapper: empty } = await shellWith([])
  await ask(empty, 'BATT')

  expect(rows(empty)).toHaveLength(0)
})

it('puts a starred parameter before the others that match the same way', async () => {
  const { wrapper } = await shellWith(PARAMS, ['BATT_CAPACITY'])
  await ask(wrapper, 'BATT')

  expect(rows(wrapper)[0]?.get('.palette-label').text()).toBe('BATT_CAPACITY')
})

it('shows the chosen parameter on the Parameters screen, selected, with the search cleared and All chosen', async () => {
  const { wrapper, router, handle } = await shellWith()
  handle.parameters.setFilter('something typed before')
  useParamGroup().choose('RTL')
  await ask(wrapper, 'FENCE_RADIUS')

  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
  await flushPromises()

  await vi.waitFor(() => expect(handle.fields.selected.value).toBe('FENCE_RADIUS'))
  expect(router.currentRoute.value.path).toBe('/parameters')
  expect(handle.fields.filter.value).toBe('')
  expect(useParamGroup().chosen.value).toBe('')
  expect(wrapper.find('#palette-input').exists()).toBe(false)
})

it('keeps the chosen group when the parameter is in it', async () => {
  const { wrapper, handle } = await shellWith()
  useParamGroup().choose('RTL')
  await ask(wrapper, 'RTL_ALT')

  await wrapper.get('.palette-row[data-command="param.RTL_ALT"]').trigger('click')
  await vi.waitFor(() => expect(handle.fields.selected.value).toBe('RTL_ALT'))

  expect(useParamGroup().chosen.value).toBe('RTL')
})
