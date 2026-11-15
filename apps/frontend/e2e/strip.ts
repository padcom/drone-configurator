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
    await this.app.evaluate(`document.querySelector('#confirm-hold')
      .dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerId: 1 }))`)
    await sleep(HOLD_MS)
    await this.goes('#confirm')
  }

  /** Opens the review, and waits until it can be used. */
  async openReview(): Promise<void> {
    // (for a moment after a vehicle was asked to arm its state is not known, and there is no review)
    await this.appears(REVIEW, 30_000)
    await this.app.click(REVIEW)
    await this.appears('#review-state')
    await this.reviewIsReady()
  }

  /** Reviews, asks for the hold to arm, and holds. */
  async armWithTheHold(): Promise<void> {
    await this.openReview()
    await this.app.click(ARM_BUTTON)
    await this.hold()
    await this.heartbeatSays(true)
  }
}
