// How a metadata file went is a toast (the toast host announces it: politely for a success and a warning, at once for an error),
// not a line of text that stays in the page: why it was not loaded, or how many parameters it describes. Only the toast of the
// last file is there: a result that is told takes the one before it away (an error stays until it is dismissed, and would
// otherwise be left on the screen beside the success of the file that was loaded after it).
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { metadataToast } from './paramEditor'
import type { Translate } from '@/lib/fly/telemetryCards'
import { type ToastInput, useToasts } from '@/composables/toasts'
import { type Fields, useConfigurator } from '@/composables/useConfigurator'

/**
 * What to tell of the file that was just tried.
 *
 * @param fields the state
 * @param translate looks up a message
 * @returns the toast, or null when there is nothing to tell
 */
function resultOf(fields: Fields, translate: Translate): ToastInput | null {
  if (fields.metadataError.value) {
    return { severity: 'error', text: fields.metadataError.value, sticky: true }
  }
  const matches = fields.params.value.map(param => fields.metadata.value.get(param.id)).filter(meta => meta !== undefined)
  const toast = metadataToast({
    matched: matches.length,
    described: matches.filter(meta => meta.description !== undefined).length,
    total: fields.params.value.length,
    known: fields.metadata.value.size,
  }, translate)

  // A file that matched nothing is an error that stays until it is dismissed; a partial match is read for as long as one.
  return toast && { ...toast, sticky: toast.severity === 'error', long: toast.severity === 'warning' }
}

/** Tells the result of every metadata file that is tried, for as long as the component that asks is there. */
export function useMetadataToasts(): void {
  const { t } = useI18n()
  const { fields } = useConfigurator()
  /** The key of the toast of the last file. */
  let previous: number | null = null

  watch(fields.metadataLoads, () => {
    const toasts = useToasts()
    const result = resultOf(fields, t)
    if (previous !== null) {
      toasts.dismiss(previous)
      previous = null
    }
    if (result) {
      previous = toasts.push(result)
    }
  })
}
