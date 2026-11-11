// Parameters in the command palette, in the shell: found by the Parameters screen's own search, the starred ones first, and
// chosen with Enter (or a click) they are shown on the Parameters screen, selected, with the search and any group that hid
// them cleared.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { FAVOURITES_KEY } from '@/composables/favourites'
import { i18n, setLanguage } from '@/i18n/i18n'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { feed } from '@/testing/testing'
import Shell from './Shell.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useParamGroup } from '@/composables/useParamGroup'
import { resetViewOverride, useParamView } from '@/composables/useParamView'
import { VIEW_KEY } from '@/lib/params/paramView'

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
  resetViewOverride()
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

  expect(rows(wrapper)[0]?.get('.palette-label').text()).toMatch(/^BATT_CAPACITY/u)
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

it('marks a starred row with a star that a screen reader hears as "Favourite", and not the others', async () => {
  const { wrapper } = await shellWith(PARAMS, ['BATT_CAPACITY'])
  await ask(wrapper, 'BATT')

  const [first, second] = rows(wrapper)
  expect(first?.find('svg.palette-star').attributes('aria-hidden')).toBe('true')
  expect(first?.get('.palette-label').text()).toContain('(Favourite)')
  expect(second?.find('.palette-star').exists()).toBe(false)
})

it('says "results" for the count, whether the rows are commands or parameters', async () => {
  const { wrapper } = await shellWith()
  await ask(wrapper, 'FENCE')

  await vi.waitFor(() => expect(wrapper.get('.palette-status').text()).toMatch(/^\d+ results?$/u))
})

it('shows an advanced parameter in the Standard view for now, and does not change the view that the settings keep', async () => {
  const { wrapper, handle } = await shellWith()
  feed(handle, { metadata: new Map([['FENCE_RADIUS', { user: 'advanced' }], ['ARMING_CHECK', { user: 'standard' }]]) })
  await handle.settings.setUi(VIEW_KEY, 'standard')
  const view = useParamView()
  expect(view.view.value).toBe('standard')
  expect(view.listed.value.some(param => param.id === 'FENCE_RADIUS')).toBe(false)
  await ask(wrapper, 'FENCE_RADIUS')

  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
  await vi.waitFor(() => expect(handle.fields.selected.value).toBe('FENCE_RADIUS'))

  expect(view.view.value).toBe('full')
  expect(handle.settings.uiValue(VIEW_KEY)).toBe('standard')
  await view.choose('standard')
  expect(view.view.value).toBe('standard')
})

it('puts the focus in the parameter\'s value editor, also when the list had to clear its search and group', async () => {
  const { wrapper, handle } = await shellWith()
  await flushPromises()
  feed(handle, { connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  handle.parameters.setFilter('something typed before')
  useParamGroup().choose('RTL')
  await ask(wrapper, 'FENCE_RADIUS')

  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('draft'))
  expect(handle.fields.selected.value).toBe('FENCE_RADIUS')
  expect(handle.fields.filter.value).toBe('')
  // The field's own behaviour is unchanged: Escape goes back to the list.
  await wrapper.get('#draft').trigger('keydown', { key: 'Escape' })
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('param-list'))
})

it('puts the focus on the parameter\'s row when there is no editor (not connected)', async () => {
  const { wrapper, handle } = await shellWith()
  await ask(wrapper, 'FENCE_RADIUS')

  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('param-list'))
  expect(handle.fields.selected.value).toBe('FENCE_RADIUS')
})
