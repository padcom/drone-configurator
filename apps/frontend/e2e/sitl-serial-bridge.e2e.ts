// The serial bridge (#198) against ArduPilot SITL, through the real backend and the real window: SITL's SERIAL1 is a TCP port,
// and this test holds it as the DEVICE at the far end of the serial line (a GPS, a radio). The bridge takes SERIAL1 with
// SERIAL_CONTROL and puts it on a local TCP port, where a program (a socket of this test) connects: what the program writes
// comes out of SERIAL1, what the device sends reaches the program, and while the bridge holds the port ArduPilot sends no MAVLink
// on it.
// Stop gives SERIAL1 back, and ArduPilot speaks MAVLink on it again.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { Program, freePort, listening, openSetupPage, pressEnter, until } from './local-program'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, the connection and the parameters. */
const STARTUP_MS = 240_000
/** The magic byte of a MAVLink 2 frame: what ArduPilot sends on SERIAL1 when it is its own. */
const MAVLINK2 = 0xFD

let sitl: Sitl | undefined
let app: E2eApp | undefined
let device: Program | undefined
let program: Program | undefined
let localPort = 0

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
 * The device at the far end of SERIAL1.
 *
 * @returns it
 * @throws {Error} before it is connected
 */
function theDevice(): Program {
  if (!device) {
    throw new Error('the device is not connected')
  }

  return device
}

/**
 * Waits `ms`.
 *
 * @param ms how long
 */
async function pause(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad' })
  const { transport, host, port } = sitl.endpoint
  // SERIAL1 is two above SERIAL0: the device is there before the bridge (it hears MAVLink until the bridge takes the port)
  device = new Program(port + 2)
  localPort = await freePort()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'setup')
  await app.waitFor(`document.querySelector('#setup-progress') !== null`, 120_000)
}

/** Closes the program and the device. */
function closeSockets(): void {
  for (const socket of [program, device]) {
    socket?.close()
  }
}

async function stopAll(): Promise<void> {
  closeSockets()

  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

async function hearsMavLinkBeforeTheBridge(): Promise<void> {
  await until('SERIAL1 speaks MAVLink to the device', () => theDevice().bytes.includes(MAVLINK2), 20_000)
}

async function takesSerial1(): Promise<void> {
  await openSetupPage(window(), 'bridge')
  // a vehicle known to be disarmed: its heartbeat has come
  await window().waitFor(`document.querySelector('#setup-bridge-start')?.disabled === false`, 60_000)
  await window().fill('[data-bridge="device"]', 'SERIAL1')
  await window().fill('[data-bridge="baud"]', '57600')
  await window().fill('[data-bridge="port"]', String(localPort))
  await window().click('#setup-bridge-start')

  await window().waitFor(`document.querySelector('#setup-bridge-locked') !== null`, 10_000)
  expect(await window().text('#setup-bridge-locked')).toContain('Serial 1 is locked for the bridge until you stop it')
  expect(await window().text('#serial-bridge-badge')).toContain('Serial 1 locked')
}

async function passesBytesBothWays(): Promise<void> {
  program = new Program(localPort)
  await window().waitForText('#setup-bridge-client', 'Connected from 127.0.0.1:', 10_000)
  // what was on its way when the port was taken has arrived by now
  await pause(1000)
  const mark = theDevice().bytes.length
  const ping = Buffer.from(Array.from({ length: 150 }, (_, i) => 65 + i % 26))
  program.socket.write(ping)
  const out = await theDevice().reads(ping, 10_000, mark)
  // while the bridge holds SERIAL1, ArduPilot sends no MAVLink on it: only the letters written came out
  expect(out.includes(MAVLINK2)).toBe(false)

  const pong = 'PONG from the device at the far end of SERIAL1'
  theDevice().socket.write(pong)
  await program.reads(pong, 10_000)
  await window().waitForText('#setup-bridge-to', /^150$/u, 5000)
  const from = Number(await window().text('#setup-bridge-from'))
  expect(from).toBeGreaterThanOrEqual(pong.length)
}

async function givesSerial1BackOnStop(): Promise<void> {
  await window().evaluate(`document.querySelector('#setup-bridge-stop').focus()`)
  await pressEnter(window())
  await window().waitFor(`document.querySelector('#setup-bridge-locked') === null`, 15_000)
  expect(await window().text('#setup-bridge-said')).toContain('Serial 1 is the vehicle\'s own again.')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-bridge-unreleased') === null`)).toBe(true)
  expect(await window().evaluate<boolean>(`document.querySelector('#serial-bridge-badge') === null`)).toBe(true)
  await until('the program is let go', () => program?.ended === true)
  expect(await listening(localPort)).toBe(false)
  // ArduPilot has SERIAL1 back: it speaks MAVLink on it again
  const mark = theDevice().bytes.length
  await until('SERIAL1 speaks MAVLink again', () => theDevice().bytes.subarray(mark).includes(MAVLINK2), 15_000)
}

describeSitl(
  'the serial bridge against ArduPilot SITL: SERIAL1 on a local TCP port, both ways, and given back',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)

    it('hears MAVLink on SERIAL1 before the bridge takes it', hearsMavLinkBeforeTheBridge, 30_000)
    it('takes SERIAL1 and says it is locked', takesSerial1, 90_000)
    it('passes bytes both ways, and no MAVLink is sent on the port while it is held', passesBytesBothWays, 60_000)
    it('gives SERIAL1 back on Stop (from the keyboard): ArduPilot speaks MAVLink on it again', givesSerial1BackOnStop, 60_000)
  },
  { launchOnly: true },
)
