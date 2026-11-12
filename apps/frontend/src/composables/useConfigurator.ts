// The interface's state and actions, put together: the vehicle link, the parameters, the metadata and the snapshots
// (each a composable that talks to the backend through the client), the last failure, and the question the
// confirmation dialog asks. `fields` gives the components every piece of State as the ref that holds it, so a
// component that reads one field is not woken by the others (docs/frontend-state.md).
import { type ShallowRef, shallowRef, watch } from 'vue'
import { type BackendClient, type Transport, createBackendClient } from '@/backend/client'
import { draftWarning, validateDraft } from '@/lib/params/draft'
import { showNumber } from '@/lib/params/paramValue'
import { legacyLanguage, setLanguage, storageOf } from '@/i18n/i18n'
import type { State } from '@/state/state'
import type { SafetyOptions } from '@/lib/app/safety'
import { type MetadataModel, useMetadata } from './useMetadata'
import { type ParamsDeps, type ParamsModel, useParams } from './useParams'
import { toastSeverity } from '@/lib/fly/messages'
import { useToasts } from './toasts'
import { type MessagesModel, useMessages } from './useMessages'
import { type SettingsModel, useSettings } from './useSettings'
import { type SnapshotsModel, useSnapshots } from './useSnapshots'
import { type StagedModel, endsSession, useStaged } from './useStaged'
import { type Vehicle, useVehicle } from './useVehicle'
import { type FlightsModel, useFlights } from './useFlights'
import { type LogsModel, useVehicleLogs } from './useVehicleLogs'

/** One ref per field of the state, each the very ref that the composable holding it changes. */
export type Fields = { [K in keyof State]: ShallowRef<State[K]> }

/** A question waiting for the user's answer. */
export interface Confirmation {
  /** What the user is asked. */
  question: string
  /** How it is asked, when it is not the usual plain confirmation of a write (a command that needs a hold asks its own). */
  options?: SafetyOptions
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
  /** The texts the vehicle sends, for the Fly aside, the toasts and the failsafe banner. */
  messages: MessagesModel
  /** The flight logs on the vehicle: listed, downloaded, erased. */
  logs: LogsModel
  /** The flight logs on this computer: listed, opened, read, charted and reviewed. */
  flights: FlightsModel
  /** The parameter changes collected to be written together. */
  staged: StagedModel
  /** The state, field by field. */
  fields: Fields
  /** The question the confirmation dialog shows, or null. */
  confirmation: ShallowRef<Confirmation | null>
  /** Asks the user a question that has its own options (a hold, for a command that must not be one click). */
  confirmWith: (options: SafetyOptions) => Promise<boolean>
}

/**
 * Asks the user through the confirmation ref; the promise settles when the dialog answers.
 *
 * @param confirmation the ref the dialog shows
 * @param question what to ask
 * @param options how to ask it, when not as the usual plain confirmation
 * @returns whether the user said yes
 */
function ask(confirmation: ShallowRef<Confirmation | null>, question: string, options?: SafetyOptions): Promise<boolean> {
  // One question at a time: a second one (a double click on Write) replaces the first, which is answered no, not left hanging.
  confirmation.value?.answer(false)

  return new Promise(resolve => {
    const answer = (yes: boolean) => {
      confirmation.value = null
      resolve(yes)
    }
    confirmation.value = { question, options, answer }
  })
}

/** The composables that hold the state. */
type Models = Pick<
  ConfiguratorHandle,
  'vehicle' | 'parameters' | 'metadata' | 'snapshots' | 'settings' | 'messages' | 'logs' | 'flights' | 'staged'
>

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
    downloadInfo: parameters.downloadInfo,
    downloadEnded: parameters.downloadEnded,
    filter: parameters.filter,
    initial: parameters.initial,
    selected: parameters.selected,
    draft: parameters.draft,
    draftError: parameters.draftError,
    draftWarning: parameters.draftWarning,
    metadata: metadata.metadata,
    metadataError: metadata.error,
    metadataLoads: metadata.loads,
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
 * What the parameters forget when a session ends. The initial values are the vehicle's too: another one has its own, from its
 * own first download. A download that waited for a write is for the session that ended: it is not made when nobody is connected
 * (when the next vehicle comes up, its own download is the one that waits, and stays).
 *
 * @param parameters the parameters
 * @param disconnected whether the link is ended (and not another vehicle connected)
 */
function sessionEnded(parameters: ParamsModel, disconnected: boolean): void {
  parameters.clearInitial()

  if (disconnected) {
    parameters.cancelDeferred()
  }
}

/**
 * The staged changes, written while a vehicle is connected.
 *
 * @param client the link to the backend
 * @param parameters the parameters
 * @param vehicle the vehicle link
 * @param confirm asks the user to confirm the writes
 * @returns the staged changes
 */
