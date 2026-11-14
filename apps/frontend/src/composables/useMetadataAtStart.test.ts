// The load of the stored metadata file when the application starts: it goes through the loader a picked file goes through, tells
// a failure once with the path and the reason, never blocks, never tries again, and does nothing with the switch off.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { METADATA_AUTOLOAD_KEY, METADATA_PATH_KEY } from '@/lib/params/metadataSettings'
import { useToasts } from './toasts'
import { createConfigurator } from './useConfigurator'
import { useMetadataAtStart } from './useMetadataAtStart'

const PATH = '/data/apm.pdef.json'
const FILE = JSON.stringify({
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: { RTL_ALT: { description: 'Return altitude', units: 'cm', min: 200 } },
})
const SAYS = `Can't load the metadata from ${PATH}: `

afterEach(() => {
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))
})

/**
 * The entries of settings that name a path, and say whether the switch is on or off (or have no switch entry at all).
 *
 * @param autoload `on`, `off`, or nothing
 * @returns the entries
 */
function entries(autoload?: string): { key: string, value: string }[] {
  const path = { key: METADATA_PATH_KEY, value: PATH }

  return autoload === undefined ? [path] : [path, { key: METADATA_AUTOLOAD_KEY, value: autoload }]
}

/**
 * A Configurator started with these settings and files, with the load at start asked for.
 *
 * @param ui the entries the settings hold
 * @param files the files that can be read
 * @returns the Configurator and the mock's controls
 */
async function start(ui: { key: string, value: string }[], files: Record<string, string> = {}) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, files, control }))
  useMetadataAtStart()
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))
  await flushPromises()

  return { handle, control }
}

/**
 * The words of the toasts that are shown.
 *
 * @returns each toast's text
 */
function toasted(): string[] {
  return useToasts().visible.value.map(toast => toast.text)
}

describe('the load of the metadata at start, when there is a file to load', () => {
  it('loads the file the settings name when the switch has no entry at all (an install from before it)', async () => {
    const { handle, control } = await start(entries(), { [PATH]: FILE })

    expect(control.filesRead?.()).toEqual([PATH])
    expect(handle.metadata.metadata.value.has('RTL_ALT')).toBe(true)
    expect(handle.metadata.error.value).toBeNull()
    // it went well: nothing is said, and it is not a file the user just tried (the result toast of Parameters is not for it)
    expect(toasted()).toEqual([])
    expect(handle.metadata.loads.value).toBe(0)
  })

  it('loads the file when the switch is on', async () => {
    const { handle } = await start(entries('on'), { [PATH]: FILE })

    expect(handle.metadata.metadata.value.size).toBe(1)
  })

  it('does not wait for the file: the application is up while it is read', async () => {
    const { handle } = await start(entries())

    expect(handle.vehicle.connection.value.state).toBe('disconnected')
  })
})

describe('the load of the metadata at start, when there is nothing to load', () => {
  it('does nothing with settings that have neither key: the default is on, and there is nothing to load', async () => {
    const { handle, control } = await start([])

    expect(control.filesRead?.()).toEqual([])
    expect(handle.metadata.metadata.value.size).toBe(0)
    expect(toasted()).toEqual([])
  })

  it('reads nothing with the switch off, and keeps the path', async () => {
    const { handle, control } = await start(entries('off'), { [PATH]: FILE })

    expect(control.filesRead?.()).toEqual([])
    expect(handle.metadata.metadata.value.size).toBe(0)
    expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe(PATH)
    expect(toasted()).toEqual([])
  })
})

describe('the load of the metadata at start, when the file cannot be loaded', () => {
  it('says once, with the path and the reason, that the file is not there, and keeps the path', async () => {
    const { handle, control } = await start(entries())

    expect(toasted()).toEqual([`${SAYS}NOT_FOUND: no such file`])
    expect(handle.metadata.metadata.value.size).toBe(0)
    expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe(PATH)
    // not tried again, by anything the settings say afterwards
    await handle.settings.setUi('layout.x', 'y')
    await flushPromises()
    expect(control.filesRead?.()).toEqual([PATH])
    expect(toasted()).toHaveLength(1)
  })

  it('says once, with the path, that the file is not metadata, and loads nothing', async () => {
    const { handle } = await start(entries(), { [PATH]: '{"nothing":1}' })

    expect(toasted()).toHaveLength(1)
    expect(toasted()[0]).toMatch(new RegExp(`^${SAYS}not a parameter metadata file`, 'u'))
    expect(handle.metadata.metadata.value.size).toBe(0)
  })
})
