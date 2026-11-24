// The list the backend keeps of each vehicle across sessions (#38), in the real window with the real backend and the simulated
// vehicle: after a complete download, the next connection to the same vehicle shows that list while its own download runs, and
// the line under the list says that it is the vehicle's last download and that the current values are on their way; the
// download then replaces it, and the line says how it came. What the backend keeps, and when, is in its tests
// (paramstore.test.pi); what the parameters do with it, in useParamsCache.test.ts.
//
// The checks go on from one another (one app): if the first fails, the rest fail for that reason.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

const LONG_MS = 60_000

let app: E2eApp | undefined

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

/** Connects the simulated vehicle and waits for its whole list. */
async function connectAndDownload(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', LONG_MS)
  await window().waitForText('#list-status', '12 parameters', LONG_MS)
}

/**
 * Starts keeping every text the line under the list shows, however briefly (the simulated vehicle's download is quick).
 *
 * @returns once it is watched
 */
async function recordTheLine(): Promise<void> {
  await window().evaluate(`(() => {
    window.__lines = []
    const keep = () => {
      const text = document.querySelector('#download-status')?.textContent ?? ''
      if (text !== '' && window.__lines.at(-1) !== text) window.__lines.push(text)
    }
    new MutationObserver(keep).observe(document.body, { subtree: true, childList: true, characterData: true })
  })()`)
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'parameters')
}, 120_000)

afterAll(async () => {
  await app?.close()
})

it('downloads the list of a vehicle once', async () => {
  await connectAndDownload()

  expect(await window().text('#download-status')).toMatch(/^Parameters: 12 · by file transfer in \d+(?:\.\d)? s$/u)
}, LONG_MS)

it('shows the kept list at the next connection while the download runs, then the downloaded one', async () => {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', /^disconnected/u)
  await recordTheLine()

  await connectAndDownload()
  await window().waitForText('#download-status', /by file transfer in/u, LONG_MS)

  const lines = await window().evaluate<string[]>('window.__lines')
  const keptLine = /^Parameters: 12 · from this vehicle's last download, .+\. Downloading the current values…$/u
  const kept = lines.findIndex(line => keptLine.test(line))
  expect(kept, lines.join('\n')).toBeGreaterThanOrEqual(0)
  // After it, the line of the download that replaced it (the one before it is the last session's).
  expect(lines.slice(kept + 1).some(line => /^Parameters: 12 · by file transfer in /u.test(line)), lines.join('\n')).toBe(true)
  // The list is the downloaded one, with its initial values: the kept one never is.
  await window().waitForText('#initial-status', /^Initial values: downloaded \d\d:\d\d:\d\d$/u)
}, LONG_MS)
