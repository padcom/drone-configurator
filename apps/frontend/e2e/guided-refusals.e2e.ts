// End to end, in the real window with the real backend and a SCRIPTED vehicle behind a TCP port (e2e/scripted-vehicle.ts: it
// notes EVERY command it is sent): what stops CHANGE ALTITUDE and SET HOME HERE, and that nothing is sent when they are stopped.
//  - A vehicle that MOVES (over 3 m/s over the ground) cannot change altitude, and one that is not standing still (over 1 m/s
//    over the ground, or 0.5 m/s up or down) cannot set home: both buttons are off and say why in words.
//  - A change of altitude ABOVE THE VEHICLE'S FENCE (FENCE_ENABLE 1, FENCE_ALT_MAX 25, and 30 m is asked for) is refused by
//    the backend, which reads the fence itself: the page says so and no DO_REPOSITION is sent.
//  - A vehicle whose parameter list is NOT COMPLETE (it says it has two more than it ever sends) is not offered guided control:
//    the buttons say that the list must be downloaded first.
// What ArduPilot does is sitl-guided.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'
import { sleep } from './strip'

/** MAV_CMD_DO_SET_HOME and MAV_CMD_DO_REPOSITION. */
const SET_HOME = 179
const REPOSITION = 192
const HOME = { lat: 52.2297, lon: 21.0122 }
const STILL = { lat: HOME.lat, lon: HOME.lon, heading: 0, height: 20 }

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
 * How many times the vehicle was sent one command.
 *
 * @param command the MAV_CMD
 * @returns how many
 */
function sent(command: number): number {
  return scripted().received().filter(received => received.command === command).length
}

/**
 * The words a button says it is off for ('' while it is on).
 *
 * @param id the button's id
 * @returns the reason
 */
function reasonExpression(id: string): string {
  return `(() => {
    const button = document.querySelector('${id}')
    const reason = button?.getAttribute('aria-describedby')

    return button?.getAttribute('aria-disabled') === 'true' && reason ? document.getElementById(reason)?.textContent ?? '' : ''
  })()`
}

/**
 * Waits until a button is off for words that contain `words`.
 *
 * @param id the button's id
 * @param words what its reason says
 * @param ms how long to wait
 */
async function saysOffFor(id: string, words: string, ms = 20_000): Promise<void> {
  await window().waitFor(`${reasonExpression(id)}.includes(${JSON.stringify(words)})`, ms)
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  vehicle.position(STILL)
  vehicle.home(HOME)
  vehicle.arm(true)
  // the GCS failsafe is on and there is no fence (yet)
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

it('is off for both buttons while the vehicle moves, each with its words, and presses send nothing', async () => {
  scripted().position({ ...STILL, velocity: { north: 5, east: 0, down: 0 } })
  await saysOffFor('#guided-altitude', 'The vehicle is moving')
  await saysOffFor('#guided-home', 'must stand still')
  await window().click('#guided-altitude')
  await window().click('#guided-home')
  await sleep(700)

  expect(await window().evaluate<boolean>(`document.querySelector('#altitude-field') === null`)).toBe(true)
  expect(await window().evaluate<boolean>(`document.querySelector('#confirm-hold') === null`)).toBe(true)
  expect(sent(REPOSITION)).toBe(0)
  expect(sent(SET_HOME)).toBe(0)
})

it('lets a vehicle that only climbs change altitude (it does not move over the ground) but not set home', async () => {
  scripted().position({ ...STILL, velocity: { north: 0, east: 0, down: -1 } })
  await saysOffFor('#guided-home', 'must stand still')
  await window().waitFor(`${reasonExpression('#guided-altitude')} === ''`, 20_000)
  await window().click('#guided-home')
  await sleep(500)

  expect(await window().evaluate<boolean>(`document.querySelector('#confirm-hold') === null`)).toBe(true)
  expect(sent(SET_HOME)).toBe(0)
})

it('refuses an altitude above the vehicle\'s fence in words, and sends no reposition', async () => {
  scripted().position(STILL)
  await window().waitFor(`${reasonExpression('#guided-altitude')} === ''`, 20_000)
  // a fence on the maximum altitude (bit 0 of FENCE_TYPE) of 25 m: the backend reads it at the change of altitude
  scripted().params({ FS_GCS_ENABLE: 1, FENCE_ENABLE: 1, FENCE_TYPE: 1, FENCE_ALT_MAX: 25 })
  await window().click('#guided-altitude')
  await window().waitFor(`document.querySelector('#altitude-field') !== null`, 10_000)
  await window().fill('#altitude-field', '30')
  await window().waitFor(`document.querySelector('#altitude-go').dataset.armed === 'true'`, 10_000)
  await window().click('#altitude-go')
  await window().waitFor(`document.body.innerText.includes("beyond the limits in Settings or the vehicle's own fence")`, 20_000)
  await sleep(500)

  expect(sent(REPOSITION)).toBe(0)
})

it('does not offer Change altitude while the parameter list is not complete, and says to download it', async () => {
  scripted().params({ FS_GCS_ENABLE: 1, FENCE_ENABLE: 0 })
  scripted().lacking(2)
  // the link drops, and the page takes the vehicle up again with a new list, which stays incomplete
  scripted().cut()
  await saysOffFor('#guided-altitude', 'complete list of the vehicle\'s parameters', 120_000)
  // (setting home looks at no parameter: the vehicle's own place is all it takes)
  await window().click('#guided-altitude')
  await sleep(500)

  expect(await window().evaluate<boolean>(`document.querySelector('#altitude-field') === null`)).toBe(true)
  expect(sent(REPOSITION)).toBe(0)
  expect(sent(SET_HOME)).toBe(0)
})
