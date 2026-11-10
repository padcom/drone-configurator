// What the metadata finds unusual about the draft follows the metadata: loading or replacing a file changes it at once, and
// "Add to changes" and the question to write read it as it is then.
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { METADATA_FORMAT } from './metadata'
import { mockBackend } from './mock-backend'
import { createConfigurator } from './useConfigurator'

const metadataWith = (min: number) => JSON.stringify({
  format: METADATA_FORMAT,
  version: 1,
  params: { RTL_ALT: { min, units: 'cm' } },
})

/**
 * A Configurator on the mock vehicle, connected, with RTL_ALT selected and 10 typed for it.
 *
 * @returns the handle and the questions asked
 */
async function typed() {
  const questions: string[] = []
  const handle = createConfigurator(mockBackend({ telemetryMs: 5 }), (question: string) => {
    questions.push(question)

    return Promise.resolve(true)
  })
  await handle.vehicle.connect({ transport: 'simulator' })
  await sleep(20)
  handle.parameters.select('RTL_ALT')
  handle.parameters.editDraft('10')

  return { handle, questions }
}

it('appears when metadata is loaded after the value was typed, and goes when the metadata is replaced', async () => {
  const { handle } = await typed()
  expect(handle.parameters.draftWarning.value).toBeNull()

  handle.metadata.load(metadataWith(200))
  await sleep(0)
  expect(handle.parameters.draftWarning.value).toBe('Outside the usual range 200–… cm')

  handle.metadata.load(metadataWith(5))
  await sleep(0)
  expect(handle.parameters.draftWarning.value).toBeNull()
})

it('is kept by "Add to changes" and said in the question, however late the metadata came', async () => {
  const { handle, questions } = await typed()
  handle.metadata.load(metadataWith(200))
  handle.staged.sync()

  expect(handle.staged.changes.value[0]?.warning).toBe('Outside the usual range 200–… cm')

  await handle.staged.writeAll()

  expect(questions).toEqual(['Write 1 parameter to the vehicle (RTL_ALT)? RTL_ALT: Outside the usual range 200–… cm.'])
})

it('is not kept by "Add to changes" when the metadata that had it was replaced meanwhile', async () => {
  const { handle } = await typed()
  handle.metadata.load(metadataWith(200))
  await sleep(0)
  handle.metadata.load(metadataWith(5))
  handle.staged.sync()

  expect(handle.staged.changes.value[0]?.warning).toBeUndefined()
})
