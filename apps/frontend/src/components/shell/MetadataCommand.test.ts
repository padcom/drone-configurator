// "Load parameter metadata…" in the palette runs the flow of the Load metadata button: in Pico Desktop the same call that
// opens the host's dialog, in a browser a file input pressed.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import Shell from './Shell.vue'
import { createConfigurator, useConfigurator } from '@/composables/useConfigurator'
import { useCommandPalette } from '@/composables/useCommandPalette'

let mounted: VueWrapper | undefined

/**
 * The shell at `path`, on a Configurator with no vehicle connected.
 *
 * @param path where the application is
 * @returns the shell
 */
async function shellAt(path: string): Promise<VueWrapper> {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return mounted
}

afterEach(() => {
  useCommandPalette().hide()
  mounted?.unmount()
  mounted = undefined
  delete window.picoDesktop
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/**
 * Runs the command from the palette, opened with Ctrl+P.
 *
 * @param wrapper the shell
 */
async function runFromThePalette(wrapper: VueWrapper): Promise<void> {
  const init = { code: 'KeyP', key: 'p', ctrlKey: true, bubbles: true, cancelable: true }
  document.body.dispatchEvent(new KeyboardEvent('keydown', init))
  await flushPromises()
  await wrapper.get('#palette-input').setValue('load parameter metadata')
  await wrapper.get('#palette-input').trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

it('asks the host to open the file, as the button does, from any screen and with no vehicle', async () => {
  window.picoDesktop = {} as typeof window.picoDesktop
  const wrapper = await shellAt('/flight')
  const open = vi.spyOn(useConfigurator().metadata, 'openFile').mockResolvedValue()
  await runFromThePalette(wrapper)

  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))
  expect(wrapper.find('#palette-input').exists()).toBe(false)
})

it('calls the very function that the button calls, in the host', async () => {
  window.picoDesktop = {} as typeof window.picoDesktop
  const wrapper = await shellAt('/parameters')
  const open = vi.spyOn(useConfigurator().metadata, 'openFile').mockResolvedValue()
  await wrapper.get('#metadata-button').trigger('click')

  expect(open).toHaveBeenCalledTimes(1)
  await runFromThePalette(wrapper)

  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2))
})

it('presses a file input in a browser: the screen\'s own when it has one, one made for the moment when it has not', async () => {
  const press = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
  const wrapper = await shellAt('/flight')
  await runFromThePalette(wrapper)

  await vi.waitFor(() => expect(press).toHaveBeenCalledTimes(1))
  const made = press.mock.contexts[0] as HTMLInputElement
  expect([made.type, made.accept, made.isConnected]).toEqual(['file', '.json,application/json', false])
})

it('loads what the input that was made chooses, with the same flow as the button: the toast of what was found', async () => {
  const press = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
  const wrapper = await shellAt('/flight')
  const load = vi.spyOn(useConfigurator().metadata, 'load').mockImplementation(() => undefined)
  await runFromThePalette(wrapper)
  await vi.waitFor(() => expect(press).toHaveBeenCalledTimes(1))
  const file = new File(['{"version":1,"params":{}}'], 'metadata.json', { type: 'application/json' })
  const made = press.mock.contexts[0] as HTMLInputElement
  Object.defineProperty(made, 'files', { value: [file] })
  made.dispatchEvent(new Event('change'))

  await vi.waitFor(() => expect(load).toHaveBeenCalledWith('{"version":1,"params":{}}'))
})
