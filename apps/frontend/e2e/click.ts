import type { E2eApp } from 'pico-desktop'

const ATTEMPTS = 3
const NOTICED_WITHIN_MS = 3000

/**
 * Clicks Connect until the page reacts. Right after the window opens, a click can land before the
 * page is laid out and do nothing. It only clicks again if nothing changed, so a click that did
 * work is never repeated.
 *
 * @param app the running app
 * @throws Error if no click had any effect
 */
export async function clickConnect(app: E2eApp): Promise<void> {
  const before = await app.text('#connection')
  const changed = `document.querySelector('#connection').innerText.trim() !== ${JSON.stringify(before.trim())}`
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    await app.click('#connect-button')
    try {
      await app.waitFor(changed, NOTICED_WITHIN_MS)

      return
    } catch {
      // Not noticed: the next attempt clicks again.
    }
  }
  throw new Error(`${ATTEMPTS} clicks on Connect did nothing: #connection still says ${JSON.stringify(before)}`)
}
