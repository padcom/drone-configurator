// The words about how the last parameter download came ("Parameters: 1370 · by file transfer in 0.8 s"), empty while a download
// runs and before the first. The visible line under the list and the announcement in the shell say the same text.
import { type ComputedRef, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/i18n/useFormat'
import { downloadLine } from '@/lib/params/downloadLine'
import { useConfigurator } from './useConfigurator'

/**
 * The text about the last download.
 *
 * @returns it as a ref: null when there is nothing to say
 */
export function useDownloadText(): ComputedRef<string | null> {
  const { t } = useI18n()
  const format = useFormat()
  const { fields } = useConfigurator()

  return computed(() => {
    const info = fields.list.value === 'loading' ? null : fields.downloadInfo.value

    return downloadLine(info, fields.params.value.length, t, format)
  })
}
