// The toast queue: short messages about events (a write was read back, the GPS is poor, the vehicle disagrees), shown a few
// at a time and gone by themselves. No DOM here: ToastHost.vue draws it. The clock and the timers are parameters, so that a
// test needs no waiting.
import { type Ref, reactive, ref } from 'vue'

/** How a toast is told: success, a warning, an error (each with its glyph and its colour, and its words). */
export type Severity = 'success' | 'warning' | 'error'

/** What is pushed. */
export interface ToastInput {
  /** Names the kind of event, so that the same event twice makes one toast with a count; the text when omitted. */
  id?: string
  /** How it is told. */
  severity: Severity
  /** The words. */
  text: string
  /** Stays until it is dismissed (for what must not be missed). */
  sticky?: boolean
}

/** A toast as it is kept. */
export interface Toast {
  /** Its own number, for the list and for dismissing it. */
  key: number
  /** The kind of event. */
  id: string
  /** How it is told. */
  severity: Severity
  /** The words. */
  text: string
  /** Whether it stays until dismissed. */
  sticky: boolean
  /** How many times the same event was pushed within the de-duplication window (1 for a single one). */
  count: number
}

/** At most this many are shown; the rest wait their turn. */
export const MAX_VISIBLE = 4

/** How long a toast stays (ms). */
export const SHOW_MS = 6000

/** How long an error stays (ms): longer. */
export const ERROR_SHOW_MS = 12_000

/** The same event pushed again within this long (ms) is one toast with a count. */
export const DEDUPE_MS = 2000

/** The timers and the clock. */
export interface Clock {
  /** The time now (ms). */
  now: () => number
  /** Calls `fn` after `ms`. */
  set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  /** Cancels a timer. */
  clear: (timer: ReturnType<typeof setTimeout>) => void
}

const REAL: Clock = { now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: timer => clearTimeout(timer) }

/** What can hold a toast: the pointer is on it, or the focus is in it. Kept apart, so that one letting go is not both. */
export type Hold = 'pointer' | 'focus'

/** What the queue offers. */
export interface Toasts {
  /** The toasts that are shown now (at most MAX_VISIBLE), oldest first. */
  visible: Ref<Toast[]>
  /** How many are waiting for a place. */
  waiting: Ref<number>
  /** Adds a toast (or counts a repeat of one); gives its key, for dismissing it when what it says stops being true. */
  push: (input: ToastInput) => number
  /** Removes a toast. */
  dismiss: (key: number) => void
  /** Stops a toast's time running out, for as long as `by` holds it (the pointer is on it, or the focus is in it). */
  pause: (key: number, by: Hold) => void
  /** Lets go of one hold; it runs out again, with the time it had left, when nothing holds it any more. */
  resume: (key: number, by: Hold) => void
}

/** What is known of a toast beyond what is shown. */
interface Entry {
  /** The toast. */
  toast: Toast
  /** When it was last pushed (ms). */
  lastAt: number
  /** The timer, while it runs. */
  timer?: ReturnType<typeof setTimeout>
  /** How much time it has left (ms). */
  left: number
  /** Since when it has been running (ms). */
  since: number
  /** What holds it: while the pointer or the focus is on it, its time does not run (each is let go on its own). */
  holds: Set<Hold>
}

/**
 * How long a toast stays.
 *
 * @param toast the toast
 * @returns milliseconds, or Infinity when it stays until dismissed
 */
function lifeOf(toast: Toast): number {
  if (toast.sticky) {
    return Number.POSITIVE_INFINITY
  }

  return toast.severity === 'error' ? ERROR_SHOW_MS : SHOW_MS
}

/**
 * Whether the time of a toast is to start running: it is not running, it is not held, and it does go.
 *
 * @param entry the toast
 * @returns true when its timer is to be started
 */
function startable(entry: Entry): boolean {
  return entry.timer === undefined && entry.holds.size === 0 && Number.isFinite(entry.left)
}

