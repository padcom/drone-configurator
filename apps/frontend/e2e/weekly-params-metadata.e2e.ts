// WEEKLY ONLY (.github/workflows/weekly-e2e.yml; the `weekly-` name keeps it out of every pull request's CI): it depends on
// ArduPilot's real server. Every pull request has sitl-params.e2e.ts instead, against a local stand-in.
//
// The parameter table (#36) against ArduPilot SITL (Copter), in the real window with the real backend and the REAL metadata,
// downloaded from ArduPilot's server for the vehicle's version (#35): the checks of param-table-checks.ts over a real Copter's
// list and ArduPilot's own descriptions, users and groups. Nothing of the GPL data set is in the repository.
import { afterAll, beforeAll } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { paramTableTests } from './param-table-checks'
import { type E2eApp, launchApp, presetSettings } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long the connection, the download of the parameters and of the metadata (a few MB from ArduPilot's server) may take. */
const READY_MS = 180_000

let sitl: Sitl | undefined
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

/** Starts SITL and the app, connects, and waits for the parameters and their metadata. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  presetSettings([{ key: 'metadata.download', value: 'on' }, { key: 'params.groups', value: 'on' }])
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters/u, 90_000)
  await app.waitFor(`document.querySelector('.param-scroll table.described') !== null`, READY_MS)
}

/** Stops what was started: the SITL also when the app does not close. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

describeSitl('the parameter table against SITL, with the real metadata from ArduPilot\'s server', () => {
  beforeAll(startAll, READY_MS + 120_000)
  afterAll(stopAll)
  paramTableTests(window)
}, { launchOnly: true })
