// End to end, in the real window with the real backend and a SCRIPTED vehicle behind a TCP port: the link's quality (#29).
// The LINK cell of the top bar shows how much of what the vehicle sent arrived, counted by the backend from the MAVLink
// sequence numbers, and its details (reached from the keyboard) show the round trip of the TIMESYNC the vehicle answers. When
// the vehicle's link loses every third frame, the cell says the link is poor, with an icon and the word, and the quality it
// shows is what arrived.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect } from './click'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'

let vehicle: ScriptedVehicle | undefined
let app: E2eApp | undefined

/** The LINK cell's button. */
const TRIGGER = '#link-quality .trigger'

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
 * The scripted vehicle.
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
 * The quality the cell shows.
 *
 * @returns percent
 */
async function quality(): Promise<number> {
  return Number.parseInt(await window().text('#link-quality .link-value'), 10)
}

/**
 * Presses Enter on the focused element, as the host receives a typed key (with its text: a carriage return).
 */
async function pressEnter(): Promise<void> {
  const event = {
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r',
  }
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  // a position and a ready vehicle: it sends some fifteen frames a second of its own
  vehicle.position({ lat: 47.397742, lon: 8.545594, heading: 0, height: 0 })
  vehicle.ready(true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
}, 240_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('shows a link that loses nothing as whole and good, with the round trip of the ping in its details', async () => {
  await window().waitFor(`document.querySelector('${TRIGGER}') !== null`, 20_000)
  // the window fills over a few seconds: until then the first packets are its whole
  await window().waitFor(`document.querySelector('#link-quality .link-value')?.textContent === '100%'`, 20_000)

  expect(await window().evaluate<boolean>(`document.querySelector('#link-quality').classList.contains('ok')`)).toBe(true)
  expect(await window().evaluate<boolean>(`document.querySelector('${TRIGGER} .icon') === null`)).toBe(true)
  await window().evaluate(`document.querySelector('${TRIGGER}').focus()`)
  await pressEnter()
  await window().waitFor(`document.querySelector('#link-quality [role="dialog"]') !== null`)
  await window().waitFor(`/^\\d+\\s?ms$/u.test(document.querySelector('.link-detail.latency dd')?.textContent ?? '')`, 20_000)

  expect(await window().text('.link-detail.loss dd')).toMatch(/^0\.0%/u)
  expect(await window().evaluate<boolean>(`document.activeElement === document.querySelector('#link-quality [role="dialog"]')`))
    .toBe(true)
}, 60_000)

it('says a link that loses every third frame is poor, with an icon and the word, and shows what arrived', async () => {
  scripted().lose(3)
  await window().waitFor(`document.querySelector('#link-quality')?.classList.contains('error') === true`, 20_000)
  // the window is all lossy after five seconds
  await new Promise(resolve => {
    setTimeout(resolve, 6000)
  })
  const shown = await quality()

  // a third of what the vehicle sends on its own is lost; its answers to the ping are not
  expect(shown).toBeGreaterThanOrEqual(60)
  expect(shown).toBeLessThanOrEqual(80)
  expect(await window().evaluate<boolean>(`document.querySelector('${TRIGGER} .icon') !== null`)).toBe(true)
  // (drawn in capitals)
  expect(await window().text(`${TRIGGER} .link-level`)).toMatch(/^poor$/iu)
  scripted().lose(0)
}, 60_000)
