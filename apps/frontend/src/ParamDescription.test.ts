import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { APM_PDEF } from './apmPdef'
import ParamDescription from './ParamDescription.vue'
import { PARAMS, VEHICLE } from './fixtures'
import { parseMetadata } from './metadata'
import type { Metadata } from './metadata'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

/**
 * Mounts the block on a fresh Configurator with RTL_ALT selected, and the metadata given.
 *
 * @param metadata what is loaded
 * @returns the block and what feeds the state
 */
async function blockWith(metadata: Metadata) {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamDescription, withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, selected: 'RTL_ALT', metadata, connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  return { wrapper, handle }
}

it('says where descriptions come from when no metadata is loaded, and shows nothing else', async () => {
  const { wrapper } = await blockWith(new Map())

  expect(wrapper.get('#param-description h2').text()).toBe('Description')
  expect(wrapper.get('#param-description .hint').text()).toBe('Load the parameter metadata to see descriptions.')
  expect(wrapper.find('#param-description .body').exists()).toBe(false)
})

it('says that the loaded metadata has nothing on the parameter, when it has not', async () => {
  const { wrapper } = await blockWith(new Map([['OTHER', { description: 'Another' }]]))

  expect(wrapper.get('#param-description .hint').text()).toBe('The loaded metadata has nothing on this parameter.')
})

it('shows the full text, then the range, units, step, values, bits and reboot flag as rows, in a box that scrolls', async () => {
  const loaded = parseMetadata(JSON.stringify(APM_PDEF)) as Metadata
  const meta = { ...loaded.get('ARMING_CHECK'), ...loaded.get('FRAME_CLASS'), ...loaded.get('RTL_ALT') }
  const { wrapper } = await blockWith(new Map([['RTL_ALT', meta]]))
  const rows = new Map(wrapper.findAll('#param-description .row').map(row => [row.get('dt').text(), row.get('dd').text()]))

  expect(wrapper.get('#param-description .text').text()).toContain('The minimum alt above home')
  expect(rows.get('Range')).toBe('30 to 300000 cm')
  expect(rows.get('Units')).toBe('cm')
  expect(rows.get('Step')).toBe('1 cm')
  expect(rows.get('Values')).toContain('1  Quad')
  expect(rows.get('Bits')).toContain('bit 3  GPS lock')
  expect(rows.get('Restart')).toBe('The vehicle must be restarted for a change to take effect.')
  expect(wrapper.get('#param-description .body').attributes('tabindex')).toBe('0')
})

it('escapes the text, and follows the selected parameter', async () => {
  const { wrapper, handle } = await blockWith(new Map([
    ['RTL_ALT', { longDescription: 'Altitude <b>bold</b>' }],
    ['BATT_CAPACITY', { longDescription: 'Battery' }],
  ]))

  expect(wrapper.get('#param-description .text').text()).toBe('Altitude <b>bold</b>')
  expect(wrapper.find('#param-description b').exists()).toBe(false)

  feed(handle, { selected: 'BATT_CAPACITY' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#param-description .text').text()).toBe('Battery')
})

it('is not there without a selected parameter', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamDescription, withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, selected: null })
  await wrapper.vm.$nextTick()

  expect(wrapper.find('#param-description').exists()).toBe(false)
})
