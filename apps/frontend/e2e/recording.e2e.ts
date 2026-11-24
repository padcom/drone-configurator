// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port: every connection is
// recorded (#30). While connected, Settings says which file the link is recorded to; once the link ends, the recording carries
// its CRC-32 in its name, holds the frames of both sides with their times, and is in Logs > Flights as a recording of this app,
// verified. A folder that cannot be made stops the recording: the notice under the top bar says so in words, the link carries
// on, and the notice is dismissed from the keyboard.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp, presetSettings } from './launch'
import { RECORDINGS, crcMatches, endedRecordings, framesOf } from './recordings'
import { TcpVehicle } from './tcp-vehicle'

let vehicle: TcpVehicle | undefined
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

/**
 * Presses Enter on the focused element, as the host receives a typed key (with its text: a carriage return, which is what makes
 * a button act).
 */
async function pressEnter(): Promise<void> {
  const event = {
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r',
  }
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/** Connects to the vehicle, and waits until it is. */
async function connect(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 60_000)
}

/** Ends the connection, and waits until it has. */
async function disconnect(): Promise<void> {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', /^disconnected/u)
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start()
  // (the e2e settings turn the recording off unless a test says otherwise: this one is about it)
  presetSettings([{ key: 'recording.enabled', value: 'true' }])
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
}, 240_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('records the connection, says to which file, and ends it with its checksum and both sides of the link', async () => {
  await connect()
  await showScreen(window(), 'settings')
  const said = await window().waitForText('#recording-status', /^Recording to \d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.tlog: /u, 20_000)
  console.info(`recording: Settings says: ${said}`)
  // a few seconds of the link
  await pause(3000)
  await disconnect()
  await until(() => endedRecordings().length === 1, 'the recording to end')
  const [name = ''] = endedRecordings()

  expect(crcMatches(RECORDINGS, name)).toBe(true)
  const frames = framesOf(join(RECORDINGS, name))
  console.info(`recording: ${name} holds ${frames.length} frames`)
  expect(frames.length).toBeGreaterThan(20)
  // the vehicle's (system 1) and this app's (system 255: its heartbeats)
  expect(frames.some(frame => frame.sysid === 1)).toBe(true)
  expect(frames.some(frame => frame.sysid === 255 && frame.msgid === 0)).toBe(true)
  // dated now, in order
  const first = frames[0]?.timeUs ?? 0
  expect(Math.abs(first / 1000 - Date.now())).toBeLessThan(120_000)
  expect(frames.every((frame, i) => i === 0 || frame.timeUs >= (frames[i - 1]?.timeUs ?? 0))).toBe(true)
  await window().waitForText('#recording-status', 'Recording starts with the next connection.')
}, 120_000)

it('lists the recording in Flights as one of this app, and opens it verified', async () => {
  await showScreen(window(), 'logs')
  await window().click('a[href="#/logs/flights"]')
  const row = 'table.flights-table tbody tr[data-key^="recorded/"]'
  await window().waitFor(`document.querySelector('${row}') !== null`, 20_000)

  expect(await window().text(`${row} th`)).toMatch(/^Recorded /u)
  await window().click(`${row} .flights-open`)
  await window().waitFor(`document.querySelector('.flight-detail') !== null && document.querySelector('.flight-reading') === null
    && document.querySelector('#flights-imported-mark') !== null`, 60_000)

  expect(await window().text('#flights-imported-mark')).toContain('Recorded by this app')
  expect(await window().text('.flight-detail-title')).toMatch(/^Recording of /u)
  expect(await window().evaluate<boolean>(`document.querySelector('#flights-not-verified') === null`)).toBe(true)
  await window().waitForText(`${row} .flights-state`, 'Recorded, file intact')
}, 120_000)

it('says in words when the recording cannot be made, the link carries on, and its notice goes from the keyboard', async () => {
  // a file where the folder would be
  const blocked = join(home, 'blocked')
  writeFileSync(blocked, 'not a folder')
  await showScreen(window(), 'settings')
  await window().fill('#recording-folder', join(blocked, 'recordings'))
  const inUse = `In use: ${join(blocked, 'recordings')}`
  await window().waitFor(`document.querySelector('.settings-recording').innerText.includes(${JSON.stringify(inUse)})`)
  await connect()
  const said = await window().waitForText('#recording-notice', 'the folder cannot be used', 20_000)
  console.info(`recording: the notice says: ${said}`)

  expect(said).toContain('The link to the vehicle carries on.')
  expect(await window().evaluate<boolean>(`document.querySelector('#recording-notice .icon') !== null`)).toBe(true)
  await pause(2000)
  expect(await window().text('#connection')).toMatch(/connected · system/u)
  await window().evaluate(`document.querySelector('#dismiss-recording-notice').focus()`)
  await pressEnter()
  await window().waitFor(`getComputedStyle(document.querySelector('#recording-notice')).display === 'none'`)
  await disconnect()
}, 120_000)
