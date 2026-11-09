import { expect, it } from 'vitest'
import { watch } from 'vue'
import { mockBackend } from './mock-backend'
import { type Fields, createConfigurator, publish, useConfigurator } from './useConfigurator'
import { telemetryAt } from './fixtures'

it('assigns a field only when its reference changed', () => {
  const { app, fields } = createConfigurator(mockBackend())
  const seen: string[] = []
  for (const name of Object.keys(fields) as (keyof Fields)[]) {
    watch(fields[name], () => seen.push(name), { flush: 'sync' })
  }

  publish(fields, { ...app.state, telemetry: telemetryAt(1) })
  expect(seen.splice(0)).toEqual(['telemetry'])
  // A new state object whose fields are all the same references changes nothing.
  publish(fields, { ...app.state, telemetry: fields.telemetry.value })
  expect(seen.splice(0)).toEqual([])
  publish(fields, { ...app.state, telemetry: telemetryAt(2), filter: 'RTL' })
  expect(seen.splice(0).sort()).toEqual(['filter', 'telemetry'])
})

it('keeps the parameter list reference across telemetry ticks', async () => {
  const { app, fields } = createConfigurator(mockBackend({ telemetryMs: 20 }))
  await app.connect({ transport: 'simulator' })
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

it('resolves a confirmation with the answer and clears the question', async () => {
  const { app, confirmation } = createConfigurator(mockBackend())
  await app.connect({ transport: 'simulator' })
  await expect.poll(() => app.state.list).toBe('complete')
  app.select('RTL_ALT')
  app.editDraft('1600')

  const writing = app.write()
  await expect.poll(() => confirmation.value?.question).toBe('Set RTL_ALT from 1500 to 1600?')
  confirmation.value?.answer(false)
  await writing

  expect(confirmation.value).toBeNull()
  expect(app.state.lastWrite).toBeNull()
})
