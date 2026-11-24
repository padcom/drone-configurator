// WEEKLY ONLY (.github/workflows/weekly-e2e.yml; the `weekly-` name keeps it out of every pull request's and push's CI, see
// .github/ci-select.mjs `WEEKLY_SPEC`): it depends on GitHub, which must not block a change, and answers 60 requests an hour from
// an address without an account. Every pull request has frame-presets.e2e.ts and sitl-frame-presets.e2e.ts instead, against a
// local stand-in.
//
// ArduPilot's frame presets (#41) from GitHub ITSELF, applied to ArduPilot SITL (Copter over TCP) in the real window with the
// real backend: the list of `Tools/Frame_params` at the vehicle's firmware tag (or master, and the page says which: one request
// to GitHub's API), a published Copter preset fetched from the raw files, its changes under review, written after the
// confirmation and read back. Nothing of ArduPilot's GPL presets is in the repository: they are fetched while the test runs.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { openPalette } from './palette-keys'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long a connection, a download or a write may take. */
const WAIT_MS = 90_000
/** A Copter preset ArduPilot has published for years (a quad on a common frame), and the next to try when it is gone. */
const WANTED = ['Holybro-S500', 'Holybro-X500v2', 'hexsoon-edu450']

let sitl: Sitl | undefined
let app: E2eApp | undefined

/**
 * The window.
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

/** Starts SITL and the app, connects, and waits for the parameters. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: sitl.endpoint.host, port: String(sitl.endpoint.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', WAIT_MS)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters$/u, WAIT_MS)
}

/** Stops what was started. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * The paths of the presets listed.
 *
 * @returns them
 */
const listed = () => window().evaluate<string[]>(
  `[...document.querySelectorAll('#presets [data-path]')].map(row => row.dataset.path)`,
)

/** Lists the presets from GitHub, and applies a published one through the review. */
async function appliesAPublishedPreset(): Promise<void> {
  await openPalette(window())
  await window().fill('#palette-input', 'frame presets')
  await window().waitFor(`document.querySelector('[data-command="params.presets"]') !== null`)
  await window().click('[data-command="params.presets"]')
  await window().waitFor(`document.querySelector('#presets-source, #presets-error') !== null`, WAIT_MS)
  expect(await window().evaluate<string>(`document.querySelector('#presets-error')?.textContent ?? ''`)).toBe('')
  console.info(`the presets: ${await window().text('#presets-source')}`)
  expect(await window().text('#presets-source'))
    .toMatch(/^From ArduPilot (?:Copter-\d+\.\d+\.\d+, the vehicle's firmware|master: )/u)

  const all = await listed()
  const path = WANTED.map(name => all.find(candidate => candidate.endsWith(`${name}.param`))).find(Boolean)
  expect(path).toBeDefined()
  console.info(`applying ${path}`)
  await window().fill('#presets-search', path ?? '')
  await window().click(`#presets [data-path="${path}"]`)
  await window().waitFor(`(document.querySelector('#preset-text')?.textContent ?? '').length > 0`, WAIT_MS)
  await window().waitForText('#presets', 'Every change is shown for review', WAIT_MS)
  await window().click('#preset-review')

  await window().waitForText('#import h3', /^Frame preset: /u, WAIT_MS)
  const ticked = await window().evaluate<number>(`document.querySelectorAll('#import input[data-pick]:checked').length`)
  console.info(`${ticked} changes ticked: ${await window().text('.review-head p')}`)
  expect(ticked).toBeGreaterThan(0)
  await window().click('#apply')
  await window().waitFor(`document.querySelector('#question') !== null`)
  await confirmWrite(window())
  await window().waitFor(`!/Writing/u.test(document.querySelector('#import-panel .review-status')?.textContent ?? '')`, WAIT_MS)
  await window().waitForText('#import-panel', 'All written and read back.', WAIT_MS)
}

describeSitl('a published frame preset from GitHub, applied to SITL', () => {
  beforeAll(startAll, 180_000)
  afterAll(stopAll)

  it('lists ArduPilot\'s presets and applies a published one through the review', appliesAPublishedPreset, 300_000)
})
