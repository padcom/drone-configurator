import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n } from './i18n'
import { mockBackend } from './mock-backend'
import { createAppRouter } from './router'
import Shell from './Shell.vue'
import { createConfigurator } from './useConfigurator'

let mounted: VueWrapper | undefined

/**
 * The shell on a fresh Configurator, with the router at `path`.
 *
 * @param path where the application is
 * @returns the mounted shell and its router
 */
async function shellAt(path: string) {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return { wrapper: mounted, router }
}

/**
 * Follows the navigation link called `title`, and waits until the screen it leads to (loaded when first asked for) is shown.
 *
 * @param wrapper the shell
 * @param title the link's text
 */
async function follow(wrapper: VueWrapper, title: string): Promise<void> {
  const link = wrapper.findAll('nav a').find(a => a.text() === title)
  const path = link?.attributes('href')
  await link?.trigger('click')
  const shown = () => wrapper.findAll('nav a').find(a => a.attributes('href') === path)?.attributes('aria-current')
  await vi.waitFor(() => expect(shown()).toBe('page'))
  await flushPromises()
}

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

it('starts on Flight data, with the connection on top', async () => {
  const { wrapper, router } = await shellAt('/')

  expect(router.currentRoute.value.path).toBe('/flight')
  expect(wrapper.find('header#top-bar').exists()).toBe(true)
  expect(wrapper.find('.connect-strip #connect-button').exists()).toBe(true)
  expect(wrapper.find('#telemetry').exists()).toBe(true)
  expect(wrapper.find('#list-status').exists()).toBe(false)
})

it('has a link for every screen, in order, as native links a keyboard can reach', async () => {
  const { wrapper } = await shellAt('/flight')

  // The screens of the product, the gallery (which the development build, and so the tests, has), and Settings at the end.
  const links = wrapper.findAll('nav a')
  expect(links.map(link => link.text()))
    .toEqual(['Flight data', 'Plan', 'Setup', 'Parameters', 'Tune', 'Logs', 'Simulation', 'Gallery', 'Settings'])
  expect(links.map(link => link.attributes('href')))
    .toEqual(['/flight', '/plan', '/setup', '/parameters', '/tune', '/logs', '/simulation', '/gallery', '/settings'])
  expect(wrapper.find('nav').attributes('aria-label')).toBe('Screens')
})

it('draws the rail with an icon over each name, and Settings apart at the bottom', async () => {
  const { wrapper } = await shellAt('/flight')

  expect(wrapper.findAll('nav a').every(link => link.find('svg[aria-hidden="true"]').exists())).toBe(true)
  expect(wrapper.findAll('.rail-end a').map(link => link.text())).toEqual(['Settings'])
  expect(wrapper.find('.app-row > .rail').exists()).toBe(true)
  expect(wrapper.find('.app-row > main.app-main #telemetry').exists()).toBe(true)
  expect(wrapper.findAll('main')).toHaveLength(1)
})

it('shows the screen followed, and says in the link which one it is', async () => {
  const { wrapper, router } = await shellAt('/flight')

  await follow(wrapper, 'Parameters')

  expect(router.currentRoute.value.path).toBe('/parameters')
  expect(wrapper.find('#list-status').exists()).toBe(true)
  expect(wrapper.find('#telemetry').exists()).toBe(false)
  const current = wrapper.findAll('nav a').filter(link => link.attributes('aria-current') === 'page')
  expect(current.map(link => link.text())).toEqual(['Parameters'])
})

it('says that a screen that is not built yet is not available, under its own name', async () => {
  const { wrapper } = await shellAt('/flight')

  await follow(wrapper, 'Plan')
  expect(wrapper.text()).toContain('Plan is not available yet.')
  await follow(wrapper, 'Tune')
  expect(wrapper.text()).toContain('Tune is not available yet.')
  expect(wrapper.text()).not.toContain('Plan is not available yet.')
})

it('keeps a screen that was shown, as it was, while another is', async () => {
  const { wrapper } = await shellAt('/parameters')
  const filter = wrapper.find<HTMLInputElement>('#filter')
  await filter.setValue('RTL')

  await follow(wrapper, 'Flight data')
  expect(wrapper.find('#filter').exists()).toBe(false)
  await follow(wrapper, 'Parameters')

  expect(wrapper.find<HTMLInputElement>('#filter').element).toBe(filter.element)
  expect(wrapper.find<HTMLInputElement>('#filter').element.value).toBe('RTL')
})

it('has the top bar on every screen, even one that is not built yet', async () => {
  const { wrapper } = await shellAt('/flight')
  expect(wrapper.find('header#top-bar').exists()).toBe(true)

  await follow(wrapper, 'Parameters')
  expect(wrapper.find('header#top-bar').exists()).toBe(true)
  await follow(wrapper, 'Logs')
  expect(wrapper.find('header#top-bar').exists()).toBe(true)
  expect(wrapper.findAll('header#top-bar').length).toBe(1)
  expect(wrapper.find('footer').exists()).toBe(false)
})

it('has the toast region, which is always there', async () => {
  const { wrapper } = await shellAt('/flight')

  expect(wrapper.find('[role="region"][aria-label="Notifications"]').exists()).toBe(true)
})

it('takes any other address to Flight data', async () => {
  const { router } = await shellAt('/nowhere')

  expect(router.currentRoute.value.path).toBe('/flight')
})
