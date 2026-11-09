// The checks for a vehicle reached over a real link, in the real window. They say nothing about
// which vehicle it is: each *.e2e.ts says that (ArduPilot SITL, or the simulator behind TCP).
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { clickConnect, showScreen } from './click'
import type { Endpoint } from './endpoint'
import { switchRounds } from './switch'

/** A saved snapshot, as far as these checks read it. */
interface Saved {
  params: { id: string, value: number }[]
}

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
  let files = ''
  const row = `tr[data-id="${vehicle.param}"]`

  async function write(from: number, to: number): Promise<void> {
    await app.click(row)
    await app.fill('#draft', String(to))
    await app.click('#write')
    await app.waitForText('#question', `Set ${vehicle.param} from ${from} to ${to}?`)
    await app.click('#confirm button[value=yes]')
    // The table first: the detail panel can still show an earlier write's identical message.
    await app.waitForText(`${row} td.num`, new RegExp(`^${to}$`, 'u'), vehicle.downloadTimeoutMs)
    await app.waitForText('#detail', `Written and read back: ${to}.`, vehicle.downloadTimeoutMs)
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

  /** The file the app saved whose name starts with `prefix`, once it's there and complete. */
  async function savedSnapshot(prefix: string): Promise<Saved> {
    return vi.waitFor(() => {
      const name = readdirSync(files).find(f => f.startsWith(prefix))
      if (!name) {
        throw new Error(`no ${prefix}* file saved in ${files}`)
      }

      return JSON.parse(readFileSync(join(files, name), 'utf8')) as Saved
    }, { timeout: 10_000, interval: 100 })
  }

  const valueIn = (saved: Saved) => saved.params.find(p => p.id === vehicle.param)?.value

  beforeAll(async () => {
    // Instead of the native file dialogs, which a test can't click (the backend's FileChooser).
    files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
    process.env.DRONE_CONFIGURATOR_TEST_FILES = files
    app = await launchApp()
    await app.waitForText('#connection', 'disconnected')
    const { transport, host, port } = vehicle.endpoint()
    await app.fill('#transport', transport)
    await app.fill('#host', host)
    await app.fill('#port', String(port))
  })

  afterAll(async () => {
    await app?.close()
    delete process.env.DRONE_CONFIGURATOR_TEST_FILES
    rmSync(files, { recursive: true, force: true })
  })

  it('detects the vehicle over the link', async () => {
    await clickConnect(app)
    expect(await app.waitForText('#connection', 'connected · system', vehicle.downloadTimeoutMs))
      .toMatch(/connected · system 1\/1 · QUADROTOR · ARDUPILOTMEGA/u)
  })

  it('downloads the whole parameter list', async () => {
    await showScreen(app, 'parameters')
    const status =await app.waitForText('#list-status', /^\d+ parameters$/u, vehicle.downloadTimeoutMs)
    expect(Number.parseInt(status, 10)).toBeGreaterThanOrEqual(vehicle.minParams)
  })

  it('shows what the vehicle reports, and keeps updating', async () => {
    await showScreen(app, 'flight')
    // The battery and the attitude are separate messages: the first values can come before the attitude's, so both are waited for.
    const telemetry = await app.waitForText('#telemetry', /Battery\s*\d[\s\S]*Attitude\s*roll -?\d/u, vehicle.downloadTimeoutMs)
    expect(telemetry).toMatch(/Mode\s*(?:STABILIZE|LOITER)/u)
    const before = await app.evaluate<string>(`document.querySelector('#telemetry').textContent`)
    await app.waitFor(`document.querySelector('#telemetry').textContent !== ${JSON.stringify(before)}`)
  })

  it('shows it in the details of the Flight data screen, beside the map and the display', async () => {
    const titles = await app.evaluate<string[]>(`[...document.querySelectorAll('.flight-pane h2')].map(h => h.textContent)`)

    expect(titles).toEqual(['Map', 'Display', 'Details'])
    expect(await app.evaluate<boolean>(`document.querySelector('[role="tabpanel"] #telemetry') !== null`)).toBe(true)
  })

  it('switches between Flight data and Parameters, with the whole list loaded: the times are recorded', async () => {
    // The Parameters screen holds the whole list here (the simulator behind TCP has a dozen, SITL more than a thousand):
    // the numbers say what a switch costs with a real list. The limit of 100 ms is asserted with the simulator's
    // short list (flight-data.e2e.ts); here they are only printed.
    const times = await switchRounds(app)
    console.info(`screen switch times with ${vehicle.minParams}+ parameters (ms):`, JSON.stringify(times))

    expect(Object.keys(times)).toHaveLength(6)
    await showScreen(app, 'parameters')
  })

  it('writes a parameter with a verified read-back, and puts it back', async ({ onTestFinished }) => {
    await showScreen(app, 'parameters')
    const original = await currentValue()
    expect(Number.isInteger(original)).toBe(true)
    onTestFinished(() => putBack(original))
    await write(original, original + vehicle.paramStep)
  })

  it('saves a snapshot, applies an edited one after confirming, and keeps a backup', async ({ onTestFinished }) => {
    const original = await currentValue()
    onTestFinished(() => putBack(original))
    const changed = original + vehicle.paramStep

    await app.click('#save')
    const snapshot = await savedSnapshot('params-')
    expect(valueIn(snapshot)).toBe(original)

    const entry = snapshot.params.find(p => p.id === vehicle.param)
    if (entry) {
      entry.value = changed
    }
    writeFileSync(join(files, 'open.json'), JSON.stringify(snapshot))
    await app.click('#load-button')
    await app.waitForText('#import', `${vehicle.param}: ${original} → ${changed}`)

    await app.click(`input[data-pick="${vehicle.param}"]`)
    await app.click('#apply')
    await app.waitForText('#question', `Write 1 parameter to the vehicle (${vehicle.param})?`)
    await app.click('#confirm button[value=yes]')
    await app.waitForText('#import', `${vehicle.param}: written and read back: ${changed}`, vehicle.downloadTimeoutMs)
    expect(await currentValue()).toBe(changed)

    await app.click('#backup')
    expect(valueIn(await savedSnapshot('backup-'))).toBe(original)
    await app.click('#close-import')
  })

  it('disconnects and reconnects', async () => {
    await app.click('#disconnect-button')
    await app.waitForText('#connection', /^disconnected/u)
    await clickConnect(app)
    await app.waitForText('#connection', 'connected · system', vehicle.downloadTimeoutMs)
    await app.waitForText('#list-status', /^\d+ parameters$/u, vehicle.downloadTimeoutMs)
  })

  it('closes cleanly while connected', async () => {
    expect(await app.close()).toBe(0)
  })
}
