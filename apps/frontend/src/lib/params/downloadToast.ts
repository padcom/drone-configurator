// The toast of a parameter download: one that stays while the download runs (a bar and the count, and closing it cancels the
// download), and that becomes the word of how it ended and goes after the usual time. A screen reader is told when it starts
// and how it ends (its text changes only then); the figures are for the eye (ToastHost.vue hides the bar from it).
import type { ParamsProgress } from '@/generated/app'
import { type Toasts } from '@/composables/toasts'
import { say } from '@/i18n/say'

/** The toast of one download. */
export interface DownloadToast {
  /** How far the download is. */
  progress: (progress: ParamsProgress) => void
  /** The download is over, with `count` parameters. */
  done: (count: number) => void
  /** The download was cancelled (by the user: from the toast, or another way). */
  cancelled: () => void
  /** The download failed. */
  failed: () => void
}

/** Which toast is the next one: each download has its own, so that two close together are not counted as one. */
let downloads = 0

/** The toast of a download that is under way. */
class RunningToast implements DownloadToast {
  private open = true
  private readonly key: number

  /**
   * Shows the toast.
   *
   * @param toasts the queue
   * @param onClose called when the user closes the toast while the download runs: the download is to be cancelled
   */
  constructor(private readonly toasts: Toasts, onClose: () => void) {
    downloads += 1
    this.key = toasts.push({
      id: `params.download.${downloads}`,
      severity: 'info',
      text: say('params.progress.running'),
      sticky: true,
      progress: { value: 0, max: 0 },
      onDismiss: reason => {
        this.open = false

        if (reason === 'manual') {
          onClose()
        }
      },
    })
  }

  progress(p: ParamsProgress): void {
    const method = say(`params.progress.method.${p.source}`)
    const label = say('params.progress.label', { received: p.received, total: p.total, method })
    this.toasts.update(this.key, { progress: { value: p.received, max: p.total, label } })
  }

  done(count: number): void {
    this.end('success', say('params.progress.done', { count }, count))
  }

  cancelled(): void {
    // Closed by the user already: the toast is gone, so what happened is told in a new one.
    if (this.open) {
      this.end('success', say('params.progress.cancelled'))
    } else {
      this.toasts.push({ severity: 'success', text: say('params.progress.cancelled') })
    }
  }

  failed(): void {
    this.end('error', say('params.progress.failed'))
  }

  /**
   * Turns the toast into the word of how the download ended, which goes after the usual time.
   *
   * @param severity how it is told
   * @param text what it says
   */
  private end(severity: 'success' | 'error', text: string): void {
    if (this.open) {
      this.open = false
      this.toasts.update(this.key, { severity, text, progress: null, sticky: false, onDismiss: null })
    }
  }
}

/**
 * Shows the toast of a download that has just started.
 *
 * @param toasts the queue
 * @param onClose called when the user closes the toast while the download runs: the download is to be cancelled
 * @returns what to tell the toast as the download goes
 */
export function startDownloadToast(toasts: Toasts, onClose: () => void): DownloadToast {
  return new RunningToast(toasts, onClose)
}
