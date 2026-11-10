import { setTimeout as sleep } from 'node:timers/promises'
import type { E2eApp } from 'pico-desktop'

const ATTEMPTS = 3
const NOTICED_WITHIN_MS = 3000

/**
 * Brings a link into view and lets the layout settle before it is clicked: a line of text that appears over the screen (the
 * connection's "reconnected to the same vehicle", say) moves the rail by a line, and a click at a place read a moment before
 * lands on the item beside the one meant (issue #343: the page was on Setup, next to Parameters).
 *
 * @param app the running app
 * @param link a selector for the link
 */
async function settleAt(app: E2eApp, link: string): Promise<void> {
  await app.evaluate(`(() => {
    document.querySelector(${JSON.stringify(link)})?.scrollIntoView({ block: 'nearest' })
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  })()`)
}

/**
 * What the page looks like when the Connect dialog did not open after the last click: the address, whether a dialog or
 * the button that opens it is there, and where the button was.
 *
 * @param app the running app
 * @returns a line of text for the failure message
 */
async function describeOpening(app: E2eApp): Promise<string> {
  try {
    return await app.evaluate<string>(`JSON.stringify((() => {
      const box = document.querySelector('#open-connect')?.getBoundingClientRect()
      return {
        hash: location.hash,
        dialogs: document.querySelectorAll('dialog').length,
        button: box && [box.left, box.top, box.width, box.height].map(Math.round),
        connection: document.querySelector('#connection')?.innerText,
        hidden: document.hidden,
      }
    })())`)
  } catch (error) {
    return `(the page could not be read: ${String(error)})`
  }
}

/**
 * Clicks the top bar's vehicle cell until the Connect dialog is open: a click through DevTools can occasionally land and do
 * nothing, right after the window opens (as Connect's and the navigation's can), so a click that did not open it is made
 * again. The last attempt waits as long as a slow machine needs, and fails with the reason.
 *
 * @param app the running app
 * @param isOpen a page expression that is true once the dialog is open
 * @param left how many attempts remain
 */
async function clickOpenUntilOpen(app: E2eApp, isOpen: string, left: number): Promise<void> {
  await settleAt(app, '#open-connect')
  await app.click('#open-connect')

  if (left === 1) {
    await app.waitFor(isOpen).catch(async (error: unknown) => {
      throw new Error(`${String(error)}\n${await describeOpening(app)}`, { cause: error })
    })

    return
  }
  try {
    await app.waitFor(isOpen, NOTICED_WITHIN_MS)
  } catch {
    // Not noticed: click again.
    await clickOpenUntilOpen(app, isOpen, left - 1)
  }
}

/**
 * Opens the Connect dialog from the top bar's vehicle cell, unless it is open already.
 *
 * @param app the running app
 */
export async function openConnect(app: E2eApp): Promise<void> {
  const isOpen = 'document.querySelector(\'#connect-button\') !== null'
  if (!await app.evaluate<boolean>(isOpen)) {
    await clickOpenUntilOpen(app, isOpen, ATTEMPTS)
  }
}

/** What to connect to: the kind of link and, for UDP and TCP, where. */
export interface Target {
  /** The tab: `udp`, `tcp`, `serial` or `simulator`. */
  transport: string
  /** The host of a UDP or TCP link. */
  host?: string
  /** The port of a UDP or TCP link. */
  port?: string
}

/**
 * Opens the Connect dialog and fills it in: the tab, and the host and port when there are any. It does not press Connect.
 *
 * @param app the running app
 * @param target what to connect to
 */
export async function chooseConnection(app: E2eApp, target: Target): Promise<void> {
  await openConnect(app)
  await app.click(`#transport-${target.transport}`)

  if (target.host !== undefined && target.port !== undefined) {
    await app.fill('#host', target.host)
    await app.fill('#port', target.port)
  }
}

/**
 * Clicks Connect once, and waits to see whether the page reacted.
 *
 * @param app the running app
 * @param changed a page expression that is true once `#connection` shows something new
 * @returns true if the click had an effect
 */
