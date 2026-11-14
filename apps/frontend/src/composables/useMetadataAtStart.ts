// Loads the parameter metadata file the settings name, once, when the application starts (and the settings have been read),
// if the switch is on: by the loader a file the user picked goes through. Nothing is tried again by itself: a file that is
// not there, cannot be read or is not metadata is told once, in a toast with the path and the reason, and the path stays in
// the settings (a drive may be mounted later). Nothing waits for it: the application starts either way.
import { watch } from 'vue'
import { METADATA_AUTOLOAD_KEY, METADATA_PATH_KEY, pathToLoad } from '@/lib/params/metadataSettings'
import { useToasts } from './toasts'
import { useConfigurator } from './useConfigurator'

/** Loads the stored metadata file once the settings are read; for the component that is there from the start (the shell). */
export function useMetadataAtStart(): void {
  const { settings, metadata } = useConfigurator()
  const toasts = useToasts()
  let started = false

  /** Loads what the settings name, and tells why not when it fails. */
  async function start(): Promise<void> {
    const path = pathToLoad(settings.uiValue(METADATA_PATH_KEY), settings.uiValue(METADATA_AUTOLOAD_KEY))
    const failed = path === null ? null : await metadata.loadFrom(path)

    if (failed !== null) {
      toasts.push({ id: 'metadata-at-start', severity: 'error', text: failed, sticky: true })
    }
  }

  watch(settings.loaded, loaded => {
    if (loaded && !started) {
      started = true
      void start()
    }
  }, { immediate: true })
}
