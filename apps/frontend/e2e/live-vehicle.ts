// The checks for a vehicle reached over a real link, in the real window. They say nothing about
// which vehicle it is: each *.e2e.ts says that (ArduPilot SITL, or the simulator behind TCP).
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  askToWriteQueued,
  cancelConfirm,
  chooseConnection,
  clickConnect,
  confirmWrite,
  queueValue,
  showScreen,
  waitForQueuedWritten,
} from './click'
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
    await queueValue(app, vehicle.param, from, to)
    await askToWriteQueued(app, [{ id: vehicle.param, from, to }])
    await confirmWrite(app)
    await waitForQueuedWritten(app, vehicle.param, to, vehicle.downloadTimeoutMs)
  }

  function currentValue(): Promise<number> {
    return app.text(`${row} td.num`).then(Number)
  }

  /**
   * Leaves the vehicle with `original`, however the check ended. A failed write can leave the
   * table out of step with the vehicle, so this asks the vehicle first.
   */
  async function putBack(original: number): Promise<void> {
    if (await app.evaluate<boolean>(`document.querySelector('#confirm') !== null`)) {
      await cancelConfirm(app)
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
    await chooseConnection(app, { transport, host, port: String(port) })
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
    await app.waitForText('#telemetry', /BATTERY\s*\d/u, vehicle.downloadTimeoutMs)
    const label = 'document.querySelector(\'.hud\').getAttribute(\'aria-label\')'
    await app.waitFor(`/roll -?\\d/u.test(${label})`, vehicle.downloadTimeoutMs)
    expect(await app.waitForText('#top-bar', /MODE\s*(?:STABILIZE|LOITER)/u)).toMatch(/STATE/u)
    // The heartbeat age of the LINK card changes with every frame, also on a vehicle that stands still (the display's
    // whole degrees do not).
    const link = `[...document.querySelectorAll('#telemetry > *')].find(card => /LINK/u.test(card.textContent)).textContent`
    await app.waitFor(`/\\d+ ms ago/u.test(${link})`)
    const before = await app.evaluate<string>(link)
    await app.waitFor(`${link} !== ${JSON.stringify(before)}`)
  })

  it('shows it in the aside of the Fly screen, beside the map', async () => {
    const regions = await app.evaluate<string[]>(`[...document.querySelectorAll('.fly > *')].map(r => r.className)`)

    expect(regions).toEqual(['fly-main', 'fly-aside'])
    expect(await app.evaluate<boolean>(`document.querySelector('.fly-aside #telemetry') !== null`)).toBe(true)
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
    await app.waitForText('#import', new RegExp(`${vehicle.param}\\s+${original}\\s+→ ${changed}`, 'u'))

    await app.click(`input[data-pick="${vehicle.param}"]`)
    await app.click('#apply')
    await app.waitForText('#question', `Write 1 parameter to the vehicle (${vehicle.param})?`)
    await confirmWrite(app)
    await app.waitForText('#import', `Written and read back: ${changed}`, vehicle.downloadTimeoutMs)
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
