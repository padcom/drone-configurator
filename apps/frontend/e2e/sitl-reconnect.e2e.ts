// Reconnecting against ArduPilot SITL, in the real window, through a proxy that can be cut (flaky-proxy.ts): the cable
// pulled during telemetry, during a parameter download (after a number of bytes, so it is in the middle of it on any
// machine) and just after a write, a vehicle that falls silent on a link that stays up, and another vehicle behind the
// same address. It launches its own SITL (it stops one and starts another), so it ignores SITL_ENDPOINT.
//
// The checks are in order and each goes on from the one before (one app, one connection): if the first fails, the
// rest fail for that reason. "The same vehicle" depends on the backend reading AUTOPILOT_VERSION in time after each
// reconnect (a vehicle whose unique id cannot be read is taken for another, which is the safe side); SITL answers at
// once, but a very slow machine could turn it into a false "another vehicle".
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen, waitForWritten } from './click'
import { FlakyProxy } from './flaky-proxy'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

// A list that never arrives takes 10 + 10 + 30 s to give up on (and three showScreen calls), and the check has used time
// before it asks: LONG_MS leaves room for all of it, so that the failure message is printed before Vitest ends the test.
const LONG_MS = 150_000
const RECONNECT_MS = 60_000
/** How long to wait for the list before the screen is asked for again; the last attempt waits LAST_LIST_MS. */
const RESHOW_AFTER_MS = 10_000
const LAST_LIST_MS = 30_000
// The retry is there until #343 is understood: once the recorder of the address (startAll) shows who takes the page to
// Setup, remove it and fix the cause.
const SHOW_ATTEMPTS = 3
const PARAM = 'BATT_CAPACITY'
const STEP = 100
const ROW = `tr[data-id="${PARAM}"]`
/** How much of the vehicle's talk to let through before the cable is pulled: about a third of a full list (~50 kB). */
const DOWNLOAD_CUT_BYTES = 15_000

// What the run has started (undefined until it has), and the parameter counts it has seen.
let sitl: Sitl | undefined
let other: Sitl | undefined
let proxy: FlakyProxy | undefined
let app: E2eApp | undefined
const counts: number[] = []

/**
 * The app under test.
 *
 * @returns the app
 * @throws {Error} before it has started
 */
function window(): E2eApp {
  if (!app) {
    throw new Error('the app has not started')
  }

  return app
}

/**
 * The proxy between the app and the simulator.
 *
 * @returns the proxy
 * @throws {Error} before it has started
 */
function cable(): FlakyProxy {
  if (!proxy) {
    throw new Error('the proxy has not started')
  }

  return proxy
}

/**
 * Makes the page note every change of its address, for the failure message of describePage (who took the page to Setup, and
 * when). The router moves the page with history.pushState and replaceState, which raise no hashchange, so both are wrapped;
 * popstate covers Back and Forward.
 *
 * @param page the running app
 */
async function recordAddressChanges(page: E2eApp): Promise<void> {
  await page.evaluate(`(() => {
    window.__hashes = []
    const note = (how, url) => window.__hashes.push([Math.round(performance.now()), how, String(url).split('#')[1],
      (new Error().stack || '').split('\\n').slice(2, 5).map(line => line.trim().slice(0, 80)).join(' < ')])
    for (const how of ['pushState', 'replaceState']) {
      const original = history[how].bind(history)
      history[how] = (state, title, url) => { note(how, url); return original(state, title, url) }
    }
    window.addEventListener('popstate', () => note('popstate', location.href))
  })()`)
}

/** Starts SITL, the proxy in front of it and the app, and points the app at the proxy. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  proxy = await FlakyProxy.start(sitl.endpoint)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await recordAddressChanges(app)
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(proxy.port) })
}

/**
 * Stops a simulator or the proxy, if it was started.
 *
 * @param thing what to stop
 */
async function stopIt(thing: { stop(): Promise<unknown> } | undefined): Promise<void> {
  await thing?.stop()
}

/** Stops what is running. */
async function stopAll(): Promise<void> {
  await app?.close()
  await Promise.all([proxy, other, sitl].map(stopIt))
}

/** The cable is pulled and the app says it is bringing the link back. */
async function cutAndSeeReconnecting(): Promise<void> {
  cable().cut()
  await window().waitForText('#connection', /reconnecting/u, RECONNECT_MS)
}

