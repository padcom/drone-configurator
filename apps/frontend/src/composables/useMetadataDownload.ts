// The parameter metadata of a vehicle that has just been connected is downloaded (#35): from ArduPilot's server for its kind and
// firmware version, or from this computer's cache, by the backend. Not when the user turned it off in Settings, not when a file
// the user loaded is in use (that is their choice), and not for a link that came back to the same vehicle (what is in use is
// its). A download that gives nothing says nothing: the parameters are shown without descriptions, as they are without metadata,
// and the line in Settings says why. A download that gives the latest file instead of the version's says so, once, when it comes
// from the server.
import { say } from '@/i18n/say'
import { METADATA_DOWNLOAD_KEY, downloadOn } from '@/lib/params/metadataSettings'
import type { DownloadedMetadata, MetadataModel } from './useMetadata'
import type { SettingsModel } from './useSettings'
import { type Toasts, useToasts } from './toasts'
import type { Vehicle } from './useVehicle'

/** The id of the toast that says the latest file is used. */
const LATEST_TOAST = 'metadata-latest'

/** What the download at connection needs. */
export interface MetadataDownloadDeps {
  /** The vehicle link (its sessions, and whether a connection is the same vehicle coming back). */
  vehicle: Vehicle
  /** The metadata. */
  metadata: MetadataModel
  /** The settings (the switch). */
  settings: SettingsModel
  /** The toasts (the application's unless a test gives its own). */
  toasts?: Toasts
}

/**
 * What to say when the latest file is used.
 *
 * @param got what was downloaded
 * @returns the text
 */
function latestText(got: DownloadedMetadata): string {
  const vehicle = say(`settings.metadata.vehicle.${got.vehicle}`)

  return got.version === undefined
    ? say('notice.metadataLatest', { vehicle })
    : say('notice.metadataLatestFor', { vehicle, version: got.version })
}

/**
 * Says that the latest file is used, when it came from the server just now and is not the version's.
 *
 * @param got what was downloaded, or null
 * @param toasts where to say it
 */
function tellLatest(got: DownloadedMetadata | null, toasts: Toasts): void {
  if (got?.exact === false && !got.fromCache) {
    toasts.push({ id: LATEST_TOAST, severity: 'warning', text: latestText(got), long: true })
  }
}

/**
 * Whether the metadata of a vehicle that was connected is to be downloaded.
 *
 * @param deps the metadata and the settings
 * @returns true unless the switch is off or a file the user loaded is in use
 */
function wanted(deps: MetadataDownloadDeps): boolean {
  return downloadOn(deps.settings.uiValue(METADATA_DOWNLOAD_KEY)) && deps.metadata.source.value !== 'file'
}

/**
 * Downloads the connected vehicle's metadata, when it is wanted.
 *
 * @param deps the metadata, the settings and the toasts
 */
async function downloadNow(deps: MetadataDownloadDeps): Promise<void> {
  if (wanted(deps)) {
    tellLatest(await deps.metadata.download(), deps.toasts ?? useToasts())
  }
}

/**
 * Downloads the metadata of every vehicle that is connected (not of one that came back).
 *
 * @param deps the vehicle, the metadata, the settings
 */
export function startMetadataDownload(deps: MetadataDownloadDeps): void {
  deps.vehicle.onSession(connected => {
    if (connected && deps.vehicle.connection.value.resumed !== true) {
      void downloadNow(deps)
    }
  })
}

/**
 * Downloads the connected vehicle's metadata again from the server (the Settings button), and says why when it cannot: what is in
 * use stays.
 *
 * @param metadata the metadata
 * @param toasts where to say it (the application's unless a test gives its own)
 */
export async function refreshMetadata(metadata: MetadataModel, toasts?: Toasts): Promise<void> {
  const shown = toasts ?? useToasts()
  const got = await metadata.download({ refresh: true })
  if (got) {
    tellLatest(got, shown)
  } else {
    const error = metadata.downloadError.value ?? ''
    shown.push({ id: 'metadata-refresh', severity: 'error', text: say('notice.metadataRefresh', { error }), sticky: true })
  }
}
