// The rail is a list of command ids (lib/app/railCommands.ts) drawn as command buttons: every screen of the product is on it, a
// click runs the screen's command (so the Parameters screen's search box gets the focus, anywhere), the link stays a real
// link, and the
// palette shows the same icons.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import { PRODUCT_SCREENS } from '@/screens/registry'
import { RAIL_COMMANDS } from '@/lib/app/railCommands'
import Shell from './Shell.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useCommands } from '@/composables/useCommands'

let mounted: VueWrapper | undefined

/**
 * The shell at `path`.
 *
 * @param path where the application is
 * @returns the shell and its router
 */
async function shellAt(path = '/flight') {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return { wrapper: mounted, router }
}

afterEach(() => {
  setLanguage('en')
  useCommandPalette().hide()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it('holds a command for every screen of the product, in the order of the rail, Settings at the bottom, and no other', () => {
  const ids = [...RAIL_COMMANDS.main, ...RAIL_COMMANDS.end]

  expect(ids).toEqual(PRODUCT_SCREENS.map(screen => `go.${screen.id}`).filter(id => id !== 'go.settings').concat('go.settings'))
  expect(RAIL_COMMANDS.end).toEqual(['go.settings'])

  for (const id of ids) {
    expect(useCommands().get(id), id).toBeDefined()
    expect(useCommands().get(id)?.icon, id).toBeDefined()
  }
})

it('draws a link for each command of the table: the rail\'s look, the screen\'s name, an icon over it', async () => {
  const { wrapper } = await shellAt()
  const items = wrapper.findAll('nav a[data-command-button]')

  expect(items.map(item => item.attributes('data-command-button')))
    .toEqual([...RAIL_COMMANDS.main, ...RAIL_COMMANDS.end])
  expect(items.every(item => item.classes().includes('rail-item') && item.find('.rail-icon svg').exists())).toBe(true)
  expect(items.map(item => item.get('.rail-label').text()).slice(0, 3)).toEqual(['Flight data', 'Plan', 'Setup'])
})

it('runs the command on a click: the screen, and the focus stays on the rail for a screen with no place of its own', async () => {
  const { wrapper, router } = await shellAt()
  const invoke = vi.spyOn(useCommands(), 'invoke')
  const plan = wrapper.get<HTMLAnchorElement>('nav a[data-command-button="go.plan"]')
  plan.element.focus()
  await plan.trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plan'))
  await new Promise(resolve => {
    setTimeout(resolve, 100)
  })

  expect(invoke).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(plan.element)
  expect(plan.attributes('aria-current')).toBe('page')
})

it('puts the focus in the Parameters search box on a click on Parameters, as the palette does', async () => {
  const { wrapper } = await shellAt()
  await wrapper.get('nav a[data-command-button="go.parameters"]').trigger('click')

  await vi.waitFor(() => expect(document.activeElement).toBe(document.getElementById('filter')))
})

it('is a real link with the route: opened elsewhere on a middle click or Ctrl, the command is not run', async () => {
  const { wrapper } = await shellAt()
  const invoke = vi.spyOn(useCommands(), 'invoke')
  const link = wrapper.get('nav a[data-command-button="go.logs"]')
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
  link.element.dispatchEvent(click)

  expect(link.attributes('href')).toBe('/logs')
  expect(click.defaultPrevented).toBe(false)
  expect(invoke).not.toHaveBeenCalled()
})

it('marks only the screen that is shown as current, and follows a change', async () => {
  const { wrapper, router } = await shellAt('/setup')
  const current = () => wrapper.findAll('nav a[aria-current="page"]').map(link => link.attributes('data-command-button'))

  expect(current()).toEqual(['go.setup'])
  await router.push('/logs')
  await flushPromises()

  expect(current()).toEqual(['go.logs'])
})

it('shows the palette rows with the same icons as the rail, drawn for the eye only', async () => {
  const { wrapper } = await shellAt()
  const init = { code: 'KeyP', key: 'p', ctrlKey: true, bubbles: true, cancelable: true }
  document.body.dispatchEvent(new KeyboardEvent('keydown', init))
  await flushPromises()
  const row = wrapper.get('.palette-row[data-command="go.parameters"]')

  expect(row.get('.palette-icon').attributes('aria-hidden')).toBe('true')
  expect(row.find('.palette-icon svg').exists()).toBe(true)
  expect(wrapper.findAll('.palette-row .palette-icon svg').length).toBe(wrapper.findAll('.palette-row').length)
})
