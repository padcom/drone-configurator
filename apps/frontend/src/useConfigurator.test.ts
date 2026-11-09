import { expect, it } from 'vitest'
import { mockBackend } from './mock-backend'
import { createConfigurator, useConfigurator } from './useConfigurator'

it('gives the components each field as the very ref that the composable holding it changes', () => {
  const { fields, vehicle, parameters, metadata, snapshots } = createConfigurator(mockBackend())

  expect(fields.connection).toBe(vehicle.connection)
  expect(fields.telemetry).toBe(vehicle.telemetry)
  expect(fields.ports).toBe(vehicle.ports)
  expect(fields.notice).toBe(vehicle.notice)
  expect(fields.params).toBe(parameters.params)
  expect(fields.draft).toBe(parameters.draft)
  expect(fields.lastWrite).toBe(parameters.lastWrite)
  expect(fields.metadata).toBe(metadata.metadata)
  expect(fields.metadataError).toBe(metadata.error)
  expect(fields.importReview).toBe(snapshots.importReview)
  expect(fields.backup).toBe(snapshots.backup)
})

it('has a ref for every field of the state, and nothing else', () => {
  const { fields } = createConfigurator(mockBackend())

  expect(Object.keys(fields).sort()).toEqual([
    'applied',
    'applying',
    'backup',
    'connection',
    'draft',
    'draftError',
    'error',
    'filter',
    'importError',
    'importReview',
    'lastWrite',
    'list',
    'metadata',
    'metadataError',
    'missing',
    'notice',
    'params',
    'picked',
    'ports',
    'selected',
    'telemetry',
    'writing',
  ])
})

it('keeps the parameter list reference across telemetry ticks', async () => {
  const { vehicle, fields } = createConfigurator(mockBackend({ telemetryMs: 20 }))
  await vehicle.connect({ transport: 'simulator' })
  await expect.poll(() => fields.list.value).toBe('complete')
  const params = fields.params.value

  await expect.poll(() => fields.telemetry.value).not.toBeNull()
  const first = fields.telemetry.value
  await expect.poll(() => fields.telemetry.value).not.toBe(first)
  expect(fields.params.value).toBe(params)
})

it('returns the Configurator that was started', () => {
  const handle = createConfigurator(mockBackend())

  expect(useConfigurator()).toBe(handle)
})

it('downloads the parameters once the vehicle is connected, and forgets a write when it is not', async () => {
  const { vehicle, parameters, fields } = createConfigurator(mockBackend())
  expect(fields.list.value).toBe('none')

  await vehicle.connect({ transport: 'simulator' })
  await expect.poll(() => fields.list.value).toBe('complete')
  parameters.writing.value = true
  await vehicle.disconnect()

  expect(fields.writing.value).toBe(false)
  expect(fields.params.value.length).toBeGreaterThan(0)
})

it('resolves a confirmation with the answer and clears the question', async () => {
  const { vehicle, parameters, confirmation, fields } = createConfigurator(mockBackend())
  await vehicle.connect({ transport: 'simulator' })
  await expect.poll(() => fields.list.value).toBe('complete')
  parameters.select('RTL_ALT')
  parameters.editDraft('1600')

  const writing = parameters.write()
  await expect.poll(() => confirmation.value?.question).toBe('Set RTL_ALT from 1500 to 1600?')
  confirmation.value?.answer(false)
  await writing

  expect(confirmation.value).toBeNull()
  expect(fields.lastWrite.value).toBeNull()
})
