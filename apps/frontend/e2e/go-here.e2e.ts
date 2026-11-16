// End to end, in the real window with the real backend and a SCRIPTED vehicle behind a TCP port (e2e/scripted-vehicle.ts: it
// notes EVERY
// command it is sent): Go here. A click on the map picks a place (a ring on the map and a card that says how far it is); Go
// here asks a
// plain confirmation by default (Cancel sends nothing); once it is confirmed the vehicle is put in GUIDED, its speed is set,
// and ONE
// reposition goes to the place that was picked, at the altitude the vehicle has. With the vehicle's GCS failsafe off the
// command is
// refused and the vehicle is sent NOTHING. What ArduPilot does with these commands is sitl-guided.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'
import { sleep } from './strip'

/** MAV_CMD_DO_SET_MODE, MAV_CMD_DO_CHANGE_SPEED and MAV_CMD_DO_REPOSITION. */
const COMMANDS = [176, 178, 192]
const HOME = { lat: 52.2297, lon: 21.0122 }
/** How long the page ignores presses on a confirmation (400 ms) with a margin. */
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
 * The commands of a Go here that the vehicle was sent so far.
 *
 * @returns their numbers, in order
 */
function sent(): number[] {
  return scripted().received().map(received => received.command).filter(command => COMMANDS.includes(command))
}

/**
 * Clicks the map with a real mouse, at an offset from its middle (the vehicle is in the middle: the map follows it).
 *
 * @param dx pixels to the right
 * @param dy pixels down
 */
async function clicksTheMap(dx: number, dy: number): Promise<void> {
  const middle = await window().evaluate<{ x: number, y: number }>(`(() => {
    const box = document.querySelector('.map').getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  const at = { x: Math.round(middle.x + dx), y: Math.round(middle.y + dy) }
  const mouse = { ...at, button: 'left', buttons: 1, clickCount: 1 }
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse })
  await window().devtools('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse, buttons: 0 })
}

/**
 * The one reposition that the vehicle noted.
 *
 * @returns the command, as the vehicle noted it
 * @throws {Error} when there was not exactly one
 */
function theReposition(): { params: number[], frame?: number } {
  const goes = scripted().received().filter(received => received.command === 192)
  const [only] = goes
  if (goes.length !== 1 || !only) {
    throw new Error(`${goes.length} repositions were sent`)
  }

  return only
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  vehicle.position({ lat: HOME.lat, lon: HOME.lon, heading: 0, height: 20 })
  vehicle.home(HOME)
  vehicle.arm(true)
  // the GCS failsafe is off at first: Go here is refused until the test turns it on
  vehicle.params({ FS_GCS_ENABLE: 0, FENCE_ENABLE: 0 })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
  // (the map follows the vehicle, and says where it is: it is in the middle)
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

it('picks the place under a click: a ring on the map and a card that says how far it is', async () => {
  expect(await window().evaluate<boolean>(`document.querySelector('#go-here') === null`)).toBe(true)
  // 100 px to the right of the vehicle
  await clicksTheMap(100, 0)
  await window().waitFor(`document.querySelector('#go-here') !== null`, 10_000)

  expect(await window().evaluate<boolean>(`document.querySelector('.map-target') !== null`)).toBe(true)
  // (the card stays off the credit of the map: the credit is readable, and the first thing at its middle)
  expect(await window().evaluate<boolean>(`(() => {
    const credit = document.querySelector('#map-attribution')
    const box = credit.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return top === credit
  })()`)).toBe(true)
})

it.each([[1440, 900], [1000, 700], [999, 700]])('keeps the card\'s buttons inside a window of %i x %i', async (width, height) => {
  await window().devtools('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
  const outside = await window().evaluate<number>(`(() => {
    window.scrollTo(0, 0)
    const buttons = document.querySelector('#go-here .go-here-buttons').getBoundingClientRect()
    return Math.round(buttons.bottom - window.innerHeight)
  })()`)
  await window().devtools('Emulation.clearDeviceMetricsOverride', {})

  expect(outside, `${width}x${height}: the buttons end this many px below the window`).toBeLessThanOrEqual(0)
})

it('is refused, and sends the vehicle NOTHING, while its GCS failsafe is off', async () => {
  await window().click('#go-here-go')
  await window().waitFor(`document.querySelector('#confirm-yes') !== null`, 10_000)

  // (the distances are said once: here, not on the card)
  expect(await window().text('#question')).toMatch(/\d+ m from it and \d+ m from home/u)
  await sleep(IGNORES_MS)
  await window().click('#confirm-yes')
  await window().waitFor(`document.querySelector('#confirm') === null`, 10_000)
  await window().waitFor(`document.body.innerText.includes('FS_GCS_ENABLE')`, 15_000)

  // (the mode may have been asked for first: the failsafe is read when the reposition is)
  expect(sent().filter(command => command === 192)).toEqual([])
})

it('does nothing when the confirmation is turned down', async () => {
  const before = sent().length
  await window().click('#go-here-go')
  await window().waitFor(`document.querySelector('#confirm-cancel') !== null`, 10_000)
  await sleep(IGNORES_MS)
  await window().click('#confirm-cancel')
  await window().waitFor(`document.querySelector('#confirm') === null`, 10_000)
  await sleep(500)

  expect(sent().length).toBe(before)
})

it('puts the vehicle in GUIDED, sets the speed and sends ONE reposition to the place, once the failsafe is on', async () => {
  scripted().params({ FS_GCS_ENABLE: 1, FENCE_ENABLE: 0 })
  const before = sent().length
  await window().click('#go-here-go')
  await window().waitFor(`document.querySelector('#confirm-yes') !== null`, 10_000)
  await sleep(IGNORES_MS)
  await window().click('#confirm-yes')
  await window().waitFor(`document.querySelector('#go-here') === null`, 30_000)
  const reposition = theReposition()

  expect(sent().length).toBeGreaterThan(before)
  // the frame above home, and the altitude the vehicle has
  expect(reposition.frame).toBe(6)
  expect(reposition.params[6]).toBe(20)
  // east of the vehicle (100 px at zoom 16 is a few tens of metres), and about as far north as it is
  expect(Number(reposition.params[5]) > HOME.lon * 1e7).toBe(true)
  expect(Math.abs(Number(reposition.params[4]) - HOME.lat * 1e7)).toBeLessThan(5000)
})
