import { shallowRef } from 'vue'
import { expect, it, vi } from 'vitest'
import type { BackendClient } from '@/backend/client'
import type { Connection } from '@/generated/app'
import { type RenameTable, renameTable } from '@/lib/params/renames'
import { RENAME_GROUPS } from '@/lib/params/renameTable'
import { renameSource } from './renameSource'

const TABLE = renameTable(RENAME_GROUPS)

/** A Copter, connected. */
const COPTER: Connection = { state: 'connected', vehicle: { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' } }

/**
 * A client whose `vehicle.info` answers `answer` (or fails with it).
 *
 * @param answer the details, or an error
 * @returns the client and its calls
 */
function clientWith(answer: object | Error) {
  const call = vi.fn(() => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)))

  return { client: { call } as unknown as BackendClient, call }
}

it('offers no renames until the table is loaded, then the vehicle\'s kind and firmware version with it', async () => {
  const { client, call } = clientWith({ vehicle: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA', version: '4.7.2' })
  const load = vi.fn(() => Promise.resolve(TABLE))
  const renames = renameSource({ client, connection: shallowRef(COPTER), load })

  expect(renames.now()).toBeUndefined()
  await renames.ready()
  await renames.ready()

  expect(renames.now()).toEqual({ table: TABLE, family: 'copter', version: '4.7.2' })
  expect(load).toHaveBeenCalledTimes(1)
  expect(call).toHaveBeenCalledWith('vehicle.info', null, { timeoutMs: 3000 })
})

it('goes on without the version when the vehicle does not say it, or there is no vehicle', async () => {
  const failing = clientWith(new Error('timed out'))
  const connection = shallowRef<Connection>(COPTER)
  const renames = renameSource({ client: failing.client, connection, load: () => Promise.resolve(TABLE) })

  await renames.ready()
  expect(renames.now()).toEqual({ table: TABLE, family: 'copter' })

  connection.value = { state: 'disconnected' }
  const none = clientWith({ vehicle: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA', version: '4.7.2' })
  const offline = renameSource({ client: none.client, connection, load: () => Promise.resolve(TABLE) })
  await offline.ready()
  expect(offline.now()).toEqual({ table: TABLE })
  expect(none.call).not.toHaveBeenCalled()
})

it('offers no renames when the table can\'t be loaded', async () => {
  const { client } = clientWith({ vehicle: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' })
  const load = (): Promise<RenameTable> => Promise.reject(new Error('chunk missing'))
  const renames = renameSource({ client, connection: shallowRef(COPTER), load })

  await expect(renames.ready()).resolves.toBeUndefined()
  expect(renames.now()).toBeUndefined()
})

it('loads ArduPilot\'s own table by default', async () => {
  const { client } = clientWith({ vehicle: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA', version: '4.7.2' })
  const renames = renameSource({ client, connection: shallowRef(COPTER) })

  await renames.ready()
  expect(renames.now()?.table.get('RTL_ALT')?.[0]?.to).toBe('RTL_ALT_M')
})
