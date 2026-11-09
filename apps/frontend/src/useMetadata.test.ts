import { expect, it } from 'vitest'
import { createBackendClient } from './backend/client'
import { mockBackend } from './mock-backend'
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

  expect(metadata.error.value).toBe('Can\'t load the metadata: not a Drone Configurator metadata file.')
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
