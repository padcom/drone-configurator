import type { E2eApp } from 'pico-desktop'

const ATTEMPTS = 3
const NOTICED_WITHIN_MS = 3000

/**
 * Clicks Connect once, and waits to see whether the page reacted.
 *
 * @param app the running app
 * @param changed a page expression that is true once `#connection` shows something new
 * @returns true if the click had an effect
 */
async function clickOnce(app: E2eApp, changed: string): Promise<boolean> {
  await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
  await app.click('#connect-button')

  try {
    await app.waitFor(changed, NOTICED_WITHIN_MS)

    return true
  } catch {
    // Not noticed: the caller clicks again.
    return false
  }
}

/**
 * Clicks Connect, one attempt after the other, until the page reacts or the attempts are used up. A click that
 * had an effect is never repeated.
 *
 * @param app the running app
 * @param changed a page expression that is true once `#connection` shows something new
 * @param left how many attempts remain
 * @returns true if one of them had an effect
 */
async function clickUntilNoticed(app: E2eApp, changed: string, left: number): Promise<boolean> {
  if (left === 0) {
    return false
  }

  return (await clickOnce(app, changed)) || clickUntilNoticed(app, changed, left - 1)
}

/**
 * Clicks Connect until the page reacts. Right after the window opens, a click can land before the
 * page is laid out and do nothing. It only clicks again if nothing changed, so a click that did
 * work is never repeated.
 *
 * @param app the running app
 * @throws {Error} if no click had any effect
 */
export async function clickConnect(app: E2eApp): Promise<void> {
  const before = await app.text('#connection')
  const changed = `document.querySelector('#connection').innerText.trim() !== ${JSON.stringify(before.trim())}`
  if (!await clickUntilNoticed(app, changed, ATTEMPTS)) {
    throw new Error(`${ATTEMPTS} clicks on Connect did nothing: #connection still says ${JSON.stringify(before)}`)
  }
}
