// The Fly switch and the top-bar indicator of the RC control: nothing of it is on the screen unless the setting allows it, the
// switch says why it cannot be turned on, and the indicator is there only while the control is on.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { forgetRcAllowChoice } from '@/composables/useRcSettings'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import RcIndicator from '@/components/shell/RcIndicator.vue'
import RcControlSwitch from './RcControlSwitch.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  forgetRcAllowChoice()
})

/**
 * The switch over settings that hold these entries.
 *
 * @param ui the settings entries
 * @returns the switch and the indicator
 */
async function screen(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  const wrapper = mount(RcControlSwitch, { global: { plugins: [i18n] } })
  const indicator = mount(RcIndicator, { global: { plugins: [i18n] } })

  mounted = wrapper
  await flushPromises()

  return { wrapper, indicator, handle }
}

it('is not on the screen when RC control is not allowed, and the indicator is not either', async () => {
  const { wrapper, indicator } = await screen()

  expect(wrapper.find('#rc-control').exists()).toBe(false)
  expect(indicator.find('#rc-indicator').exists()).toBe(false)
})

it('is there when it is allowed, off, and says that no simulator is connected', async () => {
  const { wrapper } = await screen([{ key: 'rc.allow', value: 'on' }])

  expect(wrapper.get('#rc-control-switch').attributes('aria-checked')).toBe('false')
  expect(wrapper.get('#rc-control-switch').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#rc-control p').text()).toBe('No simulator is connected.')
})
