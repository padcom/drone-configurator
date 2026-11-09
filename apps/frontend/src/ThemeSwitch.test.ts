import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ThemeSwitch from './ThemeSwitch.vue'
import { useTheme } from './kit/useTheme'
import { mockBackend } from './mock-backend'
import { withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

afterEach(() => {
  useTheme().set('system')
})

/**
 * The theme switch on a fresh Configurator whose backend holds `theme`.
 *
 * @param theme what the settings kept
 * @returns the mounted switch, and the handle
 */
async function switchWith(theme?: 'light' | 'dark' | 'system') {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui: [], theme } }))
  const wrapper = mount(ThemeSwitch, withI18n)
  await flushPromises()

  return { wrapper, handle }
}

it('offers the system, light and dark, and starts on the system', async () => {
  const { wrapper } = await switchWith()

  const labels = wrapper.findAll('label').map(label => label.text())
  const checked = wrapper.findAll('input').find(input => input.element.checked)

  expect(labels).toEqual(['System', 'Light', 'Dark'])
  expect(checked?.element.value).toBe('system')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})

it('shows the theme that was kept, as soon as the settings arrive', async () => {
  const { wrapper } = await switchWith('dark')

  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(wrapper.findAll('input').find(input => input.element.checked)?.element.value).toBe('dark')
})

it('changes the page at once when a theme is chosen, and keeps the choice in the settings', async () => {
  const { wrapper, handle } = await switchWith()

  await wrapper.find('input[value="dark"]').setValue(true)
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  await flushPromises()

  expect(handle.settings.settings.value.theme).toBe('dark')
  expect(handle.settings.notice.value).toBeNull()
})
