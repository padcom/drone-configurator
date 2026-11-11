import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SnapshotToolbar from './SnapshotToolbar.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { PARAMS } from '@/mock/fixtures'

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
    saveFile: vi.spyOn(handle.snapshots, 'saveFile').mockResolvedValue(null),
    openSnapshotFile: vi.spyOn(handle.snapshots, 'openFile').mockResolvedValue(),
    openMetadataFile: vi.spyOn(handle.metadata, 'openFile').mockResolvedValue(),
    loadSnapshot: vi.spyOn(handle.snapshots, 'load').mockImplementation(() => undefined),
    loadMetadata: vi.spyOn(handle.metadata, 'load').mockImplementation(() => undefined),
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

  const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
  await wrapper.get('#load-button').trigger('click')
  await wrapper.get('#metadata-button').trigger('click')

  expect(openSnapshotFile).toHaveBeenCalledTimes(1)
  expect(openMetadataFile).toHaveBeenCalledTimes(1)
  expect(inputClick).not.toHaveBeenCalled()
})

it('presses the file input for a button press when there is no host', async () => {
  const { wrapper, openSnapshotFile, openMetadataFile } = await toolbarWithSpies()
  const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)

  await wrapper.get('#load-button').trigger('click')
  await wrapper.get('#metadata-button').trigger('click')

  expect(openSnapshotFile).not.toHaveBeenCalled()
  expect(openMetadataFile).not.toHaveBeenCalled()
  expect(inputClick).toHaveBeenCalledTimes(2)
})

it('has real buttons for the files, which a keyboard reaches, and the hidden inputs beside them', async () => {
  const { wrapper } = await toolbarWithSpies()

  for (const id of ['#save', '#load-button', '#metadata-button']) {
    expect(wrapper.get(id).element.tagName, id).toBe('BUTTON')
  }
  expect(wrapper.get('#load').attributes('hidden')).toBeDefined()
  expect(wrapper.find('label').exists()).toBe(false)
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
