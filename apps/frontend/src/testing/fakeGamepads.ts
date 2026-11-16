// A scripted gamepad for the tests of the RC control: what a radio shows to `navigator.getGamepads()` (nothing until it has
// had input, then 8 axes and 24 buttons, as the TX16S does), a clock the test moves, and a window that can be hidden. A test
// drives the sticks frame by frame with `set`, moves the clock with `advance` (in steps of one poll, so that the page's timer
// runs as it would) and `skip` (the page is frozen or throttled: time passes and no poll runs), and unplugs the pad with
// `disconnect`.
import { vi } from 'vitest'
import { POLL_MS } from '@/composables/useGamepad'
import type { Environment, PadLike } from '@/lib/rc/reader'

/** The id the TX16S gives over USB (what the browser says of it). */
export const TX16S = 'OpenTX Radiomaster TX16S Joystick (Vendor: 1209 Product: 4f54)'

/** The pad of the test, as the browser's `Gamepad` is: the same object, changed in place. */
interface Pad extends PadLike {
  /** The axes (changed by `set`). */
  axes: number[]
  /** The buttons (changed by `set`). */
  buttons: { value: number }[]
  /** Whether it is connected. */
  connected: boolean
}

/** The scripted gamepads. */
export class FakePads {
  /** The page's clock (ms). */
  clock = 1000
  /** Whether the window is visible. */
  shown = true
  private pad: Pad | null = null

  /**
   * What the reader looks at.
   *
   * @returns the environment
   */
  env(): Environment {
    return { pads: () => [this.pad], now: () => this.clock, visible: () => this.shown }
  }

  /**
   * The radio shows up (a radio does, at its first movement): 8 axes at rest and 24 buttons up.
   *
   * @param id the device's id
   */
  connect(id: string = TX16S): void {
    const axes = Array.from({ length: 8 }, () => 0)
    const buttons = Array.from({ length: 24 }, () => ({ value: 0 }))

    this.pad = { id, index: 0, connected: true, axes, buttons }
    window.dispatchEvent(new Event('gamepadconnected'))
  }

  /**
   * The radio is unplugged: the browser says so, and the pad is gone.
   */
  disconnect(): void {
    if (this.pad !== null) {
      this.pad.connected = false
    }
    this.pad = null
    window.dispatchEvent(new Event('gamepaddisconnected'))
  }

  /**
   * What the sticks and switches say now.
   *
   * @param axes the axes, from axis 0 (the rest stay as they are)
   * @param buttons the buttons, from button 0 (the rest stay as they are)
   */
  set(axes: readonly number[], buttons: readonly number[] = []): void {
    const { pad } = this
    if (pad === null) {
      return
    }
    axes.forEach((value, index) => {
      pad.axes[index] = value
    })
    buttons.forEach((value, index) => {
      pad.buttons[index] = { value }
    })
  }

  /**
   * Time passes as it does for a page that runs: the timers run, one poll at a time.
   *
   * @param ms how long
   */
  advance(ms: number): void {
    for (let spent = 0; spent < ms; spent += POLL_MS) {
      this.clock += POLL_MS
      vi.advanceTimersByTime(POLL_MS)
    }
  }

  /**
   * Time passes and the page does not run (a frozen or throttled page): the clock moves, the timers do not.
   *
   * @param ms how long
   */
  skip(ms: number): void {
    this.clock += ms
  }

  /**
   * The window is hidden or shown: the browser says so at once.
   *
   * @param visible whether it is visible now
   */
  show(visible: boolean): void {
    this.shown = visible
    document.dispatchEvent(new Event('visibilitychange'))
  }
}