function stagedFor(
  client: BackendClient,
  parameters: ParamsModel,
  vehicle: Vehicle,
  confirm: (question: string) => Promise<boolean>,
): StagedModel {
  const staged = useStaged({ client, parameters, isConnected: () => vehicle.connection.value.state === 'connected', confirm })
  // What was staged is for the vehicle it was staged on: not for the next one, which may have parameters of the same names.
  watch(vehicle.connection, (next, before) => {
    if (endsSession(next, before)) {
      staged.reset()
      sessionEnded(parameters, next.state === 'disconnected')
    }
  })
  // A download, or another ground station, may give a parameter the value that is queued for it: nothing is left to write then.
  watch(parameters.params, () => staged.dropMatching())
  // Selecting a parameter that has a change queued shows the value queued for it (what will be written), not the vehicle's.
  watch(parameters.selected, id => {
    const queued = staged.changes.value.find(change => change.id === id)
    if (queued) {
      parameters.editDraft(showNumber(queued.to))
    }
  })

  return staged
}

/**
 * The messages, started when a vehicle is connected. What the vehicle says new that is a warning or worse is a toast (what
 * was said before, and is replayed into the list, is not).
 *
 * @param client the link to the backend
 * @param vehicle the vehicle link
 * @returns the messages
 */
function startMessages(client: BackendClient, vehicle: Vehicle): MessagesModel {
  const messages = useMessages({
    client,
    announce: message => {
      const severity = toastSeverity(message)
      if (severity) {
        useToasts().push({ severity, text: message.text })
      }
    },
  })
  vehicle.onSession(connected => {
    if (connected) {
      messages.start()
    }
  })
  // Disconnected (not just lost or being brought back): nobody is listening, and a failsafe is not the next vehicle's.
  watch(vehicle.connection, ({ state }) => {
    if (state === 'disconnected') {
      messages.stop()
    }
  })

  return messages
}

/**
 * The vehicle's logs. They are the vehicle's: another vehicle, or none, has its own. So they go when the session ends, and with
 * every connected report that is not the same vehicle coming back (`resumed`), also one that follows another with no gap.
 *
 * @param client the link to the backend
 * @param vehicle the vehicle link
 * @param parametersLoading whether the parameter list is being downloaded (the list of logs waits for it)
 * @returns the logs
 */
function startLogs(client: BackendClient, vehicle: Vehicle, parametersLoading: () => boolean): LogsModel {
  const logs = useVehicleLogs({
    client,
    connection: vehicle.connection,
    telemetry: vehicle.telemetry,
    parametersLoading,
  })
  watch(vehicle.connection, next => {
    if (next.state !== 'connected' || next.resumed !== true) {
      logs.reset()
    }
  })

  return logs
}

/**
 * What the parameters ask about a draft: whether it is a value at all (an error) and what the loaded metadata finds unusual
 * about it (a warning, which does not stop a write).
 *
 * @param metadata the metadata
 * @returns the two checks
 */
function draftChecks(metadata: ReturnType<typeof useMetadata>): Pick<ParamsDeps, 'problemWith' | 'warningWith'> {
  return {
    problemWith: validateDraft,
    warningWith: (param, text) => draftWarning(metadata.metadata.value, param, text),
  }
}

/**
 * Starts following what the backend says: its state, a parameter the vehicle announces, and the vehicle itself.
 *
 * @param client the link to the backend
 * @param vehicle the vehicle link
 * @param parameters the parameters
 */
function listen(client: BackendClient, vehicle: Vehicle, parameters: ParamsModel): void {
  client.onState(state => vehicle.backendChanged(state))
  client.onEvent('params.changed', param => parameters.announced(param))
  void vehicle.watch()
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
  const fail = (message: string | null) => void (error.value = message)
  const askUser = confirm ?? ((question: string) => ask(confirmation, question))
  const metadata = useMetadata({ client })
  const settings = startSettings(client)
  const vehicle = useVehicle({ client, fail })
  const parameters = useParams({ client, fail, ...draftChecks(metadata) })
  const snapshots = useSnapshots({ client, fail, confirm: askUser, parameters, connection: vehicle.connection })
  // A vehicle that has just been connected has its parameters downloaded.
  // A link that came back to the same vehicle (`resumed`) has them downloaded again too, but that does not replace the initial
  // values: only the user's Download does, and a connection to another vehicle.
  vehicle.onSession(connected => connected && void parameters.refresh({ keepInitial: vehicle.connection.value.resumed === true }))
  const messages = startMessages(client, vehicle)
  const staged = stagedFor(client, parameters, vehicle, askUser)
  const logs = startLogs(client, vehicle, () => parameters.list.value === 'loading')
  listen(client, vehicle, parameters)
  // What the metadata finds unusual about the draft follows the metadata, whenever it is loaded or replaced.
  watch(metadata.metadata, () => parameters.refreshWarning())
  const flights = useFlights({ client })
  const models = { vehicle, parameters, metadata, snapshots, settings, messages, logs, flights, staged }
  const confirmWith = (options: SafetyOptions) => (confirm ? confirm(options.what) : ask(confirmation, options.what, options))
  current = { ...models, fields: fieldsOf(models, error), confirmation, confirmWith }

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
