// The gamepad, as the RC control reads it: a poll on the page's own clock (every 20 ms), kept as the latest `reading`, and a
// word to whoever listens when a read that was live stops being one (`onGap`): no pad (it was unplugged, or never had input),
// a read that came too late (the page was throttled or frozen), or the window hidden. A listener that flies with it lets go
// of the sticks then, and never uses an old sample: there is none, the reading is of the last poll only (see
// `lib/rc/reader.ts` for what a read may vouch for). A window that loses the focus is NOT a gap: the pad keeps reading
// (measured), and the late-read rule is the safety net.
import { type ComputedRef, type ShallowRef, computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue'
import { type Environment, type Gap, PadReader, type Reading } from '@/lib/rc/reader'

/** How often the pad is read (ms): 50 times a second. */
export const POLL_MS = 20

/** What the gamepad needs to be told. */
export interface GamepadOptions {
  /** What is read (the browser's by default): a test gives its own. */
  env?: Environment
  /** The id of the pad to read (any connected one when it is not given). */
  device?: string
  /** Called when a read that was live is not (once for each time it stops being live). */
  onGap?: (gap: Gap) => void
}

/** The gamepad as refs and actions. */
export interface GamepadModel {
  /** The last read: a fresh sample, or why there is none. */
  readonly reading: ShallowRef<Reading>
  /** Whether the last read was a sample. */
  readonly live: ComputedRef<boolean>
  /** The id of the pad that was read last, or null. */
  readonly id: ComputedRef<string | null>
  /** Starts reading (the first read comes at once). */
  start: () => void
  /** Stops reading, and forgets what was read: the reading is `none`. */
  stop: () => void
}

/**
 * The environment of the browser: its gamepads, its clock and its visibility.
 *
 * @returns the environment
 */
export function browserEnvironment(): Environment {
  return {
    pads: () => (typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()] : []),
    now: () => performance.now(),
    visible: () => document.visibilityState === 'visible',
  }
}

/** The gamepad, watched. */
class PadWatch implements GamepadModel {
  readonly reading = shallowRef<Reading>({ kind: 'none', at: 0 })
  readonly live = computed(() => this.reading.value.kind === 'live')
  readonly id = computed(() => (this.reading.value.kind === 'live' ? this.reading.value.id : null))
  private readonly reader: PadReader
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly poll = (): void => this.tick()

  /**
   * Makes it.
   *
   * @param env what is read
   * @param onGap what is told when a live read stops being one
   * @param device the id of the pad to read
   */
  constructor(private readonly env: Environment, private readonly onGap: ((gap: Gap) => void) | undefined, device?: string) {
    this.reader = new PadReader(env, device)
  }

  /** One read: kept as the latest, and a gap that follows a live read is told. */
  private tick(): void {
    const before = this.reading.value
    const now = this.reader.read()

    this.reading.value = now

    if (before.kind === 'live' && now.kind !== 'live') {
      this.onGap?.(now.kind)
    }
  }

  start = (): void => {
    if (this.timer !== undefined) {
      return
    }
    this.reader.restart()
    this.reading.value = { kind: 'none', at: this.env.now() }
    this.timer = setInterval(this.poll, POLL_MS)
    // (a window that is hidden or a pad that goes is told at once, not at the next tick of a timer the page may not be given)
    document.addEventListener('visibilitychange', this.poll)
    window.addEventListener('gamepaddisconnected', this.poll)
    this.tick()
  }

  stop = (): void => {
    if (this.timer === undefined) {
      return
    }
    clearInterval(this.timer)
    this.timer = undefined
    document.removeEventListener('visibilitychange', this.poll)
    window.removeEventListener('gamepaddisconnected', this.poll)
    this.reading.value = { kind: 'none', at: this.env.now() }
  }
}

/**
 * Makes the gamepad. It stops with the scope it was made in.
 *
 * @param options what is read, which pad, and what is told of a gap
 * @returns the model
 */
export function useGamepad(options: GamepadOptions = {}): GamepadModel {
  const pad = new PadWatch(options.env ?? browserEnvironment(), options.onGap, options.device)

  if (getCurrentScope() !== undefined) {
    onScopeDispose(pad.stop)
  }

  return pad
}
