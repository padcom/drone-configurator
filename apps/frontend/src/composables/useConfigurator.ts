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
import { type SnapshotsDeps, type SnapshotsModel, useSnapshots } from './useSnapshots'
import { type StagedModel, endsSession, useStaged } from './useStaged'
import { type Vehicle, useVehicle } from './useVehicle'
import { armedOf } from '@/lib/app/armed'
import { type FlightsModel, useFlights } from './useFlights'
import { type BrowserModel, useLogBrowser } from './useLogBrowser'
import { type SpectrumModel, useSpectrum } from './useSpectrum'
import { type LogsModel, useVehicleLogs } from './useVehicleLogs'
import { type HousekeepingModel, useHousekeeping } from './useHousekeeping'
import { useAutoDownload } from './useAutoDownload'
import { RETENTION_KEY, SIZE_CAP_KEY, logsPrefsOf } from '@/lib/logs/logsPrefs'
import { type Removal, useHousekeepingGuard } from './useHousekeepingGuard'

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
  /** The removal of old downloaded logs by the user's preferences. */
  housekeeping: HousekeepingModel
  /** The flight logs on this computer: listed, opened, read, charted and reviewed. */
  flights: FlightsModel
  /** The message browser and the export of the open flight log. */
  browser: BrowserModel
  /** The raw IMU batches of a flight log and their spectrum. */
  spectrum: SpectrumModel
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
  'vehicle' | 'parameters' | 'metadata' | 'snapshots' | 'settings' | 'messages' | 'logs' | 'housekeeping' | 'flights' | 'browser'
  | 'spectrum' | 'staged'
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
  const staged = useStaged({
    client,
    parameters,
    isConnected: () => vehicle.connection.value.state === 'connected',
    confirm,
    mayBeArmed: () => armedOf(vehicle.telemetry.value) !== false,
  })
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

/** What the logs are started with. */
interface LogsStart {
  /** The link to the backend. */
  client: BackendClient
  /** The vehicle link. */
  vehicle: Vehicle
  /** The settings (the preferences about logs are in them). */
  settings: SettingsModel
  /** The parameters (the list of logs waits while their list is being downloaded). */
  parameters: ParamsModel
  /** Asks the user a question (a removal that a changed setting would make is asked about first). */
  confirm: (question: string) => Promise<boolean>
}

/**
 * Puts the two preferences that remove something back to a choice (the user said no to what the change would remove).
 *
 * @param settings the settings
 * @param to the choice
 */
async function restoreRemoval(settings: SettingsModel, to: Removal): Promise<void> {
  await settings.setUi(RETENTION_KEY, String(to.retentionDays))
  await settings.setUi(SIZE_CAP_KEY, String(to.sizeCapMb))
}

/**
 * The vehicle's logs. They are the vehicle's: another vehicle, or none, has its own. So they go when the session ends, and with
 * every connected report that is not the same vehicle coming back (`resumed`), also one that follows another with no gap.
 *
 * @param deps the link, the vehicle, the settings and the way to ask the user
 * @returns the logs and their housekeeping
 */
function startLogs(deps: LogsStart): Pick<ConfiguratorHandle, 'logs' | 'housekeeping'> {
  const { client, vehicle, settings } = deps
  const logs = useVehicleLogs({
    client,
    connection: vehicle.connection,
    telemetry: vehicle.telemetry,
    parametersLoading: () => deps.parameters.list.value === 'loading',
  })
  watch(vehicle.connection, next => {
    if (next.state !== 'connected' || next.resumed !== true) {
      logs.reset()
    }
  })
  const tell = useToasts().push
  const prefs = () => logsPrefsOf(key => settings.uiValue(key))
  const housekeeping = useHousekeeping({ client, prefs, tell })
  // Old copies are looked at when the settings have been read, and after every download (which may have filled the disk).
  const guard = useHousekeepingGuard({ housekeeping, prefs, confirm: deps.confirm, restore: to => restoreRemoval(settings, to) })
  watch(settings.loaded, loaded => loaded && (guard.begin(), void housekeeping.run()), { immediate: true })
  // A change of what to remove removes nothing by itself: it is asked about first (see the guard).
  watch(() => `${prefs().retentionDays}/${prefs().sizeCapMb}`, () => settings.loaded.value && guard.changed())
  watch(logs.outcome, outcome => outcome?.kind === 'downloaded' && void housekeeping.run())
  const { connection, telemetry } = vehicle
  useAutoDownload({ logs, connection, telemetry, enabled: () => prefs().autoDownload, tell })

  return { logs, housekeeping }
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
 * Whether the vehicle is armed or may be: unknown (no telemetry, or no recent heartbeat) counts as armed.
 *
 * @param vehicle the vehicle link
 * @returns true if it may be armed
 */
function mayBeArmed(vehicle: Vehicle): boolean {
  return armedOf(vehicle.telemetry.value) !== false
}

/**
 * The models of the logs on this computer: the Flights view, the message browser and the Spectrum.
 *
 * @param client the link to the backend
 * @param confirm asks the user (a file larger than 500 MB is not imported before the user says yes)
 * @returns the three models
 */
function logModels(
  client: BackendClient,
  confirm: (question: string) => Promise<boolean>,
): Pick<ConfiguratorHandle, 'flights' | 'browser' | 'spectrum'> {
  return { flights: useFlights({ client, confirm }), browser: useLogBrowser({ client }), spectrum: useSpectrum({ client }) }
}

/**
 * The snapshots: the parameters are written from them one after the other, and not a logging or notch parameter while the
 * vehicle may be armed.
 *
 * @param deps the link to the backend, how a failure is recorded, the questions, and the parameters
 * @param vehicle the vehicle link
 * @returns the snapshots
 */
function snapshotsFor(deps: Pick<SnapshotsDeps, 'client' | 'fail' | 'confirm' | 'parameters'>, vehicle: Vehicle): SnapshotsModel {
  const { connection } = vehicle

  return useSnapshots({ ...deps, connection, mayBeArmed: () => mayBeArmed(vehicle) })
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
  const snapshots = snapshotsFor({ client, fail, confirm: askUser, parameters }, vehicle)
  // A vehicle that has just been connected has its parameters downloaded.
  // A link that came back to the same vehicle (`resumed`) has them downloaded again too, but that does not replace the initial
  // values: only the user's Download does, and a connection to another vehicle.
  vehicle.onSession(connected => connected && void parameters.refresh({ keepInitial: vehicle.connection.value.resumed === true }))
  const messages = startMessages(client, vehicle)
  const staged = stagedFor(client, parameters, vehicle, askUser)
  const { logs, housekeeping } = startLogs({ client, vehicle, settings, parameters, confirm: askUser })
  listen(client, vehicle, parameters)
  // What the metadata finds unusual about the draft follows the metadata, whenever it is loaded or replaced.
  watch(metadata.metadata, () => parameters.refreshWarning())
  const models = {
    vehicle, parameters, metadata, snapshots, settings, messages, logs, housekeeping, ...logModels(client, askUser), staged,
  }
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
