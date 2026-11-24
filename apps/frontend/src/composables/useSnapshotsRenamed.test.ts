// A parameter file from an older firmware, reviewed and written (#202): the names the vehicle's firmware renamed are offered
// under the new names, converted, nothing ticked, and a ticked one is written the same way as any other, and read back.
import { expect, it, vi } from 'vitest'
import { createBackendClient } from '@/backend/client'
import { armedOf } from '@/lib/app/armed'
import { RENAME_GROUPS } from '@/lib/params/renameTable'
import { renameContext, renameTable } from '@/lib/params/renames'
import { SETUP_PARAMS } from '@/mock/fixtures'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from './useConfigurator'
import type { RenameSource } from './renameSource'
import { useSnapshots } from './useSnapshots'

/** A file saved from a Copter of 4.6: the attitude controller's limits in centidegrees, under their old names. */
const FILE_46 = 'ATC_ACCEL_R_MAX,99000\nATC_ACCEL_P_MAX,110000\n'

/**
 * The simulator as a Copter that was set up (it has ATC_ACC_R_MAX and ATC_ACC_P_MAX, in deg/s/s), connected and disarmed,
 * with its parameters downloaded, `FILE_46` in its file dialog and every question answered yes.
 *
 * @returns the composables, the backend and the questions asked
 */
async function connected() {
  const questions: string[] = []
  const control: MockControl = {}
  const opens = [{ path: 'copter-4.6.param', text: FILE_46 }]
  const backend = mockBackend({ telemetryMs: 5, control, params: SETUP_PARAMS, opens })
  const handle = createConfigurator(backend, question => {
    questions.push(question)

    return Promise.resolve(true)
  })
  control.armed?.(false)
  await handle.vehicle.connect({ transport: 'simulator' })
  const state = () => [handle.parameters.list.value, armedOf(handle.vehicle.telemetry.value)]
  await vi.waitFor(() => expect(state()).toEqual(['complete', false]))

  return { ...handle, backend, questions }
}

/**
 * The snapshots of a connected simulator with ArduPilot's renames for a Copter whose version is not known (its names decide).
 *
 * @returns the snapshots, the parameters and the questions asked
 */
async function withRenames() {
  const { backend, fields, parameters, questions } = await connected()
  const table = renameTable(RENAME_GROUPS)
  const renames: RenameSource = { now: () => renameContext(table, 'copter'), ready: () => Promise.resolve() }
  const snapshots = useSnapshots({
    client: createBackendClient(backend),
    fail: () => undefined,
    confirm: question => {
      questions.push(question)

      return Promise.resolve(true)
    },
    parameters,
    connection: fields.connection,
    mayBeArmed: () => armedOf(fields.telemetry.value) !== false,
    renames,
  })

  return { snapshots, parameters, questions }
}

it('offers the new name, converted, ticks nothing, and writes a ticked one with a read-back', async () => {
  const { snapshots, parameters, questions } = await withRenames()
  await snapshots.openFile()

  const review = snapshots.importReview.value
  expect(review?.changes).toEqual([{
    id: 'ATC_ACC_R_MAX', from: 1100, to: 990, problem: null, warning: null,
    renamed: { from: 'ATC_ACCEL_R_MAX', since: '4.7', value: 99_000, units: { from: 'cdeg/s/s', to: 'deg/s/s' } },
  }])
  expect(review?.unchanged).toBe(1)
  expect(snapshots.picked.value).toEqual([])

  snapshots.toggle('ATC_ACC_R_MAX')
  await snapshots.apply()

  expect(questions).toEqual(['Write 1 parameter to the vehicle (ATC_ACC_R_MAX)?'])
  expect(snapshots.applied.value).toEqual([{ id: 'ATC_ACC_R_MAX', outcome: 'verified', detail: '990' }])
  expect(parameters.params.value.find(param => param.id === 'ATC_ACC_R_MAX')?.value).toBe(990)
})

it('does not rename for a firmware older than the rename: the simulator says it is 4.6.2', async () => {
  const { snapshots } = await connected()

  await snapshots.openFile()

  expect(snapshots.importReview.value?.changes.map(change => [change.id, change.problem])).toEqual([
    ['ATC_ACCEL_R_MAX', 'not on this vehicle'],
    ['ATC_ACCEL_P_MAX', 'not on this vehicle'],
  ])
})
