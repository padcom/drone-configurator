// What decides whether a name in a parameter file or a snapshot is one the vehicle's firmware renamed (#202): ArduPilot's table
// of renames (a chunk of its own, loaded the first time a file is opened), the kind of vehicle the connection reports, and the
// firmware version the vehicle says in AUTOPILOT_VERSION (the backend's `vehicle.info`, as the Setup pages read it). The
// vehicle's own parameter names decide the rest: a rename applies only when it has the new name and not the old one.
import type { ShallowRef } from 'vue'
import type { BackendClient } from '@/backend/client'
import type { Connection } from '@/generated/app'
import { type RenameContext, type RenameTable, familyOf, loadRenames, renameContext } from '@/lib/params/renames'

/** The renames, as a review asks for them. */
export interface RenameSource {
  /** The table and what the vehicle is, once `ready` has loaded the table; undefined before (no rename is offered then). */
  now: () => RenameContext | undefined
  /** Loads the table, if it isn't yet, and asks the vehicle for its firmware version. Never fails: without them, no renames. */
  ready: () => Promise<void>
}

/** What the renames need from the rest of the interface. */
export interface RenameSourceDeps {
  /** The link to the backend, which asks the vehicle for its version. */
  client: BackendClient
  /** The connection: the kind of vehicle. */
  connection: ShallowRef<Connection>
  /** Loads the table (for tests; ArduPilot's own by default). */
  load?: () => Promise<RenameTable>
}

/** How long the vehicle's version is waited for before a file is reviewed without it (its names still decide). */
const VERSION_WAIT_MS = 3000

/** The renames for the connected vehicle. */
class Renames implements RenameSource {
  #table: RenameTable | undefined
  #version: string | undefined

  /**
   * Makes them.
   *
   * @param deps the client and the connection
   */
  constructor(private readonly deps: RenameSourceDeps) {}

  now(): RenameContext | undefined {
    const table = this.#table

    return table ? renameContext(table, familyOf(this.deps.connection.value.vehicle?.type), this.#version) : undefined
  }

  async ready(): Promise<void> {
    await Promise.all([this.loadTable(), this.readVersion()])
  }

  /** Loads the table, once. */
  private async loadTable(): Promise<void> {
    try {
      this.#table ??= await (this.deps.load ?? loadRenames)()
    } catch {
      this.#table = undefined
    }
  }

  /** Asks the vehicle for its firmware version: forgotten when there is no vehicle, or it does not say. */
  private async readVersion(): Promise<void> {
    this.#version = undefined

    if (this.deps.connection.value.state !== 'connected') {
      return
    }
    try {
      const details = await this.deps.client.call('vehicle.info', null, { timeoutMs: VERSION_WAIT_MS })

      this.#version = details.version
    } catch {
      this.#version = undefined
    }
  }
}

/**
 * Makes the renames for the connected vehicle.
 *
 * @param deps the client and the connection
 * @returns the renames
 */
export function renameSource(deps: RenameSourceDeps): RenameSource {
  return new Renames(deps)
}