async function clickOnce(app: E2eApp, changed: string): Promise<boolean> {
  await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
  await openConnect(app)
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
 * What the navigation looks like, for a click that did not take the page where it was meant to (issue #343): the address, the
 * link that is current, where the link was, and what was at the middle of it (tag, id, class, href).
 *
 * @param app the running app
 * @param link a selector for the link
 * @returns a line of text for the failure message
 */
async function describeNavigation(app: E2eApp, link: string): Promise<string> {
  try {
    return await app.evaluate<string>(`JSON.stringify((() => {
      const box = document.querySelector(${JSON.stringify(link)})?.getBoundingClientRect()
      // What is at the middle of the link, where the click lands: the link itself, or something that covers it.
      const over = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return {
        hash: location.hash,
        over: over && [over.tagName, over.id, over.className.toString(), over.getAttribute('href')],
        current: document.querySelector('nav [aria-current="page"]')?.getAttribute('href'),
        link: box && [box.left, box.top, box.width, box.height].map(Math.round),
        railScroll: document.querySelector('nav.rail')?.scrollTop,
        connection: document.querySelector('#connection')?.innerText,
      }
    })())`)
  } catch (error) {
    return `(the page could not be read: ${String(error)})`
  }
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
  await settleAt(app, link)
  await app.click(link)

  if (left === 1) {
    await app.waitFor(shown).catch(async (error: unknown) => {
      throw new Error(`${String(error)}\n${await describeNavigation(app, link)}`, { cause: error })
    })

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

/** How long the page ignores presses on a confirmation after it appears (IGNORE_MS in src/safety.ts), and a margin. */
const CONFIRMATION_ARMS_MS = 400 + 150

/**
 * Answers the open confirmation of a parameter write yes, the way a user does: by pressing Write (after the moment in
 * which the page ignores presses). A write is not held, the vehicle's read-back is what makes it safe; a test that
 * needs a hold (arming, an emergency stop) holds the button down itself.
 *
 * @param app the running app
 */
export async function confirmWrite(app: E2eApp): Promise<void> {
  await app.waitFor('document.querySelector(\'#confirm-yes\') !== null')
  await sleep(CONFIRMATION_ARMS_MS)
  await app.click('#confirm-yes')
  await app.waitFor('document.querySelector(\'#confirm\') === null')
}

/**
 * Waits until a single write is over and the vehicle read it back: the value in the list is the one written (the list takes
 * the vehicle's read-back, not what was asked), "Writing…" is gone, the status region says "Written and read back" (out of
 * sight, for a screen reader) and the alert region is empty. Both regions are always in the page, so a missing one is a
 * failure and not an empty text.
 *
 * @param app the running app
 * @param row a selector for the parameter's row in the list
 * @param value the value that was written
 * @param timeoutMs how long the vehicle may take
 */
export async function waitForWritten(app: E2eApp, row: string, value: number, timeoutMs = 10_000): Promise<void> {
  await app.waitForText(`${row} td.num`, new RegExp(`^${value}$`, 'u'), timeoutMs)
  await app.waitFor(`document.querySelector('#write-status') !== null && document.querySelector('#write-alert') !== null`)
  await app.waitFor(`!document.querySelector('#write-status').textContent.includes('Writing')`, timeoutMs)
  const [status, alert] = [await app.text('#write-status'), await app.text('#write-alert')]
  if (alert !== '' || !status.includes(`Written and read back: ${value}.`)) {
    throw new Error(`the list shows ${value}, but the detail says ${JSON.stringify({ status, alert })}`)
  }
}

/**
 * Answers the open confirmation no.
 *
 * @param app the running app
 */
export async function cancelConfirm(app: E2eApp): Promise<void> {
  await app.waitFor('document.querySelector(\'#confirm-cancel\') !== null')
  await sleep(CONFIRMATION_ARMS_MS)
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
