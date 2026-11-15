// End to end, in the real window with the real backend and a SCRIPTED vehicle behind a TCP port (e2e/scripted-vehicle.ts: it says
// what a test tells it, takes a mode and an arm into its next heartbeat, and notes every command it is sent): Take off from the
// command palette. The row is off until the vehicle reports a 3D fix and the EKF's position, and says why. The dialog asks the
// altitude (nothing outside 2 to 50 m, nothing that is not a number), has a plain button (not a hold) that ignores presses in its
// first moments, and sends nothing when it is turned down. The button puts the vehicle in GUIDED, asks for the arm (the arm's own
// hold): a hold that is turned down ends the flow, with no takeoff, even when someone else arms the vehicle afterwards; a hold
// that is held arms it, and the takeoff is sent once, to the altitude that was typed. What the real autopilot does is
// sitl-arming.e2e.ts. NOT covered here: the fence (it is in the unit tests: the scripted vehicle has no fence).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { chord, openPalette } from './palette-keys'
import { ScriptedVehicle } from './scripted-vehicle'
import { sleep, Strip } from './strip'

/** MAV_CMD_NAV_TAKEOFF, MAV_CMD_DO_SET_MODE and MAV_CMD_COMPONENT_ARM_DISARM. */
const TAKEOFF = 22
const SET_MODE = 176
const ARM = 400
/** ArduCopter's GUIDED. */
const GUIDED = 4

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
 * What the vehicle was sent, as the commands that count.
 *
 * @returns the numbers of the commands that were sent of those a takeoff makes
 */
function sent(): number[] {
  const counted = [TAKEOFF, SET_MODE, ARM]

  return scripted().received().map(received => received.command).filter(command => counted.includes(command))
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  vehicle.position({ lat: 52.2, lon: 21, heading: 0, height: 0 })
  vehicle.home({ lat: 52.2, lon: 21 })
  // (the fence is off: its parameters are there)
  vehicle.params({ FENCE_ENABLE: 0, FENCE_TYPE: 0, FENCE_ALT_MAX: 0 })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

const ROW = `document.querySelector('.palette-row[data-command="vehicle.takeoff"]')`

/** Opens the palette on "take off", and waits for the row. */
async function showsRow(): Promise<void> {
  await openPalette(window())
  await window().fill('#palette-input', 'take off')
  await window().waitFor(`${ROW} !== null`, 10_000)
}

/** Closes the palette. */
async function closesPalette(): Promise<void> {
  await chord(window(), 'Escape')
  await window().waitFor(`document.querySelector('#palette-input') === null`, 10_000)
}

/** Opens the dialog of Take off through the palette. */
async function opensDialog(): Promise<void> {
  await showsRow()
  await chord(window(), 'Enter')
  await window().waitFor(`document.querySelector('#takeoff-altitude') !== null`, 10_000)
}

/**
 * What the dialog says of the altitude that is typed.
 *
 * @param text what is typed
 * @returns whether the button is off, and what the dialog says is wrong
 */
async function typed(text: string): Promise<{ off: boolean, problem: string }> {
  await window().fill('#takeoff-altitude', text)
  await sleep(100)

  return window().evaluate<{ off: boolean, problem: string }>(
    `({ off: document.querySelector('#takeoff-go').disabled, problem: document.querySelector('#takeoff-problem').innerText })`,
  )
}

it('is in the palette, but off, while the vehicle reports no 3D fix: the row says why', async () => {
  await new Strip(window()).heartbeatSays(false)
  await showsRow()

  expect(await window().evaluate<string | null>(`${ROW}.getAttribute('aria-disabled')`)).toBe('true')
  expect(await window().text('#palette-reason-vehicle\\.takeoff')).toContain('3D GPS fix')
  // (Enter on a row that cannot run opens nothing)
  await chord(window(), 'Enter')
  await sleep(300)

  expect(await new Strip(window()).exists('#takeoff-altitude')).toBe(false)
  await closesPalette()
})

it('is on once the vehicle reports a 3D fix and the EKF\'s position, and opens a dialog with a plain button', async () => {
  scripted().ready(true)
  await showsRow()
  await window().waitFor(`${ROW}.getAttribute('aria-disabled') !== 'true'`, 15_000)
  await chord(window(), 'Enter')
  await window().waitFor(`document.querySelector('#takeoff-altitude') !== null`, 10_000)

  expect(await window().evaluate<boolean>(`document.querySelector('#confirm-hold') === null`)).toBe(true)
  expect(await window().text('#takeoff-limits')).toContain('2 to 50 m')
  expect(await window().text('#takeoff-vehicle')).toContain('QUADROTOR')
  // (Cancel has the focus: a key pressed to open the dialog turns it down, not up)
  expect(await window().evaluate<string>(`document.activeElement?.id`)).toBe('takeoff-cancel')
})

it('does not go ahead with an altitude that is empty, not a number, below 2 m or above 50 m, and says why', async () => {
  const cases = [['', 'Type a number'], ['ten', 'Type a number'], ['1', 'At least 2 m.'], ['51', 'At most 50 m.']] as const

  for (const [text, words] of cases) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    const seen = await typed(text)

    expect(seen.off, text).toBe(true)
    expect(seen.problem, text).toContain(words)
  }
  expect((await typed('2')).off).toBe(false)
  expect((await typed('50')).off).toBe(false)
})

