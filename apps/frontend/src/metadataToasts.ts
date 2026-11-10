// How a metadata file went is a toast (the toast host announces it: politely for a success and a warning, at once for an error),
// not a line of text that stays in the page: why it was not loaded, or how many parameters it describes.
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { metadataToast } from './paramEditor'
import { useToasts } from './toasts'
import { useConfigurator } from './useConfigurator'

/** Tells the result of every metadata file that is tried, for as long as the component that asks is there. */
export function useMetadataToasts(): void {
  const { t } = useI18n()
  const { fields } = useConfigurator()

  /** Tells how the file that was just tried went. */
  function tell(): void {
    const toasts = useToasts()
    if (fields.metadataError.value) {
      // No id of its own: a toast is the same event as another when its words are (the same failure twice is counted), and a
      // different result is a toast of its own.
      toasts.push({ severity: 'error', text: fields.metadataError.value, sticky: true })

      return
    }
    const matches = fields.params.value.map(param => fields.metadata.value.get(param.id)).filter(meta => meta !== undefined)
    const toast = metadataToast({
      matched: matches.length,
      described: matches.filter(meta => meta.description !== undefined).length,
      total: fields.params.value.length,
      known: fields.metadata.value.size,
    }, t)
    if (toast) {
      // A file that matched nothing is an error that stays until it is dismissed; a partial match is read for as long as one.
      toasts.push({ ...toast, sticky: toast.severity === 'error', long: toast.severity === 'warning' })
    }
  }

  watch(fields.metadataLoads, tell)
}
