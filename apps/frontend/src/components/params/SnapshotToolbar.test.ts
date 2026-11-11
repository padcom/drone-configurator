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

  const words = (id: string) => wrapper.get(`${id} .command-button-label`).text()

  expect(words('#save')).toBe('Save snapshot')
  expect(words('#load-button')).toBe('Load snapshot')
  expect(words('#metadata-button')).toBe('Load metadata')
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

it('has real buttons for the files, which a keyboard reaches, with the icon on the left and no input of its own', async () => {
  const { wrapper } = await toolbarWithSpies()

  for (const id of ['#save', '#load-button', '#metadata-button']) {
    expect(wrapper.get(id).element.tagName, id).toBe('BUTTON')
    expect(wrapper.get(id).classes(), id).toContain('icon-left')
  }
  expect(wrapper.find('input').exists()).toBe(false)
  expect(wrapper.find('label').exists()).toBe(false)
})

it('says why Save snapshot cannot be pressed, in words a screen reader reads with the button', async () => {
  const { wrapper } = await toolbarWithSpies()
  const save = wrapper.get('#save')

  expect(save.attributes('disabled')).toBeDefined()
  expect(wrapper.get(`#${save.attributes('aria-describedby')}`).text()).toBe('There are no parameters yet.')
})

it('loads the file the browser\'s input gives, and nothing when none was chosen', async () => {
  const { wrapper, loadSnapshot, loadMetadata } = await toolbarWithSpies()
  const press = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
  await wrapper.get('#load-button').trigger('click')
  await wrapper.get('#metadata-button').trigger('click')
  await wrapper.get('#load-button').trigger('click')
  const [forSnapshot, forMetadata, cancelled] = press.mock.contexts as HTMLInputElement[]

  await choose(forSnapshot as Element, '{"snapshot":true}')
  await choose(forMetadata as Element, '{"metadata":true}')
  // The dialog is cancelled: the input has no file.
  Object.defineProperty(cancelled, 'files', { value: [], configurable: true })
  cancelled?.dispatchEvent(new Event('change'))
  await flushPromises()

  expect(loadSnapshot).toHaveBeenCalledTimes(1)
  expect(loadSnapshot).toHaveBeenCalledWith('{"snapshot":true}')
  expect(loadMetadata).toHaveBeenCalledWith('{"metadata":true}')
})
