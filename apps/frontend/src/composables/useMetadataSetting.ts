// The settings "Metadata file", "Load the parameter metadata when the application starts" and "Download the parameter metadata
// for the connected vehicle": the Settings screen is the only place that changes them (loading a file by hand keeps its path
// too). With the load at start off nothing is loaded at start, and the path is kept. The line under them says where the metadata
// in use came from, and its button downloads the connected vehicle's again from ArduPilot's server.
import { type ComputedRef, computed } from 'vue'
import { say } from '@/i18n/say'
import { useFormat } from '@/i18n/useFormat'
import { metadataStatus } from '@/lib/params/metadataStatus'
import {
  METADATA_AUTOLOAD_KEY, METADATA_DOWNLOAD_KEY, METADATA_PATH_KEY, autoloadOn, downloadOn,
} from '@/lib/params/metadataSettings'
import { useConfigurator } from './useConfigurator'
import { refreshMetadata } from './useMetadataDownload'

/** The settings, as refs and actions. */
export interface MetadataSetting {
  /** The path of the metadata file as it was written or chosen ('' when there is none). */
  path: ComputedRef<string>
  /** Whether the file is loaded when the application starts. */
  autoload: ComputedRef<boolean>
  /** Keeps a path the user wrote (an empty text forgets it). */
  choosePath: (text: string) => Promise<void>
  /** Keeps the choice of loading at start. */
  chooseAutoload: (on: boolean) => Promise<void>
  /** Lets the user pick the file in the host's dialog: it is loaded, and its path kept (the result is told by the toast). */
  pick: () => Promise<void>
  /** Whether the connected vehicle's metadata is downloaded when it is connected. */
  download: ComputedRef<boolean>
  /** Keeps the choice of downloading. */
  chooseDownload: (on: boolean) => Promise<void>
  /** Where the metadata in use came from, as a line. */
  status: ComputedRef<string>
  /** Whether the connected vehicle's metadata can be downloaded again now (a vehicle is connected, and no download runs). */
  canRefresh: ComputedRef<boolean>
  /** Downloads the connected vehicle's metadata again from the server. */
  refresh: () => Promise<void>
}

/**
 * The metadata file settings.
 *
 * @returns what they hold, and how to change them
 */
export function useMetadataSetting(): MetadataSetting {
  const { settings, metadata, vehicle } = useConfigurator()
  const f = useFormat()
  const state = () => ({
    source: metadata.source.value,
    downloaded: metadata.downloaded.value,
    downloadError: metadata.downloadError.value,
    downloading: metadata.downloading.value,
  })

  return {
    path: computed(() => settings.uiValue(METADATA_PATH_KEY) ?? ''),
    autoload: computed(() => autoloadOn(settings.uiValue(METADATA_AUTOLOAD_KEY))),
    choosePath: text => settings.setUi(METADATA_PATH_KEY, text.trim()),
    chooseAutoload: on => settings.setUi(METADATA_AUTOLOAD_KEY, on ? 'on' : 'off'),
    pick: () => metadata.openFile(),
    download: computed(() => downloadOn(settings.uiValue(METADATA_DOWNLOAD_KEY))),
    chooseDownload: on => settings.setUi(METADATA_DOWNLOAD_KEY, on ? 'on' : 'off'),
    status: computed(() => metadataStatus(state(), say, f)),
    canRefresh: computed(() => vehicle.connection.value.state === 'connected' && !metadata.downloading.value),
    refresh: () => refreshMetadata(metadata),
  }
}