/** The cable is plugged in and the app says it is the same vehicle. */
async function restoreAndSeeResumed(): Promise<void> {
  cable().restore()
  await window().waitForText('#connection', 'reconnected to the same vehicle', RECONNECT_MS)
}

/**
 * What the page looks like, for a test that has just failed to see the list (issue #343: `#list-status` stayed empty): the
 * link, every element called `#list-status`, how many rows there are, which screen is shown, and whether the page is visible.
 *
 * @returns lines of text for the failure message
 */
async function describePage(): Promise<string> {
  try {
    return await window().evaluate<string>(`JSON.stringify({
      connection: document.querySelector('#connection')?.innerText,
      statuses: [...document.querySelectorAll('#list-status')].map(e => [e.textContent, e.outerHTML.slice(0, 120)]),
      rows: document.querySelectorAll('#rows tr').length,
      hash: location.hash,
      hashes: window.__hashes,
      hidden: document.hidden,
      error: document.querySelector('.error')?.textContent,
    })`)
  } catch (error) {
    return `(the page could not be read: ${String(error)})`
  }
}

/**
 * Shows the parameters and waits for the list's status. If the window is on another screen when the time is up (issue #343:
 * after a reconnect it was on Setup, next to Parameters, with no list on it), the screen is asked for again; the last
 * attempt has as long as a reconnect needs, and fails with what the page looks like.
 *
 * @param wanted what the status must say
 * @param left how many attempts remain
 * @returns the status
 */
async function listStatusOnScreen(wanted: RegExp, left: number): Promise<string> {
  await showScreen(window(), 'parameters')

  try {
    return await window().waitForText('#list-status', wanted, left === 1 ? LAST_LIST_MS : RESHOW_AFTER_MS)
  } catch (error: unknown) {
    if (left === 1) {
      throw new Error(`${String(error)}\n${await describePage()}`, { cause: error })
    }

    return listStatusOnScreen(wanted, left - 1)
  }
}

/**
 * Shows the parameters and waits until they are a whole list: the count it had before, or any count the first time.
 *
 * @returns how many parameters there are
 */
async function seeWholeList(): Promise<number> {
  const known = counts.at(-1)
  const wanted = new RegExp(`^${known ?? '\\d+'} parameters$`, 'u')
  const status = await listStatusOnScreen(wanted, SHOW_ATTEMPTS)
  const count = Number.parseInt(status, 10)
  counts.push(count)

  return count
}

/**
 * Writes the parameter through the screen, as a user does, up to the confirmation.
 *
 * @param from the value it has
 * @param to the value to write
 */
async function askToWrite(from: number, to: number): Promise<void> {
  await window().click(ROW)
  await window().fill('#draft', String(to))
  await window().click('#write')
  await window().waitForText('#question', `Set ${PARAM} from ${from} to ${to}?`)
  await confirmWrite(window())
}

/**
 * The value of a parameter in the table.
 *
 * @param id the parameter (the one the checks write, by default)
 * @returns the number
 */
async function valueOnScreen(id = PARAM): Promise<number> {
  return Number(await window().text(`tr[data-id="${id}"] td.num`))
}

/** Connects through the proxy and downloads the whole list, of a quadcopter (FRAME_CLASS 1). */
async function connectsAndDownloads(): Promise<void> {
  await clickConnect(window())
  expect(await window().waitForText('#connection', 'connected · system', RECONNECT_MS)).toMatch(/QUADROTOR/u)
  expect(await seeWholeList()).toBeGreaterThanOrEqual(300)
  expect(await valueOnScreen('FRAME_CLASS')).toBe(1)
}

/** The cable pulled during telemetry: the last values stay, marked, and the same vehicle comes back. */
async function resumesAfterTelemetryCut(): Promise<void> {
  await showScreen(window(), 'flight')
  await window().waitForText('#telemetry', /BATTERY\s*\d/u, RECONNECT_MS)
  await cutAndSeeReconnecting()
  expect(await window().text('#connection')).toMatch(/try 1, the next in \d+ s/u)
  // The display says it in its picture: its tag is text inside the SVG.
  expect(await window().evaluate<string>(`document.querySelector('.hud').textContent`)).toMatch(/last heard, reconnecting/u)
  expect(await window().text('#telemetry')).toMatch(/last heard/u)
  await restoreAndSeeResumed()
  await window().waitFor(`!document.querySelector('.hud').textContent.includes('last heard, reconnecting')`, RECONNECT_MS)
  await seeWholeList()
}

