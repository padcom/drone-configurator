import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SnapshotToolbar from './SnapshotToolbar.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { PARAMS } from './fixtures'

afterEach(() => {
  delete window.picoDesktop
  vi.unstubAllGlobals()
})

/**
 * Mounts the toolbar on a fresh Configurator whose file actions are spies.
 *
 * @returns the component, the Configurator and the spies
 */
async function toolbarWithSpies() {
  const handle = createConfigurator(mockBackend())
  const spies = {
    saveFile: vi.spyOn(handle.app, 'saveFile').mockResolvedValue(null),
    openSnapshotFile: vi.spyOn(handle.app, 'openSnapshotFile').mockResolvedValue(),
    openMetadataFile: vi.spyOn(handle.app, 'openMetadataFile').mockResolvedValue(),
    loadSnapshot: vi.spyOn(handle.app, 'loadSnapshot').mockImplementation(() => undefined),
    loadMetadata: vi.spyOn(handle.app, 'loadMetadata').mockImplementation(() => undefined),
  }
  const wrapper = mount(SnapshotToolbar, withI18n)
  await flushPromises()

  return { wrapper, handle, ...spies }
}

/**
 * Chooses a file in a file input of the page, the way the browser's dialog would.
 *
 * @param input the file input's element
 * @param text the file's text
 */
async function choose(input: Element, text: string): Promise<void> {
  Object.defineProperty(input, 'files', { value: [new File([text], 'a.json')], configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

it('labels its three controls with translated text', async () => {
  const { wrapper } = await toolbarWithSpies()

  expect(wrapper.get('#save').text()).toBe('Save snapshot')
  expect(wrapper.get('#load-button').text()).toBe('Load snapshot')
  expect(wrapper.get('#metadata-button').text()).toBe('Load metadata')
})

it('saves only once there are parameters, through the host in Pico Desktop', async () => {
  const { wrapper, handle, saveFile } = await toolbarWithSpies()
  expect(wrapper.get('#save').attributes('disabled')).toBeDefined()
  window.picoDesktop = {} as never
  feed(handle, { params: PARAMS })
  await wrapper.vm.$nextTick()

  await wrapper.get('#save').trigger('click')

  expect(saveFile).toHaveBeenCalledWith(expect.stringMatching(/^params-vehicle-.*\.json$/u), expect.stringContaining('"params"'))
})

it('downloads the snapshot in a browser', async () => {
  const { wrapper, handle, saveFile } = await toolbarWithSpies()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  feed(handle, { params: PARAMS })
  await wrapper.vm.$nextTick()

  await wrapper.get('#save').trigger('click')

  expect(click).toHaveBeenCalledTimes(1)
  expect(saveFile).not.toHaveBeenCalled()
})

it('opens the host\'s dialog for a click on Load in Pico Desktop, and leaves the file input alone', async () => {
  const { wrapper, openSnapshotFile, openMetadataFile } = await toolbarWithSpies()
  window.picoDesktop = {} as never

  const snapshotClick = new Event('click', { cancelable: true, bubbles: true })
  wrapper.get('#load-button').element.dispatchEvent(snapshotClick)
  const metadataClick = new Event('click', { cancelable: true, bubbles: true })
  wrapper.get('#metadata-button').element.dispatchEvent(metadataClick)

  expect(openSnapshotFile).toHaveBeenCalledTimes(1)
  expect(openMetadataFile).toHaveBeenCalledTimes(1)
  expect(snapshotClick.defaultPrevented).toBe(true)
  expect(metadataClick.defaultPrevented).toBe(true)
})

it('lets the browser open its file input when there is no host', async () => {
  const { wrapper, openSnapshotFile } = await toolbarWithSpies()
  const click = new Event('click', { cancelable: true, bubbles: true })

  wrapper.get('#load-button').element.dispatchEvent(click)

  expect(openSnapshotFile).not.toHaveBeenCalled()
  expect(click.defaultPrevented).toBe(false)
})

it('loads the file the browser\'s input gives, and nothing when none was chosen', async () => {
  const { wrapper, loadSnapshot, loadMetadata } = await toolbarWithSpies()

  await choose(wrapper.get('#load').element, '{"snapshot":true}')
  await choose(wrapper.get('#metadata').element, '{"metadata":true}')
  // The dialog is cancelled: the input has no file.
  Object.defineProperty(wrapper.get('#load').element, 'files', { value: [], configurable: true })
  wrapper.get('#load').element.dispatchEvent(new Event('change'))
  await flushPromises()

  expect(loadSnapshot).toHaveBeenCalledTimes(1)
  expect(loadSnapshot).toHaveBeenCalledWith('{"snapshot":true}')
  expect(loadMetadata).toHaveBeenCalledWith('{"metadata":true}')
})
