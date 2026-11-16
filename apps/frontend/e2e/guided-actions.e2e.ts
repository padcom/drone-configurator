// End to end, in the real window with the real backend and a SCRIPTED vehicle behind a TCP port (e2e/scripted-vehicle.ts: it
// notes EVERY
// command it is sent): the two guided commands that need no place on the map. CHANGE ALTITUDE (a button beside the map) opens
// a dialog that
// proposes the altitude the vehicle is at; once it is pressed (after the first moments) the vehicle is put in GUIDED and ONE
// change of
// altitude goes, to the place the backend itself heard. SET HOME HERE asks a HOLD that says that Return home now flies there:
// turning it down
// sends nothing; holding it sends DO_SET_HOME once, to where the vehicle is. What ArduPilot does is sitl-guided.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { chord } from './palette-keys'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'
import { Strip, sleep } from './strip'

/** MAV_CMD_DO_SET_MODE, MAV_CMD_DO_SET_HOME and MAV_CMD_DO_REPOSITION. */
const SET_MODE = 176
const SET_HOME = 179
const REPOSITION = 192
const HOME = { lat: 52.2297, lon: 21.0122 }
/** How long the page ignores presses on a question (400 ms) with a margin. */
const IGNORES_MS = 550

let vehicle: ScriptedVehicle | undefined
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
 * The vehicle under test.
 *
 * @returns the vehicle
 * @throws {Error} before it has started
 */
function scripted(): ScriptedVehicle {
  if (!vehicle) {
    throw new Error('the vehicle has not started')
  }

  return vehicle
}

/**
 * What the vehicle was sent of one command, in order.
 *
 * @param command the MAV_CMD
 * @returns the parameters of each
 */
function got(command: number): number[][] {
  return scripted().received().filter(received => received.command === command).map(received => received.params)
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  vehicle.position({ lat: HOME.lat, lon: HOME.lon, heading: 0, height: 20 })
  vehicle.home(HOME)
  vehicle.arm(true)
  // the GCS failsafe is on and there is no fence
  vehicle.params({ FS_GCS_ENABLE: 1, FENCE_ENABLE: 0 })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
  await app.waitFor(`document.querySelector('.map-vehicle') !== null`, 30_000)
  await sleep(1500)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('opens a dialog that proposes the altitude the vehicle is at, and sends nothing when it is turned down', async () => {
  await window().click('#guided-altitude')
  await window().waitFor(`document.querySelector('#altitude-field') !== null`, 10_000)

  expect(await window().evaluate<string>(`document.querySelector('#altitude-field').value`)).toBe('20')
  expect(await window().text('#altitude-what')).toContain('GUIDED first')
  await window().click('#altitude-cancel')
  await window().waitFor(`document.querySelector('#altitude-field') === null`, 10_000)

  expect(got(REPOSITION)).toEqual([])
})

it('puts the vehicle in GUIDED and sends ONE change of altitude to the place the backend heard', async () => {
  await window().click('#guided-altitude')
  await window().waitFor(`document.querySelector('#altitude-field') !== null`, 10_000)
  await window().fill('#altitude-field', '30')
  await window().waitFor(`document.querySelector('#altitude-go').dataset.armed === 'true'`, 10_000)
  await window().click('#altitude-go')
  await window().waitFor(`document.querySelector('#altitude-field') === null`, 10_000)
  await sleep(1500)
  const [change = []] = got(REPOSITION)

  expect(got(SET_MODE).some(params => params[1] === 4)).toBe(true)
  expect(got(REPOSITION)).toHaveLength(1)
  // the place the vehicle is at (degrees times 1e7: where the backend heard it), at 30 m
  expect(Math.abs((change[4] ?? 0) - HOME.lat * 1e7)).toBeLessThan(200)
  expect(Math.abs((change[5] ?? 0) - HOME.lon * 1e7)).toBeLessThan(200)
  expect(change[6]).toBe(30)
})

it('asks a hold for Set home here that says Return home now flies there; turning it down sends nothing', async () => {
  await window().click('#guided-home')
  await window().waitFor(`document.querySelector('#confirm-hold') !== null`, 10_000)

  expect(await window().text('#question')).toContain('Return home (RTL) flies to this point from now on')
  await sleep(IGNORES_MS)
  await chord(window(), 'Escape')
  await new Strip(window()).goes('#confirm')
  await sleep(500)

  expect(got(SET_HOME)).toEqual([])
})

it('sets home once the hold is held: one DO_SET_HOME for where the vehicle is, and says so', async () => {
  await window().click('#guided-home')
  await new Strip(window()).hold()
  await window().waitFor(`document.body.innerText.includes('Home is set here')`, 15_000)

  expect(got(SET_HOME)).toHaveLength(1)
  // "here": the vehicle's own place (param1 1)
  expect(got(SET_HOME)[0]?.[0]).toBe(1)
})
