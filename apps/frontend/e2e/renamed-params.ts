// The checks of a parameter file from an older firmware (#202), for a vehicle reached over a real link in the real window: a
// Copter of 4.7 has RTL_ALT_M (metres) where a file of 4.6 has RTL_ALT (centimetres). The review offers the new name with both
// values, ticks nothing, and writes a ticked one with a read-back; the comparison shows the file's value under the new name.
// Each *.e2e.ts says which vehicle it is (the simulator behind TCP, or ArduPilot SITL).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showAllParameters, showParameter, showScreen } from './click'
import type { Endpoint } from './endpoint'
import { type E2eApp, launchApp } from './launch'

/** The vehicle of the checks. */
export interface RenamedVehicle {
  /** Where it is (called once it's running). */
  endpoint: () => Endpoint
  /** How long a connection and a full parameter download may take. */
  downloadTimeoutMs: number
}

/** The new name of the checks. */
const NEW = 'RTL_ALT_M'
/** The old name a file of an older firmware has for it, in centimetres. */
const OLD = 'RTL_ALT'

/**
 * A file of 4.6 that sets the old name, and a name no firmware has.
 *
 * @param centimetres the old name's value
 * @returns the file
 */
const fileOf46 = (centimetres: number) => `# saved from Copter 4.6\n${OLD},${centimetres}\nNOT_ON_VEHICLE,1\n`

