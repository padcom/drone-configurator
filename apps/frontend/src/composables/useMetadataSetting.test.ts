import { describe, expect, it, vi } from 'vitest'
import { autoloadOn, METADATA_AUTOLOAD_KEY, METADATA_PATH_KEY, pathToLoad } from '@/lib/params/metadataSettings'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from './useConfigurator'
import { useMetadataSetting } from './useMetadataSetting'

const FILE = JSON.stringify({
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: { RTL_ALT: { description: 'Return altitude' } },
})

/**
 * A Configurator whose settings hold these entries.
 *
 * @param ui the entries
 * @param opens what the open dialog gives, one file at each use
 * @returns the Configurator
 */
async function rig(ui: { key: string, value: string }[] = [], opens: { path: string, text: string }[] = []) {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, opens }))
  await handle.settings.load()

  return handle
}

describe('what the settings say about loading the metadata', () => {
  it('is on unless the switch says off, and has a path to load only when there is one', () => {
    expect([autoloadOn(undefined), autoloadOn('on'), autoloadOn('off'), autoloadOn('x')]).toEqual([true, true, false, true])
    expect([pathToLoad(undefined, undefined), pathToLoad('', undefined), pathToLoad('  ', 'on')]).toEqual([null, null, null])
    expect(pathToLoad(' /a/b.json ', undefined)).toBe('/a/b.json')
    expect(pathToLoad('/a/b.json', 'off')).toBeNull()
  })
})

describe('the settings "Metadata file" and "Load the parameter metadata when the application starts" (kept)', () => {
  it('start as on with no path, for settings that have neither', async () => {
    await rig()
    const setting = useMetadataSetting()

    expect([setting.path.value, setting.autoload.value]).toEqual(['', true])
  })

  it('keep the path as written (without the spaces around it), and the switch', async () => {
    const handle = await rig()
    const setting = useMetadataSetting()

    await setting.choosePath('  /data/apm.pdef.json ')
    await setting.chooseAutoload(false)

    expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe('/data/apm.pdef.json')
    expect(handle.settings.uiValue(METADATA_AUTOLOAD_KEY)).toBe('off')
    expect([setting.path.value, setting.autoload.value]).toEqual(['/data/apm.pdef.json', false])
  })

  it('forget the path when it is emptied, and keep it when the switch goes off', async () => {
    const handle = await rig([{ key: METADATA_PATH_KEY, value: '/a.json' }])
    const setting = useMetadataSetting()

    await setting.chooseAutoload(false)
    expect(setting.path.value).toBe('/a.json')
    await setting.choosePath('')
    expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe('')
    expect(setting.path.value).toBe('')
  })
})

describe('the settings "Metadata file", for a file the user picks', () => {
  it('take the path of the file the user picks, and not that of a file that is not metadata', async () => {
    const handle = await rig([], [{ path: '/data/m.json', text: FILE }, { path: '/data/n.json', text: '{}' }])
    const setting = useMetadataSetting()

    await setting.pick()
    // (the settings keep it a moment after the file is loaded)
    await vi.waitFor(() => expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe('/data/m.json'))
    expect(handle.metadata.error.value).toBeNull()

    await setting.pick()
    // the path of the file that did not load is not kept, and why is the metadata's own error (the toast tells it)
    expect(handle.settings.uiValue(METADATA_PATH_KEY)).toBe('/data/m.json')
    expect(handle.metadata.error.value).toMatch(/^Can't load the metadata: not a parameter metadata file/u)
  })
})
