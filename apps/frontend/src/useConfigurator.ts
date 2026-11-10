// The interface's state and actions, put together: the vehicle link, the parameters, the metadata and the snapshots
// (each a composable that talks to the backend through the client), the last failure, and the question the
// confirmation dialog asks. `fields` gives the components every piece of State as the ref that holds it, so a
// component that reads one field is not woken by the others (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, type Transport, createBackendClient } from './backend/client'
import { draftProblem } from './draft'
import { legacyLanguage, setLanguage, storageOf } from './i18n'
import type { State } from './state'
import { type MetadataModel, useMetadata } from './useMetadata'
import { type ParamsModel, useParams } from './useParams'
import { type SettingsModel, useSettings } from './useSettings'
import { type SnapshotsModel, useSnapshots } from './useSnapshots'
import { type Vehicle, useVehicle } from './useVehicle'

/** One ref per field of the state, each the very ref that the composable holding it changes. */
export type Fields = { [K in keyof State]: ShallowRef<State[K]> }

/** A question waiting for the user's answer. */
export interface Confirmation {
  /** What the user is asked. */
  question: string
  /** Settles the pending confirmation. */
  answer: (yes: boolean) => void
}

/** What components get. */
export interface ConfiguratorHandle {
  /** The vehicle link. */
  vehicle: Vehicle
  /** The parameters. */
  parameters: ParamsModel
  /** The parameter metadata. */
  metadata: MetadataModel
  /** The snapshots and their import. */
  snapshots: SnapshotsModel
  /** The settings that survive a restart (the language, the interface's own entries). */
  settings: SettingsModel
  /** The state, field by field. */
  fields: Fields
  /** The question the confirmation dialog shows, or null. */
  confirmation: ShallowRef<Confirmation | null>
}

/**
 * Asks the user through the confirmation ref; the promise settles when the dialog answers.
 *
 * @param confirmation the ref the dialog shows
 * @param question what to ask
 * @returns whether the user said yes
 */
function ask(confirmation: ShallowRef<Confirmation | null>, question: string): Promise<boolean> {
  return new Promise(resolve => {
    const answer = (yes: boolean) => {
      confirmation.value = null
      resolve(yes)
    }
    confirmation.value = { question, answer }
  })
}

/** The composables that hold the state. */
type Models = Pick<ConfiguratorHandle, 'vehicle' | 'parameters' | 'metadata' | 'snapshots' | 'settings'>

/**
 * The state as the refs that hold it.
 *
 * @param models the composables
 * @param error the last failure
 * @returns one ref per field
 */
function fieldsOf(models: Models, error: ShallowRef<string | null>): Fields {
  const { vehicle, parameters, metadata, snapshots } = models

  return {
    connection: vehicle.connection,
    ports: vehicle.ports,
    notice: vehicle.notice,
    telemetry: vehicle.telemetry,
    params: parameters.params,
    list: parameters.list,
    missing: parameters.missing,
    filter: parameters.filter,
    selected: parameters.selected,
    draft: parameters.draft,
    draftError: parameters.draftError,
    writing: parameters.writing,
    lastWrite: parameters.lastWrite,
    metadata: metadata.metadata,
    metadataError: metadata.error,
    importReview: snapshots.importReview,
    importError: snapshots.importError,
    picked: snapshots.picked,
    applying: snapshots.applying,
    applied: snapshots.applied,
    backup: snapshots.backup,
    error,
  }
}

let current: ConfiguratorHandle | undefined

/**
 * The settings, started: they follow what the backend announces, and are read (and applied) at once.
 *
 * @param client the link to the backend
 * @returns the settings
 */
function startSettings(client: BackendClient): SettingsModel {
  const settings = useSettings({
    client,
    applyLanguage: setLanguage,
    legacy: legacyLanguage(storageOf(globalThis)),
  })
  client.onEvent('settings.changed', state => settings.changed(state))
  void settings.load()

  return settings
}

/**
 * Starts listening to the backend on `transport`, and makes the result the one components get from
 * `useConfigurator()`.
 *
 * @param transport the link to the backend (the host's bridge, or the mock)
 * @param confirm answers the questions instead of the dialog (tests give theirs)
 * @returns the handle
 */
export function createConfigurator(
  transport: Transport,
  confirm?: (question: string) => Promise<boolean>,
): ConfiguratorHandle {
  const client = createBackendClient(transport)
  const confirmation = shallowRef<Confirmation | null>(null)
  const error = shallowRef<string | null>(null)
  const fail = (message: string | null) => {
    error.value = message
  }
  const askUser = confirm ?? ((question: string) => ask(confirmation, question))
  const metadata = useMetadata({ client })
  const settings = startSettings(client)
  const vehicle = useVehicle({ client, fail })
  const parameters = useParams({
    client,
    fail,
    isConnected: () => vehicle.connection.value.state === 'connected',
    confirm: askUser,
    problemWith: (param, text) => draftProblem(metadata.metadata.value, param, text),
  })
  const snapshots = useSnapshots({ client, fail, confirm: askUser, parameters, connection: vehicle.connection })
  // A vehicle that has just been connected has its parameters downloaded; one that is gone cannot be written to.
  vehicle.onSession(connected => connected ? void parameters.refresh() : parameters.stopWriting())
  client.onState(state => vehicle.backendChanged(state))
  client.onEvent('params.changed', param => parameters.announced(param))
  void vehicle.watch()
  const models = { vehicle, parameters, metadata, snapshots, settings }
  current = { ...models, fields: fieldsOf(models, error), confirmation }

  return current
}

/**
 * The state and actions that `createConfigurator` started.
 *
 * @returns the handle
 */
export function useConfigurator(): ConfiguratorHandle {
  if (!current) {
    throw new Error('createConfigurator() has not been called')
  }

  return current
}
