// What the specs of the controls of a flight do in the window: look at the page, wait for the vehicle's heartbeat (the top
// bar's STATE cell: the strip does not repeat it), review, and hold a confirmation as a person does with the pointer.
import type { E2eApp } from './launch'

/** How long a confirmation ignores presses (400 ms) with a margin, and how long a hold takes (1200 ms) with one. */
const ARMS_MS = 600
const HOLD_MS = 1500

/** Selectors of what the specs look at. */

export const REVIEW = '#state-arm'

export const DISARM = '[data-command-button="vehicle.disarm"]'

export const MORE = '#flight-strip .strip-actions .kit-menu'

export const STOP = '#flight-strip .strip-actions [role="menuitem"]'

export const MODE_BUTTON = '.cell.mode .kit-menu button'

export const MODE_ITEMS = '.cell.mode [role="menuitem"]'

export const ARM_BUTTON = '#review-arm'

/**
 * Waits.
 *
 * @param ms for how long
 */
export const sleep = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/** What a spec does in the window of one app. */
export class Strip {
  /**
   * Makes it.
   *
   * @param app the app under test
   */
  constructor(private readonly app: E2eApp) {}

  /**
   * Whether something is on the page.
   *
   * @param selector what to look for
   * @returns true when it is
   */
  exists(selector: string): Promise<boolean> {
    return this.app.evaluate<boolean>(`document.querySelector(${JSON.stringify(selector)}) !== null`)
  }

  /**
   * Waits until something is on the page.
   *
   * @param selector what to wait for
   * @param ms for how long at most
   * @returns once it is there
   */
  appears(selector: string, ms = 10_000): Promise<void> {
    return this.app.waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, ms)
  }

  /**
   * Waits until something is gone from the page.
   *
   * @param selector what to wait for
   * @param ms for how long at most
   * @returns once it is gone
   */
  goes(selector: string, ms = 10_000): Promise<void> {
    return this.app.waitFor(`document.querySelector(${JSON.stringify(selector)}) === null`, ms)
  }

  /**
   * Waits until the top bar's STATE cell says what the vehicle's heartbeat says.
   *
   * @param armed whether the vehicle is armed
   * @returns once it does
   */
  heartbeatSays(armed: boolean): Promise<void> {
    const isArmed = `document.querySelector('.cell.state')?.classList.contains('armed') === true`
    const isDisarmed = `!${isArmed} && document.querySelector('.cell.state')?.innerText.includes('DISARMED')`

    return this.app.waitFor(armed ? isArmed : isDisarmed, 30_000)
  }

  /**
   * Waits until the top bar's MODE cell names a mode.
   *
   * @param mode the mode
   * @returns once it does
   */
  modeIs(mode: string): Promise<void> {
    return this.app.waitFor(`document.querySelector('${MODE_BUTTON}')?.innerText.trim() === '${mode}'`, 15_000)
  }

  /** Waits until the review can be used to arm: the vehicle has run its checks and the arm may be asked for. */
  async reviewIsReady(): Promise<void> {
    await this.app.waitFor(`document.querySelector('#review-running') === null`)
    const button = `document.querySelector('${ARM_BUTTON}')`
    await this.app.waitFor(`${button} !== null && !${button}.disabled`)
  }

  /**
   * What the page says of a hold that did not come: the dialogs and the notices (a toast says why a command did not run).
   *
   * @returns their words
   */
  notices(): Promise<string> {
    return this.app.evaluate<string>(
      `[...document.querySelectorAll('[role="status"], [role="alert"], dialog')].map(e => e.id + ': ' + e.innerText).join(' | ')`,
    )
  }

  /** Holds the confirm button of the question that is open, long enough, as a person does with the pointer. */
  async hold(): Promise<void> {
    try {
      await this.appears('#confirm-hold')
    } catch (error) {
      throw new Error(`no hold was asked for; the page says: ${await this.notices()}`, { cause: error })
    }
    // (the question ignores presses for its first moments)
    await sleep(ARMS_MS)
    await this.press()

    // A press that did not hold (a slow machine: the first moments were not over) sent nothing: it is let go and tried once more.
    if (await this.exists('#confirm')) {
      const up = `new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })`
      await this.app.evaluate(`document.querySelector('#confirm-hold')?.dispatchEvent(${up})`)
      await sleep(ARMS_MS)
      await this.press()
    }
    try {
      await this.goes('#confirm')
    } catch (error) {
      throw new Error(`the hold did not end the question; the page says: ${await this.notices()}`, { cause: error })
    }
  }

  /** Presses the hold button as a person does with the pointer, and keeps it down for the time of a hold. */
  private async press(): Promise<void> {
    await this.app.evaluate(`document.querySelector('#confirm-hold')
      ?.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerId: 1 }))`)
    await sleep(HOLD_MS)
  }

  /** Presses STATE of the top bar. A vehicle that does not say its checks fail goes straight to the hold of "Arm the vehicle". */
  async startArming(): Promise<void> {
    // (for a moment after a vehicle was asked to arm its state is not known, and STATE is not the arm control)
    await this.appears(REVIEW, 30_000)
    await this.app.click(REVIEW)
  }

  /** Waits until the review is open and can be used (a refused arm opens it), and says what it lists. */
  async reviewIsOpen(): Promise<void> {
    await this.appears('#review-state')
    await this.reviewIsReady()
  }

  /** Presses STATE, and holds the hold of "Arm the vehicle". */
  async armWithTheHold(): Promise<void> {
    await this.startArming()
    await this.hold()
    await this.heartbeatSays(true)
  }
}
