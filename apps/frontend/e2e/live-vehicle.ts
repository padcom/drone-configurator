// The checks for a vehicle reached over a real link, in the real window. They say nothing about
// which vehicle it is: each *.e2e.ts says that (ArduPilot SITL, or the simulator behind TCP).
import { type E2eApp, launchApp } from 'pico-desktop'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Endpoint } from './endpoint'

export interface LiveVehicle {
  /** Where it is (called once it's running). */
  endpoint: () => Endpoint
  /** How long a connection and a full parameter download may take. */
  downloadTimeoutMs: number
  /** At least this many parameters must arrive. */
  minParams: number
  /** An integer parameter that's safe to change by `paramStep`, and is put back afterwards. */
  param: string
  paramStep: number
}

/** Registers the checks in the current `describe`. */
export function liveVehicleTests(vehicle: LiveVehicle): void {
  let app: E2eApp
  const row = `tr[data-id="${vehicle.param}"]`

  async function write(from: number, to: number): Promise<void> {
    await app.click(row)
    await app.fill('#draft', String(to))
    await app.click('#write')
    await app.waitForText('#question', `Set ${vehicle.param} from ${from} to ${to}?`)
    await app.click('#confirm button[value=yes]')
    await app.waitForText('#detail', `Written and read back: ${to}.`, vehicle.downloadTimeoutMs)
    expect(await currentValue()).toBe(to)
  }

  function currentValue(): Promise<number> {
    return app.text(`${row} td.num`).then(Number)
  }

  /**
   * Leaves the vehicle with `original`, however the check ended. A failed write can leave the
   * table out of step with the vehicle, so this asks the vehicle first.
   */
  async function putBack(original: number): Promise<void> {
    if (await app.evaluate<boolean>(`document.querySelector('#confirm').open`)) {
      await app.click('#confirm button[value=no]')
    }
    await app.click('#refresh')
    await app.waitForText('#list-status', /^\d+ parameters$/u, vehicle.downloadTimeoutMs)
    const current = await currentValue()
    if (current !== original) {
      await write(current, original)
    }
  }

  beforeAll(async () => {
    app = await launchApp()
    await app.waitForText('#connection', 'disconnected')
    const { transport, host, port } = vehicle.endpoint()
    await app.fill('#transport', transport)
    await app.fill('#host', host)
    await app.fill('#port', String(port))
  })

  afterAll(async () => {
    await app?.close()
  })

  it('detects the vehicle over the link', async () => {
    await app.click('#connect-button')
    expect(await app.waitForText('#connection', 'connected · system', vehicle.downloadTimeoutMs))
      .toMatch(/connected · system 1\/1 · QUADROTOR · ARDUPILOTMEGA/u)
  })

  it('downloads the whole parameter list', async () => {
    const status = await app.waitForText('#list-status', /^\d+ parameters$/u, vehicle.downloadTimeoutMs)
    expect(Number.parseInt(status, 10)).toBeGreaterThanOrEqual(vehicle.minParams)
  })

  it('shows what the vehicle reports, and keeps updating', async () => {
    const telemetry = await app.waitForText('#telemetry', /Battery\s*\d/u, vehicle.downloadTimeoutMs)
    expect(telemetry).toMatch(/Mode\s*(?:STABILIZE|LOITER)/u)
    expect(telemetry).toMatch(/Attitude\s*roll -?\d/u)
    const before = await app.evaluate<string>(`document.querySelector('#telemetry').textContent`)
    await app.waitFor(`document.querySelector('#telemetry').textContent !== ${JSON.stringify(before)}`)
  })

  it('writes a parameter with a verified read-back, and puts it back', async ({ onTestFinished }) => {
    const original = await currentValue()
    expect(Number.isInteger(original)).toBe(true)
    onTestFinished(() => putBack(original))
    await write(original, original + vehicle.paramStep)
  })

  it('disconnects and reconnects', async () => {
    await app.click('#disconnect-button')
    await app.waitForText('#connection', /^disconnected/u)
    await app.click('#connect-button')
    await app.waitForText('#connection', 'connected · system', vehicle.downloadTimeoutMs)
    await app.waitForText('#list-status', /^\d+ parameters$/u, vehicle.downloadTimeoutMs)
  })

  it('closes cleanly while connected', async () => {
    expect(await app.close()).toBe(0)
  })
}