/** The window, connected to the vehicle, on the Parameters screen, with a folder for the files it opens. */
class Window {
  app: E2eApp | undefined
  readonly files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))

  /**
   * Makes it.
   *
   * @param vehicle the vehicle
   */
  constructor(readonly vehicle: RenamedVehicle) {}

  /**
   * The app.
   *
   * @returns it
   * @throws {Error} before it has started
   */
  get page(): E2eApp {
    if (!this.app) {
      throw new Error('the app has not started')
    }

    return this.app
  }

  /**
   * The file the backend opens instead of the dialog.
   *
   * @returns its path
   */
  get opened(): string {
    return join(this.files, 'open.param')
  }

  /** Starts the app, connects and shows the whole parameter list. */
  async start(): Promise<void> {
    process.env.DRONE_CONFIGURATOR_TEST_FILES = this.files
    this.app = await launchApp()
    await this.page.waitForText('#connection', 'disconnected')
    const { transport, host, port } = this.vehicle.endpoint()
    await chooseConnection(this.page, { transport, host, port: String(port) })
    await clickConnect(this.page)
    await this.page.waitForText('#connection', 'connected · system', this.vehicle.downloadTimeoutMs)
    await showScreen(this.page, 'parameters')
    await this.page.waitForText('#list-status', /^\d+ parameters$/u, this.vehicle.downloadTimeoutMs)
  }

  /** Closes the app and removes the folder. */
  async stop(): Promise<void> {
    await this.app?.close()
    delete process.env.DRONE_CONFIGURATOR_TEST_FILES
    rmSync(this.files, { recursive: true, force: true })
  }

  /**
   * The value of the new name on the vehicle, as its row shows it.
   *
   * @returns the value
   */
  async currentValue(): Promise<number> {
    await showParameter(this.page, NEW)
    const value = Number(await this.page.text(`tr[data-id="${NEW}"] td.num`))
    await showAllParameters(this.page)

    return value
  }

  /**
   * Loads `text` as a parameter file for review (the backend opens `open.param` of the test folder), and waits for it.
   *
   * @param text the file
   */
  async load(text: string): Promise<void> {
    writeFileSync(this.opened, text)
    await this.page.click('#load-button')
    await this.page.waitForText('#import', 'Parameter file: ')
  }

  /**
   * Ticks the new name in the review, writes it after the question, waits for the read-back and closes the review.
   *
   * @param metres the value written
   */
  async writeTicked(metres: number): Promise<void> {
    await this.page.click(`input[data-pick="${NEW}"]`)
    await this.page.click('#apply')
    await this.page.waitForText('#question', `Write 1 parameter to the vehicle (${NEW})?`)
    await confirmWrite(this.page)
    await this.page.waitForText('#import', `Written and read back: ${metres}`, this.vehicle.downloadTimeoutMs)
    await this.page.click('#close-import')
  }

  /**
   * Puts the new name back to `original`, through a file of it, when it differs.
   *
   * @param original the value
   */
  async putBack(original: number): Promise<void> {
    await this.load(`${NEW},${original}\n`)
    const differs = await this.page.evaluate<boolean>(`document.querySelector('input[data-pick="${NEW}"]') !== null`)
    if (differs) {
      await this.writeTicked(original)
    } else {
      await this.page.click('#close-import')
    }
  }

  /**
   * The text of the review's row of the new name.
   *
   * @returns the text
   */
  rowText(): Promise<string> {
    return this.page.evaluate<string>(`document.querySelector('input[data-pick="${NEW}"]').closest('tr').innerText`)
  }

  /**
   * The text of the comparison's row of the new name, once it shows.
   *
   * @returns its status and its text
   */
  async compareRow(): Promise<{ status: string, text: string }> {
    await this.page.fill('#compare-search', NEW)
    await this.page.waitFor(`document.querySelector('#compare [data-id="${NEW}"]') !== null`)
    const status = await this.page.evaluate<string>(`document.querySelector('#compare [data-id="${NEW}"]').dataset.status`)

    return { status, text: await this.page.text(`#compare [data-id="${NEW}"]`) }
  }

  /**
   * Loads a file of 4.6 that sets the old name to `metres` in centimetres: the review shows the new name with both values and
   * nothing ticked; the new name is written ticked, and read back.
   *
   * @param metres the value of the new name
   */
  async reviewAndWrite(metres: number): Promise<void> {
    const original = await this.currentValue()
    const centimetres = Math.round(metres * 100)

    await this.load(fileOf46(centimetres))
    await this.page.waitForText('#import', `${OLD} → ${NEW} (renamed in 4.7)`)
    const renamed = `${OLD} → ${NEW} \\(renamed in 4\\.7\\)\\s+${original}\\s+→ ${metres}\\s+`
    expect(await this.rowText()).toMatch(new RegExp(`${renamed}Converted: ${centimetres} cm → ${metres} m`, 'u'))
    await this.page.waitForText('#import', /NOT_ON_VEHICLE\s+—\s+→ 1\s+not on this vehicle/u)
    expect(await this.page.evaluate<number>(`document.querySelectorAll('#import input[type=checkbox]:checked').length`)).toBe(0)
    expect(await this.page.evaluate<boolean>(`document.querySelector('input[data-pick="${NEW}"]').disabled`)).toBe(false)

    await this.writeTicked(metres)
    expect(await this.currentValue()).toBe(metres)
  }

  /**
   * Compares with a file that sets the old name to a metre more than `original`, in centimetres: the row of the new name
   * differs and says the old name and value; nothing is written.
   *
   * @param original the value of the new name on the vehicle
   */
  async compareWith(original: number): Promise<void> {
    const centimetres = Math.round((original + 1) * 100)
    writeFileSync(this.opened, `${OLD},${centimetres}\n`)

    await this.page.click('#compare-file')
    await this.page.waitForText('#compare h3', 'Compared with: Parameter file: ')
    expect(await this.page.text('#compare-summary'))
      .toMatch(/^Different: 1; only on the vehicle: \d+; not on the vehicle: 0; the same: 0\.$/u)
    const row = await this.compareRow()
    expect(row.status).toBe('differs')
    expect(row.text).toContain(`(was ${OLD} ${centimetres} cm, renamed in 4.7)`)
    await this.page.click('#close-compare')
    expect(await this.currentValue()).toBe(original)
  }
}

/**
 * Registers the checks in the current `describe`.
 *
 * @param vehicle the vehicle
 */
export function renamedParamsTests(vehicle: RenamedVehicle): void {
  const window = new Window(vehicle)

  beforeAll(() => window.start(), 120_000)
  afterAll(() => window.stop())

  it('offers an old name under the new one with both values, ticks nothing, writes it read back', async ({ onTestFinished }) => {
    const original = await window.currentValue()
    onTestFinished(() => window.putBack(original))

    await window.reviewAndWrite(original + 5)
  })

  it('compares a file of the old name under the new one, and writes nothing', async ({ onTestFinished }) => {
    onTestFinished(() => rmSync(window.opened, { force: true }))

    await window.compareWith(await window.currentValue())
  })
}
