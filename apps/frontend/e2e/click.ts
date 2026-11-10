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
 * Queues a value for a parameter the way a user does: presses its row, types the value and settles it (`fill` sends the
 * `input` and the `change` of Enter or leaving the field), and waits until the changes list shows it (from → to).
 *
 * @param app the running app
 * @param id the parameter's name (its row in the list is `tr[data-id]`)
 * @param from the value on the vehicle now
 * @param to the value to write
 */
export async function queueValue(app: E2eApp, id: string, from: number, to: number): Promise<void> {
  await app.click(`tr[data-id="${id}"]`)
  await app.fill('#draft', String(to))
  await app.waitFor(`[...document.querySelectorAll('#staged .staged-row')].some(r => r.dataset.id === ${JSON.stringify(id)}
    && r.textContent.replace(/\\s+/gu, ' ').includes('${from} → ${to}'))`)
}

/**
 * What the button that writes the changes looks like, for a press that did not open the question (issue #343, a click that
 * did nothing): whether it is enabled, what it says, where it is, and what is at the middle of it.
 *
 * @param app the running app
 * @returns a line of text for the failure message
 */
async function describeWriteButton(app: E2eApp): Promise<string> {
  try {
    return await app.evaluate<string>(`JSON.stringify((() => {
      const button = document.querySelector('#write-staged')
      const box = button?.getBoundingClientRect()
      const over = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)

      return {
        disabled: button?.disabled,
        text: button?.textContent.trim(),
        box: box && [box.left, box.top, box.width, box.height].map(Math.round),
        over: over && [over.tagName, over.id, over.className.toString()],
        dialog: document.querySelectorAll('dialog[open]').length,
        question: document.querySelector('#question')?.textContent,
        staged: document.querySelector('#staged')?.innerText,
        connection: document.querySelector('#connection')?.innerText,
        hash: location.hash,
      }
    })())`)
  } catch (error) {
    return `(the page could not be read: ${String(error)})`
  }
}

/** A page expression: true when what is at the middle of the Write button is the button itself, not something over it. */
const WRITE_BUTTON_UNCOVERED = `(() => {
  const button = document.querySelector('#write-staged')
  const box = button?.getBoundingClientRect()

  return Boolean(box) && button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
})()`

/**
 * Presses "Write N and verify" until the question is asked: a click through DevTools can occasionally land and do nothing (as
 * the others here), so a press that did not open it is made again. The last one fails with what the button looked like.
 *
 * Nothing may cover the button when it is pressed. The toasts are in the bottom right corner of the window, over the screen: a
 * warning of the vehicle can sit on the button for some seconds (it did, with ArduPilot SITL, and the press went to the toast),
 * so the press waits until the toasts that are there have gone by themselves.
 *
 * @param app the running app
 * @param question the question that is expected
 * @param left how many presses remain
 */
async function pressUntilAsked(app: E2eApp, question: string, left: number): Promise<void> {
  await app.waitFor(WRITE_BUTTON_UNCOVERED, 30_000)
  await app.click('#write-staged')

  try {
    await app.waitForText('#question', question, left === 1 ? 10_000 : NOTICED_WITHIN_MS)
  } catch (error) {
    if (left === 1) {
      throw new Error(`${String(error)}\n${await describeWriteButton(app)}`, { cause: error })
    }
    await pressUntilAsked(app, question, left - 1)
  }
}

/**
 * Asks for the queued changes to be written: presses "Write N and verify", and waits for the one question, which names
 * every parameter. It is not answered here (a test that checks the dialog does that itself; `confirmWrite` says yes).
 *
 * @param app the running app
 * @param ids the parameters that are queued, in order
 */
export async function askToWriteQueued(app: E2eApp, ids: string[]): Promise<void> {
  const noun = ids.length === 1 ? 'parameter' : 'parameters'
  await pressUntilAsked(app, `Write ${ids.length} ${noun} to the vehicle (${ids.join(', ')})?`, 2)
}

/**
 * Waits until a queued change was written and the vehicle read it back: the value in the list is the one written (the list
 * takes the vehicle's read-back, not what was asked), the change's row says "✓ Written and read back: N", and no alert is
 * raised. The alert region is always in the page, so a missing one is a failure and not an empty text.
 *
 * @param app the running app
 * @param id the parameter's name (its row in the list is `tr[data-id]`)
 * @param value the value that was written
 * @param timeoutMs how long the vehicle may take
 */
export async function waitForQueuedWritten(app: E2eApp, id: string, value: number, timeoutMs = 10_000): Promise<void> {
  await app.waitForText(`tr[data-id="${id}"] td.num`, new RegExp(`^${value}$`, 'u'), timeoutMs)
  await app.waitFor(`[...document.querySelectorAll('#staged .staged-row')].some(r => r.dataset.id === ${JSON.stringify(id)}
    && r.querySelector('.line.ok')?.textContent.includes('Written and read back: ${value}'))`, timeoutMs)
  const alert = `document.querySelector('#staged .staged-status[role="alert"]')`
  await app.waitFor(`${alert} !== null`)
  const said = await app.evaluate<string>(`${alert}.textContent.trim()`)
  if (said !== '') {
    throw new Error(`the list shows ${value}, but the changes say: ${said}`)
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
