// How a calibration ended is a toast (whichever page started it, and even after the page was left), not a banner that stays in
// the page. Only the toast of the last calibration is there: a new end takes the one before it away, and so does the start of
// the next calibration (its result is gone).
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToasts } from '@/composables/toasts'
import { useConfigurator } from '@/composables/useConfigurator'
import { calibrationToast } from '@/lib/setup/calibrationToast'

/** Tells the end of every calibration, for as long as the component that asks is there. */
export function useCalibrationToasts(): void {
  const { t } = useI18n()
  const { calibration } = useConfigurator()
  /** The key of the toast of the last calibration. */
  let previous: number | null = null

  watch(calibration.result, result => {
    const toasts = useToasts()
    if (previous !== null) {
      toasts.dismiss(previous)
      previous = null
    }
    if (result) {
      previous = toasts.push(calibrationToast(result, (key, fallback) => fallback === undefined ? t(key) : t(key, fallback)))
    }
  })
}
