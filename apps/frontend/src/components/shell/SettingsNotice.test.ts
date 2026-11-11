import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SettingsNotice from './SettingsNotice.vue'
import { mockBackend } from '@/mock/mock-backend'
import { withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'

it('says nothing when the backend has nothing to say about the settings', async () => {
  createConfigurator(mockBackend())
  const wrapper = mount(SettingsNotice, withI18n)
  await flushPromises()

  // The status is in the page all the time, empty, so that a screen reader announces its text when it comes.
  expect(wrapper.find('#settings-notice').attributes('role')).toBe('status')
  expect(wrapper.find('#settings-notice').text()).toBe('')
  expect(wrapper.find('#settings-notice').classes()).not.toContain('has-text')
  expect(wrapper.find('#dismiss-settings-notice').exists()).toBe(false)
})

it('says what the backend says, as a status, and can be dismissed', async () => {
  createConfigurator(mockBackend({
    settingsNotice: { notice: 'The settings file could not be read and was set aside.', noticeCode: 'CORRUPT' },
  }))
  const wrapper = mount(SettingsNotice, withI18n)
  await flushPromises()

  const notice = wrapper.find('#settings-notice')
  expect(notice.attributes('role')).toBe('status')
  expect(notice.text()).toContain('The settings file could not be read and was set aside.')
  expect(notice.classes()).toContain('has-text')

  await wrapper.find('#dismiss-settings-notice').trigger('click')

  expect(wrapper.find('#settings-notice').exists()).toBe(true)
  expect(wrapper.find('#settings-notice').text()).toBe('')
  expect(wrapper.find('#settings-notice').classes()).not.toContain('has-text')
  expect(wrapper.find('#dismiss-settings-notice').exists()).toBe(false)
})
