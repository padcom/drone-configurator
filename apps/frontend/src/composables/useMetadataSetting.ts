// The settings "Metadata file" and "Load the parameter metadata when the application starts": the Settings screen is the only
// place that changes them (loading a file by hand keeps its path too). With the switch off nothing is loaded at start, and the
// path is kept.
import { type ComputedRef, computed } from 'vue'
import { METADATA_AUTOLOAD_KEY, METADATA_PATH_KEY, autoloadOn } from '@/lib/params/metadataSettings'
import { useConfigurator } from './useConfigurator'

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
}

/**
 * The metadata file settings.
 *
 * @returns what they hold, and how to change them
 */
export function useMetadataSetting(): MetadataSetting {
  const { settings, metadata } = useConfigurator()

  return {
    path: computed(() => settings.uiValue(METADATA_PATH_KEY) ?? ''),
    autoload: computed(() => autoloadOn(settings.uiValue(METADATA_AUTOLOAD_KEY))),
    choosePath: text => settings.setUi(METADATA_PATH_KEY, text.trim()),
    chooseAutoload: on => settings.setUi(METADATA_AUTOLOAD_KEY, on ? 'on' : 'off'),
    pick: () => metadata.openFile(),
  }
}