it('sends nothing when it is turned down with Escape or Cancel', async () => {
  await chord(window(), 'Escape')
  await window().waitFor(`document.querySelector('#takeoff-altitude') === null`, 10_000)
  await opensDialog()
  await window().click('#takeoff-cancel')
  await window().waitFor(`document.querySelector('#takeoff-altitude') === null`, 10_000)
  await sleep(500)

  expect(sent()).toEqual([])
})

it('ignores a press of the button in its first moments, and goes ahead after them', async () => {
  await opensDialog()
  // (one script: a press at the very start, before the first 400 ms are over)
  const early = await window().evaluate<string>(`(() => {
    const button = document.querySelector('#takeoff-go')
    const was = button.dataset.armed
    button.click()
    return was
  })()`)
  await sleep(300)

  if (early === 'false') {
    expect(await new Strip(window()).exists('#takeoff-altitude')).toBe(true)
    expect(sent()).toEqual([])
  }
  await window().waitFor(`document.querySelector('#takeoff-go').dataset.armed === 'true'`, 10_000)
  await window().click('#takeoff-cancel')
  await window().waitFor(`document.querySelector('#takeoff-altitude') === null`, 10_000)
})

it('ends with no takeoff when the arm\'s hold is turned down, even if someone else arms the vehicle afterwards', async () => {
  await opensDialog()
  await window().waitFor(`document.querySelector('#takeoff-go').dataset.armed === 'true'`, 10_000)
  await window().click('#takeoff-go')
  // GUIDED first, then the arm's own question
  await new Strip(window()).appears('#confirm-hold', 30_000)

  expect(scripted().received().some(received => received.command === SET_MODE && received.params[1] === GUIDED)).toBe(true)
  await chord(window(), 'Escape')
  await new Strip(window()).goes('#confirm', 10_000)
  // (a radio switch, another ground station)
  scripted().arm(true)
  await new Strip(window()).heartbeatSays(true)
  await sleep(2000)

  expect(sent()).toEqual([SET_MODE])
})

it('arms with the hold and then takes off once, to the altitude that was typed', async () => {
  scripted().arm(false)
  await new Strip(window()).heartbeatSays(false)
  await opensDialog()
  await typed('7')
  await window().waitFor(`document.querySelector('#takeoff-go').dataset.armed === 'true'`, 10_000)
  await window().click('#takeoff-go')
  await new Strip(window()).hold()
  await new Strip(window()).heartbeatSays(true)
  await sleep(1500)
  const takeoffs = scripted().received().filter(received => received.command === TAKEOFF)

  expect(takeoffs).toHaveLength(1)
  expect(takeoffs[0]?.params[6]).toBe(7)
  expect(sent().filter(command => command === ARM)).toHaveLength(1)
})
