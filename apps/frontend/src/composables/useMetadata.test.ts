import { expect, it } from 'vitest'
import { createBackendClient } from '@/backend/client'
import { mockBackend } from '@/mock/mock-backend'
import { useMetadata } from './useMetadata'

const FILE = JSON.stringify({
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: { RTL_ALT: { description: 'Return altitude', units: 'cm', min: 200 } },
})

it('loads metadata, and clears the error of a file that failed before', () => {
  const metadata = useMetadata({ client: createBackendClient(mockBackend()) })
  metadata.load('{')
  expect(metadata.error.value).toBe('Can\'t load the metadata: not JSON.')

  metadata.load(FILE)

  expect(metadata.error.value).toBeNull()
  expect(metadata.metadata.value.get('RTL_ALT')).toEqual({ description: 'Return altitude', units: 'cm', min: 200 })
})

it('keeps what was loaded when a later file is not metadata', () => {
  const metadata = useMetadata({ client: createBackendClient(mockBackend()) })
  metadata.load(FILE)

  metadata.load('{}')

  expect(metadata.error.value).toMatch(/^Can't load the metadata: not a parameter metadata file/u)
  expect(metadata.metadata.value.size).toBe(1)
})

it('keeps what was loaded when a later file has no parameters', () => {
  const metadata = useMetadata({ client: createBackendClient(mockBackend()) })
  metadata.load(FILE)

  metadata.load('{"json":{"version":0}}')

  expect(metadata.error.value).toBe('Can\'t load the metadata: it describes no parameters.')
  expect(metadata.metadata.value.size).toBe(1)
})

it('opens the file the backend\'s dialog gives, and loads it', async () => {
  const client = createBackendClient(mockBackend())
  await client.call('files.save', { name: 'metadata.json', text: FILE })
  const metadata = useMetadata({ client })

  await metadata.openFile()

  expect(metadata.metadata.value.has('RTL_ALT')).toBe(true)
  expect(metadata.error.value).toBeNull()
})

it('loads nothing when the dialog gave no file', async () => {
  const metadata = useMetadata({ client: createBackendClient(mockBackend()) })

  await metadata.openFile()

  expect(metadata.metadata.value.size).toBe(0)
  expect(metadata.error.value).toBeNull()
})

it('keeps the path of a file that was picked and loaded, and not of one that was not metadata', async () => {
  const client = createBackendClient(mockBackend())
  const kept: string[] = []
  const metadata = useMetadata({ client, rememberPath: path => kept.push(path) })
  await client.call('files.save', { name: 'metadata.json', text: FILE })

  await metadata.openFile()
  expect(kept).toEqual(['/mock/metadata.json'])

  await client.call('files.save', { name: 'other.json', text: '{}' })
  await metadata.openFile()
  expect(kept).toEqual(['/mock/metadata.json'])
  expect(metadata.error.value).toMatch(/^Can't load the metadata: not a parameter metadata file/u)
})

it('loads the file at a path the way a picked file is loaded, and counts nothing as tried by the user', async () => {
  const metadata = useMetadata({ client: createBackendClient(mockBackend({ files: { '/data/m.json': FILE } })) })

  expect(await metadata.loadFrom('/data/m.json')).toBeNull()

  expect(metadata.metadata.value.has('RTL_ALT')).toBe(true)
  expect(metadata.loads.value).toBe(0)
})

it('says which path could not be loaded and why, and keeps what was loaded', async () => {
  const metadata = useMetadata({ client: createBackendClient(mockBackend({ files: { '/data/bad.json': '{}' } })) })
  metadata.load(FILE)

  const gone = await metadata.loadFrom('/data/gone.json')
  expect(gone).toBe('Can\'t load the metadata from /data/gone.json: NOT_FOUND: no such file')
  const bad = await metadata.loadFrom('/data/bad.json')
  expect(bad).toMatch(/^Can't load the metadata from \/data\/bad\.json: not a parameter metadata file/u)
  expect(metadata.metadata.value.size).toBe(1)
})
