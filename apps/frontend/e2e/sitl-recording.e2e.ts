// Recording every connection (#30), against ArduPilot SITL in the real window: a session with the simulated Copter is recorded
// both ways into a tlog that reads back (its CRC-32 is the one in its name, the vehicle's heartbeats and parameters and this
// app's heartbeats are in it, in order) and opens verified in Logs > Flights. A disk that fills up (the backend's test switch
// DRONE_CONFIGURATOR_TEST_DISK_BYTES: the e2e tests do not fill a real disk) stops the recording: the notice says so in words,
// the link to the vehicle carries on, and what was written before reads back. It launches its own SITL, so it ignores
// SITL_ENDPOINT.
//
// The checks go on from one another (one SITL, one data folder): if the first fails, the rest fail for that reason.
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp, presetSettings } from './launch'
import { RECORDINGS, crcMatches, endedRecordings, framesOf } from './recordings'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** A connection, its parameter download and some telemetry. */
const SESSION_MS = 120_000
/** How many bytes a recording may hold before the "disk" is full. */
const DISK_BYTES = 20_000
/** MAVLink's HEARTBEAT, and what parameters come in: PARAM_VALUE, or FILE_TRANSFER_PROTOCOL (the vehicle's parameter file). */
const HEARTBEAT = 0
const PARAMETERS = new Set([22, 110])

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

/**
 * Waits a while.
 *
 * @param ms how long
 * @returns once it has passed
 */
const pause = (ms: number) => new Promise(resolve => {
  setTimeout(resolve, ms)
})

/**
 * Waits until something is true of the files, or fails.
 *
 * @param check what must be true
 * @param what what is waited for, for the failure
 * @param timeoutMs how long it may take
 */
async function until(check: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  if (check()) {
    return
  }
  if (timeoutMs <= 0) {
    throw new Error(`waited too long for ${what}`)
  }
  await pause(100)
  await until(check, what, timeoutMs - 100)
}

/** Starts the app (with the recording on: the e2e settings have it off unless a test says otherwise), and connects to SITL. */
async function launchAndConnect(): Promise<void> {
  if (!sitl) {
    throw new Error('SITL has not started')
  }
  presetSettings([{ key: 'recording.enabled', value: 'true' }])
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
}

/** Ends the connection, and waits until it has. */
async function disconnect(): Promise<void> {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', /^disconnected/u)
}

/** A session is recorded both ways, and the recording reads back. */
async function recordsASessionThatReadsBack(): Promise<void> {
  await launchAndConnect()
  // the parameters are downloaded at a connection: wait for them, and some telemetry after
  await showScreen(window(), 'parameters')
  await window().waitFor(`document.querySelector('#filter') !== null`, 90_000)
  await window().fill('#filter', 'BATT_CAPACITY')
  await window().waitFor(`document.querySelector('tr[data-id="BATT_CAPACITY"]') !== null`, 90_000)
  await pause(3000)
  await disconnect()
  await until(() => endedRecordings().length === 1, 'the recording to end')
  const [name = ''] = endedRecordings()
  const frames = framesOf(join(RECORDINGS, name))
  console.info(`sitl-recording: ${name} holds ${frames.length} frames`)

  expect(crcMatches(RECORDINGS, name)).toBe(true)
  expect(frames.filter(frame => frame.sysid === 1 && frame.msgid === HEARTBEAT).length).toBeGreaterThan(3)
  expect(frames.filter(frame => frame.sysid === 1 && PARAMETERS.has(frame.msgid)).length).toBeGreaterThan(10)
  expect(frames.some(frame => frame.sysid === 255 && frame.msgid === HEARTBEAT)).toBe(true)
  expect(frames.every((frame, i) => i === 0 || frame.timeUs >= (frames[i - 1]?.timeUs ?? 0))).toBe(true)
}

/** The recording opens verified in Flights, as one of this app's. */
async function opensInFlights(): Promise<void> {
  await showScreen(window(), 'logs')
  await window().click('a[href="#/logs/flights"]')
  const row = 'table.flights-table tbody tr[data-key^="recorded/"]'
  await window().waitFor(`document.querySelector('${row}') !== null`, 20_000)
  await window().click(`${row} .flights-open`)
  await window().waitFor(`document.querySelector('.flight-detail') !== null && document.querySelector('.flight-reading') === null
    && document.querySelector('#flights-imported-mark') !== null`, 120_000)
  const report = await window().text('#flights-report')
  console.info(`sitl-recording: Flights says: ${report}`)

  expect(await window().text('#flights-imported-mark')).toContain('Recorded by this app')
  expect(await window().evaluate<boolean>(`document.querySelector('#flights-not-verified') === null`)).toBe(true)
  expect(report).toContain('0 frames with a wrong checksum')
  await window().waitForText(`${row} .flights-state`, 'Recorded, file intact')
}

/** A full disk stops the recording, says so, and the link carries on; what was written reads back. */
async function aFullDiskSaysSo(): Promise<void> {
  await window().close()
  process.env.DRONE_CONFIGURATOR_TEST_DISK_BYTES = String(DISK_BYTES)
  await launchAndConnect()
  const said = await window().waitForText('#recording-notice', 'the disk is full', 30_000)
  console.info(`sitl-recording: the notice says: ${said}`)

  expect(said).toContain('The link to the vehicle carries on.')
  expect(said).toContain('Free some space')
  await pause(3000)
  expect(await window().text('#connection')).toMatch(/connected · system/u)
  await disconnect()
  await until(() => endedRecordings().length === 2, 'the cut recording to end')
  // (the names are by when the recordings started: the cut one is the second)
  const [, cut = ''] = endedRecordings()

  expect(crcMatches(RECORDINGS, cut)).toBe(true)
  expect(framesOf(join(RECORDINGS, cut)).length).toBeGreaterThan(0)
}

describeSitl('recording every connection, against ArduPilot SITL', () => {
  beforeAll(async () => {
    sitl = await startSitl({ vehicle: 'copter' })
  }, 120_000)
  afterAll(async () => {
    delete process.env.DRONE_CONFIGURATOR_TEST_DISK_BYTES

    try {
      await app?.close()
    } finally {
      await sitl?.stop()
    }
  })

  it('records a session both ways into a tlog that reads back', recordsASessionThatReadsBack, 2 * SESSION_MS)
  it('opens the recording verified in Flights, as one of this app', opensInFlights, SESSION_MS)
  it('says the disk is full, the link carries on, and what was written reads back', aFullDiskSaysSo, SESSION_MS)
}, { launchOnly: true })
