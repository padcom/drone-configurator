import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MetadataStatus from './MetadataStatus.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

/**
 * Mounts the line on a fresh Configurator.
 *
 * @returns the component and the Configurator
 */
async function lineOnNewConfigurator() {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(MetadataStatus, withI18n)
  await flushPromises()

  return { wrapper, handle }
}

it('is empty without metadata, and says how many parameters it describes', async () => {
  const { wrapper, handle } = await lineOnNewConfigurator()
  expect(wrapper.get('#metadata-status').text()).toBe('')

  feed(handle, { metadata: new Map([['A', {}], ['B', {}]]) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#metadata-status').text()).toBe('Metadata for 2 parameters')
})

it('says for how many of the vehicle\'s parameters there are descriptions, and warns when for none', async () => {
  const { wrapper, handle } = await lineOnNewConfigurator()
  const params = ['RTL_ALT', 'X'].map((id, index) => ({ id, index, kind: 'int' as const, type: 'INT32', value: 1 }))
  feed(handle, { params, metadata: new Map([['RTL_ALT', { description: 'Return altitude' }], ['Y', { description: 'y' }]]) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#metadata-status').text()).toBe('Loaded descriptions for 1 of 2 parameters')
  expect(wrapper.find('#metadata-status .error').exists()).toBe(false)

  feed(handle, { metadata: new Map([['Y', { description: 'y' }]]) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#metadata-status .error').text()).toMatch(/^Loaded descriptions for 0 of 2 parameters: none of the 1/u)
})

it('shows why a file could not be loaded, as text', async () => {
  const { wrapper, handle } = await lineOnNewConfigurator()

  feed(handle, { metadataError: '<b>Can\'t load</b> the metadata' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#metadata-status .error').text()).toBe('<b>Can\'t load</b> the metadata')
  expect(wrapper.find('#metadata-status b').exists()).toBe(false)
})