/** The queue: which toasts are shown, and when each of them goes. */
class ToastQueue implements Toasts {
  readonly visible = ref<Toast[]>([])
  readonly waiting = ref(0)
  private readonly entries: Entry[] = []
  private next = 1

  constructor(private readonly clock: Clock) {}

  /**
   * Adds a toast, or counts a repeat of one that was just pushed.
   *
   * @param input the toast
   * @returns the key of the toast, new or counted
   */
  push = (input: ToastInput): number => {
    const repeated = this.counted(input)
    if (repeated) {
      return repeated.toast.key
    }
    const toast = reactive<Toast>({
      key: this.next++,
      id: input.id ?? input.text,
      severity: input.severity,
      text: input.text,
      sticky: input.sticky ?? false,
      count: 1,
    })
    this.entries.push({ toast, lastAt: this.clock.now(), left: lifeOf(toast), since: 0, holds: new Set() })
    this.refresh()

    return toast.key
  }

  /**
   * Removes a toast.
   *
   * @param key its number
   */
  dismiss = (key: number): void => {
    const at = this.entries.findIndex(e => e.toast.key === key)
    const gone = this.entries[at]
    if (gone) {
      this.stop(gone)
      this.entries.splice(at, 1)
      this.refresh()
    }
  }

  /**
   * Stops the time of a toast running.
   *
   * @param key its number
   * @param by what holds it
   */
  pause = (key: number, by: Hold): void => {
    const entry = this.entries.find(e => e.toast.key === key)
    if (entry) {
      entry.holds.add(by)

      if (entry.timer !== undefined) {
        entry.left -= this.clock.now() - entry.since
        this.stop(entry)
      }
    }
  }

  /**
   * Lets the time of a toast run again, with what it had left.
   *
   * @param key its number
   * @param by what lets go
   */
  resume = (key: number, by: Hold): void => {
    const entry = this.entries.find(e => e.toast.key === key)
    if (entry) {
      entry.holds.delete(by)
      this.refresh()
    }
  }

  /**
   * Cancels the timer of a toast.
   *
   * @param entry the toast
   */
  private stop(entry: Entry): void {
    if (entry.timer !== undefined) {
      this.clock.clear(entry.timer)
      entry.timer = undefined
    }
  }

  /**
   * Starts the time of a toast.
   *
   * @param entry the toast
   */
  private run(entry: Entry): void {
    entry.since = this.clock.now()
    entry.timer = this.clock.set(() => this.dismiss(entry.toast.key), entry.left)
  }

  /** Shows what fits, starts the time of what has just appeared, and counts what waits. */
  private refresh(): void {
    const shown = this.entries.slice(0, MAX_VISIBLE)
    this.visible.value = shown.map(e => e.toast)
    this.waiting.value = Math.max(0, this.entries.length - MAX_VISIBLE)

    for (const entry of shown.filter(startable)) {
      this.run(entry)
    }
  }

  /**
   * Counts a repeat of the same event, if there is a recent one.
   *
   * @param input what was pushed
   * @returns the toast it was counted on, or undefined when it is a new one
   */
  private counted(input: ToastInput): Entry | undefined {
    const id = input.id ?? input.text
    // The newest one of the kind: an older, expired-window one of the same id must not hide a recent repeat's place.
    const same = this.entries.findLast(e => e.toast.id === id && e.toast.severity === input.severity)
    if (!same || this.clock.now() - same.lastAt >= DEDUPE_MS) {
      return undefined
    }
    same.toast.count += 1
    same.lastAt = this.clock.now()
    // A repeat is news: its time starts again, so a message that keeps coming is not gone while it does.
    this.stop(same)
    same.left = lifeOf(same.toast)
    this.refresh()

    return same
  }
}

/**
 * A toast queue.
 *
 * @param clock the clock and the timers (the real ones unless a test gives its own)
 * @returns the queue
 */
export function createToasts(clock: Clock = REAL): Toasts {
  return new ToastQueue(clock)
}

/** The queue the application shares. */
const shared = createToasts()

/**
 * The application's toasts.
 *
 * @returns the shared queue
 */
export function useToasts(): Toasts {
  return shared
}
