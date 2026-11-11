// What follows a command that ran, whoever asked for it: it is remembered (the palette lists it first), and, only when the
// setting "Show a notification when a command runs" is on, a toast says its name. And the setting, in the Settings screen.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import CommandButton from '@/components/ui/CommandButton.vue'
import Settings from '@/screens/Settings.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { NOTICE_KEY, forgetNoticeChoice } from './useCommandNotice'
import { RECENT_KEY, WRITE_MS, forgetUsage, useCommandUsage } from './useCommandUsage'
import { useToasts } from './toasts'

const mounted: VueWrapper[] = []

/**
 * A command button on a router, with the settings as given.
 *
 * @param ui the entries the settings hold
 * @returns the Configurator and the router
 */
async function setup(ui: { key: string, value: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui } }))
  await handle.settings.load()
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  const options = { props: { command: 'go.plan' }, global: { plugins: [i18n, router] }, attachTo: document.body }
  mounted.push(mount(CommandButton, options))
  await router.isReady()
  await flushPromises()

  return { handle, router, button: mounted[0] as VueWrapper }
}

afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  forgetUsage()
  forgetNoticeChoice()
  useToasts().visible.value.splice(0)
})

it('remembers a command that ran, in the settings, newest first, from a button as from the palette or a key', async () => {
  const { handle, button, router } = await setup()

  await button.trigger('click')

  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plan'))
  // Shown at once; written a moment later, not on every run.
  expect(handle.settings.uiValue(RECENT_KEY)).toBeUndefined()
  await vi.waitFor(() => expect(handle.settings.uiValue(RECENT_KEY)).toBe('["go.plan"]'), { timeout: WRITE_MS + 2000 })
})

it('writes a run of commands once, and says nothing at all when the settings cannot keep it', async () => {
  const { handle, button } = await setup()
  const setUi = vi.spyOn(handle.settings, 'setUi').mockResolvedValue()
  const { record } = useCommandUsage()

  record('go.plan')
  record('go.tune')
  record('go.logs')
  await button.trigger('click')

  await vi.waitFor(() => expect(setUi).toHaveBeenCalledTimes(1), { timeout: WRITE_MS + 2000 })
  expect(setUi).toHaveBeenCalledWith(RECENT_KEY, '["go.plan","go.logs","go.tune"]', true)
  // Not kept (the settings did not take it): the list stays as this session made it, and no toast or notice was raised.
  expect(useCommandUsage().recent.value.slice(0, 3)).toEqual(['go.plan', 'go.logs', 'go.tune'])
  expect(handle.settings.notice.value).toBeNull()
  expect(useToasts().visible.value).toEqual([])
})

it('raises no notification for a command that ran while the setting is off (the default)', async () => {
  const { button, router } = await setup()

  await button.trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plan'))
  await flushPromises()

  expect(useToasts().visible.value.map(toast => toast.text)).toEqual([])
})

it('says the name of a command that ran, in a toast, when the setting is on', async () => {
  const { button } = await setup([{ key: NOTICE_KEY, value: 'on' }])

  await button.trigger('click')

  await vi.waitFor(() => expect(useToasts().visible.value.map(toast => toast.text)).toEqual(['Switch to Plan']))
})

it('is a switch in the Settings screen, labelled, with its help, off by default, and keeps the choice', async () => {
  const { handle } = await setup()
  const settings = mount(Settings, { global: { plugins: [i18n] } })
  mounted.push(settings)
  const toggle = settings.get('#notify-commands')

  expect(toggle.attributes('role')).toBe('switch')
  expect(toggle.attributes('aria-checked')).toBe('false')
  expect(toggle.text()).toBe('Show a notification when a command runs')
  expect(settings.get(`#${toggle.attributes('aria-describedby')}`).text()).toContain('says its name')
  await toggle.trigger('click')
  await flushPromises()

  expect(settings.get('#notify-commands').attributes('aria-checked')).toBe('true')
  expect(handle.settings.uiValue(NOTICE_KEY)).toBe('on')
})
