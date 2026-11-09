import { setTimeout as sleep } from 'node:timers/promises'
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
 * Clicks a navigation link until the page reacts: a click through DevTools can occasionally land and do nothing (the
 * same as Connect's, above), and a second click on a link that did work only goes to the screen already shown. The last
 * attempt waits as long as a slow machine needs, and fails with the reason.
 *
 * @param app the running app
 * @param link a selector for the link
 * @param shown a page expression that is true once the link's screen is the one shown
 * @param left how many attempts remain
 */
async function clickLinkUntilShown(app: E2eApp, link: string, shown: string, left: number): Promise<void> {
  await app.click(link)

  if (left === 1) {
    await app.waitFor(shown)

    return
  }
  try {
    await app.waitFor(shown, NOTICED_WITHIN_MS)
  } catch {
    // Not noticed: click again.
    await clickLinkUntilShown(app, link, shown, left - 1)
  }
}

/**
 * Opens a screen from the navigation, and waits until its link says it is the one shown. (The application starts on
 * Flight data; the screens are loaded when first asked for.)
 *
 * @param app the running app
 * @param id the screen: `flight`, `parameters` and so on (the last part of its address)
 */
export async function showScreen(app: E2eApp, id: string): Promise<void> {
  const link = `nav a[href="#/${id}"]`

  await clickLinkUntilShown(app, link, `document.querySelector('${link}').getAttribute('aria-current') === 'page'`, ATTEMPTS)
}

/**
 * Chooses a theme with the switch at the top, clicking again if the click was lost, until the page has it.
 *
 * @param app the running app
 * @param theme `system`, `light` or `dark`
 */
export async function chooseTheme(app: E2eApp, theme: string): Promise<void> {
  const expected = theme === 'system' ? 'null' : JSON.stringify(theme)

  await clickLinkUntilShown(
    app,
    `#theme-switch label:has(input[value="${theme}"])`,
    // (A page that is being loaded has no root element for an instant: asking it then is an error, not "not yet".)
    `document.documentElement !== null && document.documentElement.getAttribute('data-theme') === ${expected}`,
    ATTEMPTS,
  )
}

/** How long the page ignores presses on a confirmation after it appears (IGNORE_MS in src/safety.ts), and a margin. */
const CONFIRMATION_ARMS_MS = 400 + 150

/** How long a confirmation takes to be answered by holding its button (HOLD_MS in src/safety.ts), and a margin. */
const CONFIRMATION_HOLD_MS = 1200 + 10_000

/**
 * Answers the open confirmation yes, the way a user does: by holding the button down for as long as it asks. (There is
 * no shortcut for a test: the page that is tested is the page that ships. A click, which a hold ignores, is not enough.)
 *
 * @param app the running app
 */
export async function holdConfirm(app: E2eApp): Promise<void> {
  await app.waitFor('document.querySelector(\'#confirm-hold\') !== null')
  await sleep(CONFIRMATION_ARMS_MS)
  const down = 'new PointerEvent(\'pointerdown\', { bubbles: true, button: 0 })'
  await app.evaluate(`document.querySelector('#confirm-hold').dispatchEvent(${down})`)
  await app.waitFor('document.querySelector(\'#confirm\') === null', CONFIRMATION_HOLD_MS)
}

/**
 * Answers the open confirmation no.
 *
 * @param app the running app
 */
export async function cancelConfirm(app: E2eApp): Promise<void> {
  await app.waitFor('document.querySelector(\'#confirm-cancel\') !== null')
  await app.click('#confirm-cancel')
  await app.waitFor('document.querySelector(\'#confirm\') === null')
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
