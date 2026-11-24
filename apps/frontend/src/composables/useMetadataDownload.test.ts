// The download of the connected vehicle's parameter metadata (#35): at each connection (not a link that came back), not with the
// switch off, not over a file the user loaded; a file the cache gives that cannot be read is asked for from the server; nothing
// coming leaves the parameters without descriptions (and drops another vehicle's); the latest file instead of the version's is
// said once; and the Settings button downloads again, keeping what is in use when it cannot.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { watch } from 'vue'
import type { MetadataFile } from '@/generated/app'
import { METADATA_DOWNLOAD_KEY } from '@/lib/params/metadataSettings'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { useToasts } from './toasts'
import { createConfigurator } from './useConfigurator'
import { refreshMetadata } from './useMetadataDownload'

const XML = `<?xml version="1.0"?><paramfile><vehicles><parameters name="ArduCopter">
<param humanName="Return height" name="ArduCopter:RTL_ALT" documentation="How high." user="Standard"/>
</parameters></vehicles></paramfile>`
const JSON_LATEST = JSON.stringify({ json: { version: 0 }, ArduCopter: { RTL_ALT: { DisplayName: 'Latest return height' } } })

const EXACT: MetadataFile = {
  vehicle: 'copter', version: '4.5.7', exact: true, format: 'xml', text: XML, fromCache: false, stale: false, fetchedAt: 1,
}
const LATEST: MetadataFile = { ...EXACT, exact: false, format: 'json', text: JSON_LATEST }

afterEach(() => {
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))
})

/**
 * A Configurator over a backend whose `metadata.fetch` gives these answers.
 *
 * @param metadata the answers, one at each call (an error code fails it)
 * @param ui the entries the settings hold
 * @returns the Configurator and the mock's controls
 */
async function start(metadata: (MetadataFile | string)[], ui: { key: string, value: string }[] = []) {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui }, metadata, control }))
  await vi.waitFor(() => expect(handle.settings.loaded.value).toBe(true))

  return { handle, control, asked: () => control.metadataAsked?.() ?? [] }
}

/**
 * Connects the simulated vehicle and waits for what follows to settle.
 *
 * @param handle the Configurator
 */
async function connect(handle: ReturnType<typeof createConfigurator>): Promise<void> {
  await handle.vehicle.connect({ transport: 'simulator' })
  await flushPromises()
  await vi.waitFor(() => expect(handle.metadata.downloading.value).toBe(false))
}

/**
 * The words of the toasts about the metadata that are shown (not those of the parameters' download).
 *
 * @returns each toast's text
 */
const toasted = () => useToasts().visible.value.filter(toast => toast.id.startsWith('metadata')).map(toast => toast.text)

// eslint-disable-next-line max-lines-per-function -- one mock backend per case, kept in one place
describe('the metadata download at connection', () => {
  it('downloads the connected vehicle\'s metadata and uses it, saying nothing when it is the version\'s', async () => {
    const { handle, asked } = await start([EXACT])
    const seen: unknown[] = []
    watch(handle.metadata.progress, progress => progress && seen.push(progress), { flush: 'sync' })
    await connect(handle)

    expect(asked()).toEqual([{}])
    expect(handle.metadata.metadata.value.get('RTL_ALT')?.description).toBe('Return height')
    expect(handle.metadata.source.value).toBe('download')
    expect(handle.metadata.downloaded.value).toMatchObject({ vehicle: 'copter', version: '4.5.7', exact: true, count: 1 })
    // It said how far it was while it ran, and nothing once it is over.
    const total = XML.length
    expect(seen).toEqual([{ received: Math.floor(total / 2), total }, { received: total, total }])
    expect(handle.metadata.progress.value).toBeNull()
    expect(toasted()).toEqual([])
  })

  it('says once that the latest file is used, when it comes from the server, and not when it comes from the cache', async () => {
    const { handle } = await start([LATEST, { ...LATEST, fromCache: true }])
    await connect(handle)
    expect(toasted()).toEqual(['ArduPilot has no metadata for Copter 4.5.7, so the latest is used. Some parameters may differ.'])
    useToasts().visible.value.forEach(toast => useToasts().dismiss(toast.key))

    await handle.vehicle.disconnect()
    await connect(handle)

    expect(handle.metadata.downloaded.value?.fromCache).toBe(true)
    expect(toasted()).toEqual([])
  })

  it('asks the server again when the file the cache gives cannot be read', async () => {
    const { handle, asked } = await start([{ ...EXACT, text: XML.slice(0, 50), fromCache: true }, EXACT])
    await connect(handle)

    expect(asked()).toEqual([{}, { refresh: true }])
    expect(handle.metadata.metadata.value.has('RTL_ALT')).toBe(true)
  })

  it('shows the parameters without descriptions when nothing comes, and drops what was downloaded for a vehicle', async () => {
    const { handle } = await start([EXACT, 'UNAVAILABLE'])
    await connect(handle)
    expect(handle.metadata.metadata.value.size).toBe(1)

    await handle.vehicle.disconnect()
    await connect(handle)

    expect(handle.metadata.metadata.value.size).toBe(0)
    expect(handle.metadata.source.value).toBe('none')
    expect(handle.metadata.downloadError.value).toMatch(/server cannot be reached/u)
    // Nothing is said: the line in Settings says why.
    expect(toasted()).toEqual([])
  })

  it('downloads nothing with the switch off, or over a file the user loaded', async () => {
    const off = await start([EXACT], [{ key: METADATA_DOWNLOAD_KEY, value: 'off' }])
    await connect(off.handle)
    expect(off.asked()).toEqual([])
    await off.handle.vehicle.disconnect()

    const file = await start([EXACT])
    file.handle.metadata.load(JSON.stringify({ format: 'drone-configurator/param-metadata', version: 1, params: { A: {} } }))
    await connect(file.handle)
    expect(file.asked()).toEqual([])
    expect(file.handle.metadata.metadata.value.has('A')).toBe(true)
  })

  it('downloads nothing when the link comes back to the same vehicle', async () => {
    const { handle, control, asked } = await start([EXACT])
    await connect(handle)
    const { vehicle } = handle.vehicle.connection.value

    control.connection?.({ state: 'reconnecting', vehicle, attempt: 1 })
    control.connection?.({ state: 'connected', vehicle, resumed: true })
    await flushPromises()

    expect(asked()).toEqual([{}])
  })
})

describe('downloading the metadata again', () => {
  it('asks the server, and keeps what is in use and says why when it cannot', async () => {
    const { handle, asked } = await start([EXACT, EXACT, 'UNAVAILABLE'])
    await connect(handle)

    await refreshMetadata(handle.metadata)
    expect(asked()).toEqual([{}, { refresh: true }])
    expect(toasted()).toEqual([])

    await refreshMetadata(handle.metadata)
    expect(handle.metadata.metadata.value.size).toBe(1)
    expect(handle.metadata.source.value).toBe('download')
    expect(toasted()[0]).toMatch(/^Can't download the metadata again: .*\. The metadata in use is kept\.$/u)
  })
})
