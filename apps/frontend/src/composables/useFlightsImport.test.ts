// Importing a recording in the Flights model: the backend copies it and the model opens the entry; the same content again is the
// entry that is there; a closed dialog does nothing; a stopped import adds nothing and is not an error; a failure is shown; a
// second import while one runs is ignored (the backend does one read at a time).
import { expect, it, vi } from 'vitest'
import { BackendError, type BackendClient } from '@/backend/client'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from './useConfigurator'
import { useFlights } from './useFlights'

/**
 * A model over the mock.
 *
 * @returns the Flights model
 */
function model() {
  return createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs: 2 })).flights
}

/**
 * A model over a client whose `logs.import` answers (or fails) as given; everything else is an empty library.
 *
 * @param importer what `logs.import` does
 * @returns the model and the calls the client got
 */
function over(importer: () => Promise<unknown>) {
  const calls: string[] = []
  const client = {
    onEvent: () => () => undefined,
    call: (name: string) => {
      calls.push(name)

      return name === 'logs.import' ? importer() : Promise.resolve({ logs: [], truncated: false })
    },
  } as unknown as BackendClient

  return { flights: useFlights({ client, confirm: () => Promise.resolve(true) }), calls }
}

it('imports a recording, lists it and opens it', async () => {
  const flights = model()
  await flights.importFile()

  expect(flights.imported.value).toEqual({ key: 'imported/00000000-5eed5eed.tlog', name: 'flight.tlog', duplicate: false })
  expect(flights.open.value).toBe('imported/00000000-5eed5eed.tlog')
  expect(flights.phase.value).toBe('ready')
  expect(flights.summary.value).toMatchObject({ verified: true, report: { records: 5230, cutEnd: true } })
  expect(flights.logs.value.find(log => log.source === 'tlog')).toBeDefined()
  expect(flights.importing.value).toBe(false)
  expect(flights.error.value).toBeNull()
})

it('has no review for a finding a recording cannot support: no data, not a pass', async () => {
  const flights = model()
  await flights.importFile()

  const levels = Object.fromEntries((flights.review.value ?? []).map(f => [f.id, f.level]))
  expect(levels['ekf.variance']).toBe('no-data')
  expect(levels['errors.logged']).toBe('no-data')
  expect(levels['vibration.x']).toBe('ok')
})

it('opens the entry that is there when the same content is imported again', async () => {
  const flights = model()
  await flights.importFile()
  await flights.importFile()

  expect(flights.imported.value?.duplicate).toBe(true)
  expect(flights.logs.value.filter(log => log.source === 'tlog')).toHaveLength(1)
})

it('does nothing when the user closes the dialog', async () => {
  const { flights, calls } = over(() => Promise.resolve({ cancelled: true, duplicate: false }))
  await flights.importFile()

  expect(calls).toEqual(['logs.import'])
  expect(flights.imported.value).toBeNull()
  expect(flights.open.value).toBeNull()
  expect(flights.error.value).toBeNull()
  expect(flights.importing.value).toBe(false)
})

it('takes a stopped import for what it is: nothing added, no error', async () => {
  const { flights } = over(() => Promise.reject(new BackendError('ABORTED', 'the import was stopped')))
  await flights.importFile()

  expect(flights.importStopped.value).toBe(true)
  expect(flights.error.value).toBeNull()
  expect(flights.imported.value).toBeNull()
  expect(flights.importing.value).toBe(false)
})

it('shows why an import failed', async () => {
  const { flights } = over(() => Promise.reject(new BackendError('BAD_REQUEST', 'there is no MAVLink record in that file')))
  await flights.importFile()

  expect(flights.error.value).toContain('no MAVLink record')
  expect(flights.importStopped.value).toBe(false)
  expect(flights.open.value).toBeNull()
})

it('ignores an import asked for while one runs', async () => {
  let release: (answer: unknown) => void = () => undefined
  const { flights, calls } = over(() => new Promise(resolve => {
    release = resolve
  }))
  const first = flights.importFile()
  await vi.waitFor(() => expect(flights.importing.value).toBe(true))
  await flights.importFile()
  release({ cancelled: true, duplicate: false })
  await first

  expect(calls.filter(call => call === 'logs.import')).toHaveLength(1)
})

/**
 * A model whose backend offers a large file first, and answers a `confirmLarge` with an entry.
 *
 * @param yes what the user answers to the question
 * @returns the model, the asks `logs.import` got, and the questions asked
 */
function overLarge(yes: boolean) {
  const asks: unknown[] = []
  const questions: string[] = []
  const client = {
    onEvent: () => () => undefined,
    call: (name: string, ask?: { confirmLarge?: boolean }) => {
      if (name !== 'logs.import') {
        return Promise.resolve({ logs: [], truncated: false })
      }
      asks.push(ask)

      return Promise.resolve(ask?.confirmLarge === true
        ? { cancelled: false, duplicate: false, key: 'imported/00000000-aaaaaaaa.tlog', name: 'big.tlog' }
        : { cancelled: false, duplicate: false, large: true, name: 'big.tlog', size: 800_000_000 })
    },
  } as unknown as BackendClient
  const confirm = (question: string) => {
    questions.push(question)

    return Promise.resolve(yes)
  }

  return { flights: useFlights({ client, confirm }), asks, questions }
}

it('asks before a file over 500 MB is copied, with its name and size, and goes on only on a yes', async () => {
  const { flights, asks, questions } = overLarge(true)
  await flights.importFile()

  expect(questions).toHaveLength(1)
  expect(questions[0]).toContain('big.tlog')
  expect(questions[0]).toContain('800')
  expect(asks).toEqual([{}, { confirmLarge: true }])
  expect(flights.imported.value).toMatchObject({ key: 'imported/00000000-aaaaaaaa.tlog' })
})

it('copies nothing and says nothing more when the user says no to a large file', async () => {
  const { flights, asks } = overLarge(false)
  await flights.importFile()

  expect(asks).toEqual([{}])
  expect(flights.imported.value).toBeNull()
  expect(flights.error.value).toBeNull()
  expect(flights.importing.value).toBe(false)
})