/**
 * The cable pulled in the middle of a download (after a number of the vehicle's bytes, not after a pause): the screen was
 * downloading when it happened, and ends with the whole list, the same size as before.
 */
async function resumesAfterDownloadCut(): Promise<void> {
  await showScreen(window(), 'parameters')
  const before = counts.at(-1)
  const pulled = cable().cutAfter(DOWNLOAD_CUT_BYTES)
  await window().click('#refresh')
  await window().waitForText('#list-status', /Downloading the parameters/u, RECONNECT_MS)
  await pulled
  await window().waitForText('#connection', /reconnecting/u, RECONNECT_MS)
  await restoreAndSeeResumed()
  expect(await seeWholeList()).toBe(before)
}

/**
 * The cable pulled just after a write: the list shows the vehicle's read-back or the page says (an alert) that it was not
 * confirmed (never nothing), and the vehicle has the old value or the new one, the new one if it was read back. The value is
 * put back.
 */
async function resumesAfterWriteCut(): Promise<void> {
  await showScreen(window(), 'parameters')
  const original = await valueOnScreen()
  await askToWrite(original, original + STEP)
  await cutAndSeeReconnecting()
  // "Writing…" goes when the vehicle answers or the write fails. What is left is never nothing: a write that was read back
  // shows the vehicle's value in the list (and says nothing), one that was not is an alert.
  const status = `document.querySelector('#detail .notice[role="status"]').textContent`
  await window().waitFor(`!${status}.includes('Writing')`, RECONNECT_MS)
  const said = await window().text('#detail .notice[role="alert"]')
  if (said === '') {
    expect(await valueOnScreen()).toBe(original + STEP)
  } else {
    expect(said).toMatch(/Not confirmed|The vehicle reports/u)
  }
  await restoreAndSeeResumed()
  await seeWholeList()
  const after = await valueOnScreen()
  expect([original, original + STEP]).toContain(after)

  if (said === '') {
    expect(after).toBe(original + STEP)
  }

  if (after !== original) {
    await askToWrite(after, original)
    await waitForWritten(window(), ROW, original, RECONNECT_MS)
  }
  expect(await valueOnScreen()).toBe(original)
}

/**
 * A vehicle that goes quiet on a link that stays up (nothing is cut or closed): after 5 s without a heartbeat the app
 * gives the link up for the moment, opens it again, and finds the same vehicle when it speaks.
 */
async function givesUpASilentLink(): Promise<void> {
  cable().mute()
  const text = await window().waitForText('#connection', /no heartbeat/u, RECONNECT_MS)
  expect(text).toMatch(/reconnecting/u)
  cable().unmute()
  await window().waitForText('#connection', 'reconnected to the same vehicle', RECONNECT_MS)
  await seeWholeList()
}

/** Another vehicle behind the same address: a new connection, said so, and the list of a hexacopter (FRAME_CLASS 2). */
async function noticesAnotherVehicle(): Promise<void> {
  await cutAndSeeReconnecting()
  await stopIt(sitl)
  other = await startSitl({ vehicle: 'copter', frame: 'hexa' })
  cable().retarget(other.endpoint)
  cable().restore()
  const text = await window().waitForText('#connection', /HEXAROTOR/u, RECONNECT_MS)
  expect(text).toMatch(/not the one that was connected/u)
  expect(text).not.toMatch(/reconnected to the same vehicle/u)
  counts.splice(0)
  await seeWholeList()
  expect(await valueOnScreen('FRAME_CLASS')).toBe(2)
}

/** Registers the checks. */
function registerChecks(): void {
  beforeAll(startAll, LONG_MS)
  afterAll(stopAll)
  it('connects through the proxy and downloads the whole list', connectsAndDownloads, LONG_MS)
  it('keeps the last telemetry, marked, while the link is cut, and resumes the same vehicle', resumesAfterTelemetryCut, LONG_MS)
  it('a link cut in the middle of a parameter download ends with the whole list again', resumesAfterDownloadCut, LONG_MS)
  it('a link cut just after a write says read back or not confirmed', resumesAfterWriteCut, LONG_MS)
  it('a vehicle that goes quiet on a link that stays up is given up after 5 s and found again', givesUpASilentLink, LONG_MS)
  it('another vehicle behind the same address is a new connection, and says so', noticesAnotherVehicle, LONG_MS)
  it('closes cleanly while connected', async () => {
    expect(await window().close()).toBe(0)
  })
}

describeSitl('reconnecting to ArduPilot SITL through a link that is cut', registerChecks, { launchOnly: true })
