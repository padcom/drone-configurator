import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import ParamCompare from './ParamCompare.vue'
import SnapshotToolbar from './SnapshotToolbar.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { PARAMS, VEHICLE, telemetryAt } from '@/mock/fixtures'

afterEach(() => {
  delete window.picoDesktop
})

/**
 * Mounts the comparison on a fresh Configurator with the mock vehicle's parameters, compared with `text`.
 *
 * @param text the file's text
 * @returns the component and the Configurator
 */
async function comparedWith(text: string) {
  const handle = createConfigurator(mockBackend())
  feed(handle, {
    params: PARAMS,
    connection: { state: 'connected', vehicle: { ...VEHICLE } },
    telemetry: { ...telemetryAt(0), armed: false },
    metadata: new Map([['FENCE_ENABLE', { values: { 0: 'Disabled', 1: 'Enabled' } }], ['RTL_ALT', { units: 'cm' }]]),
  })
  handle.compare.loadText(text)
  const wrapper = mount(ParamCompare, withI18n)
  await flushPromises()

  return { wrapper, handle }
}

/**
 * The text of each cell of a row.
 *
 * @param wrapper the component
 * @param id the row's parameter
 * @returns the cells' text
 */
const cells = (wrapper: VueWrapper, id: string) => wrapper.get(`[data-id="${id}"]`)
  .findAll('[data-column]')
  .map(cell => cell.text())

it('shows only the differences at first, with the values\' names and units, and how many of each kind', async () => {
  const { wrapper } = await comparedWith('RTL_ALT,2000\nFENCE_ENABLE,1\nARMING_CHECK,1\nNOT_A_PARAM,1\n')

  expect(wrapper.get('h3').text()).toBe('Compared with: Parameter file: ArduPilot .param (NAME,VALUE)')
  expect(wrapper.get('#compare-summary').text())
    .toBe(`Different: 2; only on the vehicle: ${PARAMS.length - 3}; not on the vehicle: 1; the same: 1.`)
  expect(cells(wrapper, 'RTL_ALT')).toEqual(['', 'RTL_ALT', '1500 cm', '2000 cm', 'Different'])
  expect(cells(wrapper, 'FENCE_ENABLE')).toEqual(['', 'FENCE_ENABLE', 'Disabled (0)', 'Enabled (1)', 'Different'])
  expect(cells(wrapper, 'NOT_A_PARAM')).toEqual(['', 'NOT_A_PARAM', '—', '1', 'not on this vehicle'])
  expect(wrapper.find('[data-id="ARMING_CHECK"]').exists()).toBe(false)
  expect(wrapper.get('[data-id="NOT_A_PARAM"] input').attributes('disabled')).toBeDefined()
})

it('shows every row, a group and what a search finds', async () => {
  const { wrapper } = await comparedWith('RTL_ALT,2000\nFENCE_ENABLE,1\nARMING_CHECK,1\n')

  await wrapper.get('#compare-only-differences').trigger('click')
  expect(wrapper.find('[data-id="ARMING_CHECK"]').exists()).toBe(true)
  await wrapper.get('#compare-group').setValue('FENCE')
  expect(wrapper.findAll('[data-id]').map(row => row.attributes('data-id'))).toEqual(['FENCE_ENABLE', 'FENCE_RADIUS'])
  await wrapper.get('#compare-group').setValue('')
  await wrapper.get('#compare-search').setValue('rtl')
  expect(wrapper.findAll('[data-id]').map(row => row.attributes('data-id'))).toEqual(['RTL_ALT'])
})

it('copies a row across with its box, named by the parameter, and hands the ticked rows to the review', async () => {
  const { wrapper, handle } = await comparedWith('RTL_ALT,2000\nFENCE_ENABLE,1\n')
  const box = wrapper.get('input[data-copy="RTL_ALT"]')

  expect(box.attributes('aria-label')).toBe('Copy RTL_ALT across')
  expect(wrapper.get('#compare-review').attributes('disabled')).toBeDefined()
  await box.trigger('change')
  expect(wrapper.get('.review-status').text()).toBe('To copy across: 1. Nothing is written until you review and confirm.')
  await wrapper.get('#compare-review').trigger('click')

  expect(handle.fields.importReview.value?.changes.map(change => change.id)).toEqual(['RTL_ALT'])
  expect(handle.fields.picked.value).toEqual(['RTL_ALT'])
  expect(handle.compare.open.value).toBe(false)
})

it('says why the comparison could not be made, and closes', async () => {
  const { wrapper, handle } = await comparedWith('nothing here')

  expect(wrapper.get('[role="alert"]').text()).toContain('no parameter lines in it')
  await wrapper.get('#close-compare').trigger('click')
  expect(handle.compare.open.value).toBe(false)
})

it('offers the comparison on the toolbar once there are parameters, the defaults only from a connected vehicle', async () => {
  const handle = createConfigurator(mockBackend())
  const loadDefaults = vi.spyOn(handle.compare, 'loadDefaults').mockResolvedValue()
  const openFile = vi.spyOn(handle.compare, 'openFile').mockResolvedValue()
  const wrapper = mount(SnapshotToolbar, withI18n)
  await flushPromises()
  expect(wrapper.get('#compare-file').attributes('aria-disabled')).toBe('true')
  expect(wrapper.get('#compare-defaults').attributes('aria-disabled')).toBe('true')

  feed(handle, { params: PARAMS, connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await flushPromises()
  expect(wrapper.get('#compare-file .command-button-label').text()).toBe('Compare with file')
  window.picoDesktop = {} as never
  await wrapper.get('#compare-file').trigger('click')
  await wrapper.get('#compare-defaults').trigger('click')

  expect(openFile).toHaveBeenCalledOnce()
  expect(loadDefaults).toHaveBeenCalledOnce()
})
