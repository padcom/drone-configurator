// End to end, in the real window against the backend and its simulated vehicle: "Reboot flight controller" in the palette. The
// row says why it may not run while no vehicle is connected, and once the simulated vehicle (which arms itself after three
// seconds) is armed: Enter does nothing, no question is asked, and nothing is sent. The hold, the command and the vehicle's
// answers are covered where they can be controlled: the shell against the mock backend (RebootFlow.test.ts) and the backend's
// own tests (reboot.test.pi); the simulator does not answer a reboot, and SITL (e2e/sitl*.e2e.ts) is the run against a real
// autopilot.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect } from './click'
import { chord as press, openPalette } from './palette-keys'

let app: E2eApp

/** The reboot's row in the palette. */
const ROW = `document.querySelector('[data-command="vehicle.reboot"]')`

/**
 * Presses a key as the host receives it.
 *
 * @param key the key: `Escape` or `Enter`
 * @returns once the key is pressed and let go
 */
const chord = (key: string) => press(app, key)

/**
 * Waits.
 *
 * @param ms for how long
 */
const wait = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/** Opens the palette and finds the reboot command. */
async function findReboot(): Promise<void> {
  await openPalette(app)
  await app.fill('#palette-input', 'reboot')
  await app.waitFor(`${ROW} !== null`)
}

/** Presses Enter on the row, which may not run, and shows that nothing was asked or sent. */
async function pressEnterOnTheRow(): Promise<void> {
  await chord('Enter')
  await wait(300)

  expect(await app.evaluate<boolean>(`document.querySelector('#confirm') === null`)).toBe(true)
  // The palette is still there, with the row, for the reason to be read.
  expect(await app.evaluate<boolean>(`${ROW} !== null`)).toBe(true)
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

describe('rebooting from the palette', () => {
  it('is listed with the reason it may not run while no vehicle is connected, and Enter does nothing', async () => {
    await findReboot()

    expect(await app.evaluate<string>(`${ROW}.getAttribute('aria-disabled')`)).toBe('true')
    expect(await app.text('[data-command="vehicle.reboot"] .palette-group')).toBe('Vehicle')
    expect(await app.text('[data-command="vehicle.reboot"] .palette-reason')).toBe('Connect to a vehicle first.')
    await pressEnterOnTheRow()
    await chord('Escape')
  })

  it('is listed with the reason when the vehicle is armed, and Enter does nothing', async () => {
    await clickConnect(app)
    await app.waitForText('#connection', /connected/u, 60_000)
    // The simulated vehicle arms itself after three heartbeats; the page shows it in the STATE cell.
    await app.waitFor(`document.querySelector('.cell.state')?.classList.contains('armed') === true`, 30_000)
    await findReboot()
    await app.waitFor(`${ROW}.getAttribute('aria-disabled') === 'true'`)

    expect(await app.text('[data-command="vehicle.reboot"] .palette-reason'))
      .toBe('Disarm the vehicle first. A flying vehicle is never rebooted.')
    await pressEnterOnTheRow()
    await chord('Escape')
  })
})
