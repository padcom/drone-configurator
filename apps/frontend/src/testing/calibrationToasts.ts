// For the tests of the calibration pages: the end of a calibration is a toast that the Shell asks for, so a test that mounts
// only a page asks for it by a host, and reads it from the shared queue.
import { type Component, defineComponent, h } from 'vue'
import { type Toast, useToasts } from '@/composables/toasts'
import { useCalibrationToasts } from '@/composables/useCalibrationToasts'

/**
 * A page together with what the Shell does for it: the toast of the end of a calibration.
 *
 * @param page the page
 * @returns the component to mount
 */
export function withCalibrationToasts(page: Component): Component {
  return defineComponent({
    setup() {
      useCalibrationToasts()

      return () => h(page)
    },
  })
}

/**
 * The toast that tells how the last calibration ended.
 *
 * @returns it, or undefined when there is none
 */
export function endToast(): Toast | undefined {
  return useToasts().visible.value.find(toast => toast.id === 'calibration-result')
}

/** Takes every toast away (the queue is shared by the tests of a file). */
export function clearToasts(): void {
  for (const toast of [...useToasts().visible.value]) {
    useToasts().dismiss(toast.key)
  }
}
