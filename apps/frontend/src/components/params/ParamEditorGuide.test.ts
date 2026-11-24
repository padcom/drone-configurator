// The link from the detail of a parameter to the guided page that sets it (#36).
import { expect, it } from 'vitest'
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils'
import ParamEditor from './ParamEditor.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { PARAMS } from '@/mock/fixtures'

/**
 * The editor with a parameter selected.
 *
 * @param selected the parameter
 * @returns the component
 */
async function editorOn(selected: string) {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, { global: { ...withI18n.global, stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  feed(handle, { params: PARAMS, selected })
  await wrapper.vm.$nextTick()

  return wrapper
}

it('links a parameter to the Setup page that sets it, in words that name the page', async () => {
  const wrapper = await editorOn('FS_THR_ENABLE')
  const link = wrapper.getComponent(RouterLinkStub)

  expect(link.props('to')).toBe('/setup/failsafes')
  expect(link.text()).toBe('Set up in Failsafes')
})

it('has no link for a parameter that no page sets', async () => {
  const wrapper = await editorOn('RTL_ALT')

  expect(wrapper.find('#param-guide').exists()).toBe(false)
})
