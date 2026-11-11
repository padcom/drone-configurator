// The words about how a parameter download came ("Parameters: 1370 · by file transfer in 0.8 s"), empty while a download runs and
// before the first. The visible line under the list says it of the last list that came (`last`); the announcement in the shell
// says it of the download that has just ended (`ended`), so that a cancelled or failed download is not announced with the words
// of an earlier one.
import { type ComputedRef, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/i18n/useFormat'
import { downloadLine } from '@/lib/params/downloadLine'
import { useConfigurator } from './useConfigurator'

/**
 * The text about a download.
 *
 * @param which `last`: the last list that came; `ended`: the download that has just ended
 * @returns it as a ref: null when there is nothing to say
 */
export function useDownloadText(which: 'last' | 'ended' = 'last'): ComputedRef<string | null> {
  const { t } = useI18n()
  const format = useFormat()
  const { fields } = useConfigurator()

  return computed(() => {
    const info = which === 'ended' ? fields.downloadEnded.value : fields.downloadInfo.value

    return downloadLine(fields.list.value === 'loading' ? null : info, fields.params.value.length, t, format)
  })
}
