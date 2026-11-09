import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MetadataStatus from './MetadataStatus.vue'
import { mockBackend } from './mock-backend'
import { feed } from './testing'
import { createConfigurator } from './useConfigurator'

/**
 * Mounts the line on a fresh Configurator.
 *
 * @returns the component and the Configurator
 */
async function lineOnNewConfigurator() {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(MetadataStatus)
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

it('shows why a file could not be loaded, as text', async () => {
  const { wrapper, handle } = await lineOnNewConfigurator()

  feed(handle, { metadataError: '<b>Can\'t load</b> the metadata' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#metadata-status .error').text()).toBe('<b>Can\'t load</b> the metadata')
  expect(wrapper.find('#metadata-status b').exists()).toBe(false)
})
