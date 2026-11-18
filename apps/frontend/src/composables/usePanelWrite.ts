// What a page that writes parameters says about writing: why nothing can be written now, how the last write went in words, and
// whether the Write button is on. The Setup pages' aside and the Tune pages' fixed parts say the same, from one place.
import { type ComputedRef, type MaybeRefOrGetter, computed, toValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { outcomeLines } from '@/lib/setup/outcome'
import type { ParamPanel } from './useParamPanel'

/** What a page says about writing. */
export interface PanelWrite {
  /** Why nothing can be written now, in words (empty when it can). */
  readonly reason: ComputedRef<string>
  /** Whether there is a change to write. */
  readonly changed: ComputedRef<boolean>
  /** Whether the Write button is on. */
  readonly writable: ComputedRef<boolean>
  /** The words of the Write button: how many changes, or that there are none. */
  readonly label: ComputedRef<string>
  /** How the last write went, in words (empty before the first, and for a write that is in flight). */
  readonly status: ComputedRef<string>
  /** The lines of a write that stopped (nothing when it went through whole, or none was made). */
  readonly outcome: ComputedRef<string[]>
}

/**
 * What a page that writes some parameters says about writing them.
 *
 * @param source the page's parameters (a getter: a page's props may change)
 * @param hold whether the page has a reason of its own not to write (a pair of values out of order)
 * @returns the words and the state of the Write button
 */
export function usePanelWrite(source: () => ParamPanel, hold?: MaybeRefOrGetter<boolean | undefined>): PanelWrite {
  const { t } = useI18n()
  const reason = computed(() => {
    const { blocked } = source()

    return blocked.value === null ? '' : t(`setup.blocked.${blocked.value}`)
  })
  const changed = computed(() => source().dirty.value.length > 0)
  const writable = computed(() => (
    source().blocked.value === null && changed.value && !source().writing.value && !toValue(hold)
  ))
  const label = computed(() => t(changed.value ? 'setup.write' : 'setup.noChanges'))
  const outcome = computed(() => outcomeLines(source().outcome.value, (part, names) => t(`setup.outcome.${part}`, { names })))
  const status = computed(() => {
    const { state, detail } = source()

    if (state.value === 'written') {
      return t('setup.written')
    }

    return state.value === 'failed' ? t('setup.failed', { why: detail.value }) : ''
  })

  return { reason, changed, writable, label, status, outcome }
}
