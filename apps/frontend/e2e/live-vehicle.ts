// The checks for a vehicle reached over a real link, in the real window. They say nothing about
// which vehicle it is: each *.e2e.ts says that (ArduPilot SITL, or the simulator behind TCP).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  showAllParameters,
  showParameter,
  showScreen,
  waitForQueuedWritten,
} from './click'
import type { Endpoint } from './endpoint'
import { chord, openPalette } from './palette-keys'
import { SWITCH_LIMIT_MS, switchRounds } from './switch'

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
  /** Its parameters stay as they are while it stands (no counters or learned values): a file saved from it and loaded back is
   * the same to the last bit. */
  stableParams: boolean
  /** A parameter file ArduPilot itself has (its Tools/autotest/default_params), to load for review, if there is one here. */
  realParamFile?: () => string | null
}

/**
 * A page script that scrolls the parameter list from the top to the bottom, a screenful at a time, and gathers what `collect`
 * (a page expression that gives an array) finds at each place, then puts the list back at the top.
 *
 * @param collect a page expression that gives an array
 * @returns the script, which gives all the arrays joined
 */
function scrolledThrough(collect: string): string {
  return `(async () => {
    const box = document.querySelector('.param-scroll')
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const found = []
    for (let top = 0; top < box.scrollHeight; top += box.clientHeight / 2) {
      box.scrollTop = top
      await frames()
      found.push(...${collect})
    }
    box.scrollTop = 0
    await frames()

    return found
  })()`
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

  async function currentValue(): Promise<number> {
    await showParameter(app, vehicle.param)

    return Number(await app.text(`${row} td.num`))
  }

  /**
   * Leaves the vehicle with `original`, however the check ended. A failed write can leave the
   * table out of step with the vehicle, so this asks the vehicle first.
   */
  async function putBack(original: number): Promise<void> {
    if (await app.evaluate<boolean>(`document.querySelector('#confirm') !== null`)) {
      await cancelConfirm(app)
    }
    await showAllParameters(app)
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

  /** The text of the file the app saved whose name starts with `prefix` and ends with `suffix`, once it's there. */
  async function savedText(prefix: string, suffix: string): Promise<string> {
    return vi.waitFor(() => {
      const name = readdirSync(files).find(f => f.startsWith(prefix) && f.endsWith(suffix))
      if (!name) {
        throw new Error(`no ${prefix}*${suffix} file saved in ${files}`)
      }

      return readFileSync(join(files, name), 'utf8')
    }, { timeout: 10_000, interval: 100 })
  }

  /** Loads `text` as a parameter file (the backend opens `open.param` of the test folder), and waits for its review. */
  async function loadParamFile(text: string): Promise<void> {
    writeFileSync(join(files, 'open.param'), text)
    await app.click('#load-button')
    await app.waitForText('#import', 'Parameter file: ')
  }

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

  it('puts the focus in the value editor of a parameter that is chosen in the command palette', async () => {
    await showScreen(app, 'flight')
    await openPalette(app)
    await app.fill('#palette-input', vehicle.param)
    await app.waitFor(`document.querySelector('[data-command="param.${vehicle.param}"]') !== null`)

    await chord(app, 'Enter')

    await app.waitFor(`location.hash === '#/parameters' && document.activeElement?.id === 'draft'`)
    // It is the parameter that was chosen that the editor shows, and its row is selected (and scrolled into view).
    expect(await app.evaluate<string>(`document.querySelector('#detail .param-name').textContent`)).toBe(vehicle.param)
    expect(await app.evaluate<unknown[]>(`(() => {
      const row = document.querySelector('tr[aria-selected="true"]')
      const box = document.querySelector('.param-scroll').getBoundingClientRect()
      const at = row.getBoundingClientRect()

      return [row.dataset.id, at.top >= box.top - 1, at.bottom <= box.bottom + 1]
    })()`)).toEqual([vehicle.param, true, true])
    // Escape in the field goes back to the list, as always.
    await chord(app, 'Escape')
    await app.waitFor(`document.activeElement?.id === 'param-list'`)
  })

  it('has a description for every parameter, every name and value in its column, and switches within the budget', async () => {
    // Only the rows in view are drawn, so the list is scrolled through to see all of it. Every parameter gets a description,
    // so the grid is the metadata one (name and value as wide as their text, the rest of the row for the description).
    await showScreen(app, 'parameters')
    await showAllParameters(app)
    const ids = await app.evaluate<string[]>(scrolledThrough(`[...document.querySelectorAll('#rows tr:not(.spacer)')].map(r => r.dataset.id)`))
    const params = Object.fromEntries(ids.map(id => [id, { description: `${id}: what it is for, and what it does to the vehicle` }]))
    writeFileSync(join(files, 'open.json'), JSON.stringify({ format: 'drone-configurator/param-metadata', version: 1, params }))
    await app.click('#metadata-button')
    await app.waitFor(`document.querySelector('.param-scroll table.described td.meaning') !== null`, vehicle.downloadTimeoutMs)

    // The columns are sized from characters (ch) of the face and size of their cells: the widest name and the widest value of
    // the whole list must fit in them (a text that does not has a scrollWidth over the width of its cell), at every place.
    const spilling = await app.evaluate<string[]>(scrolledThrough(`[...document.querySelectorAll('#rows th.name, #rows td.num')]
      .filter(cell => cell.scrollWidth > cell.clientWidth).map(cell => cell.textContent)`))
    expect(new Set(ids).size).toBeGreaterThanOrEqual(vehicle.minParams)
    expect(spilling.slice(0, 5)).toEqual([])
    // Only what is in view (and a few rows each side) is in the page, whatever the length of the list.
    expect(await app.evaluate<number>(`document.querySelectorAll('#rows tr').length`)).toBeLessThan(120)

    // KeepAlive brings the Parameters screen back: only the rows in view are in it, so that costs the same for 1400 as for 12.
    const times = await switchRounds(app)
    expect(Math.max(...Object.values(times)), `${new Set(ids).size} rows, times (ms): ${JSON.stringify(times)}`)
      .toBeLessThan(SWITCH_LIMIT_MS)
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

  it('saves a .param file, loads it back unchanged, and applies an edited one with a read-back', async ({ onTestFinished }) => {
    const original = await currentValue()
    onTestFinished(() => putBack(original))
    onTestFinished(() => rmSync(join(files, 'open.param'), { force: true }))
    const changed = original + vehicle.paramStep

    await app.click('#save-param')
    const saved = await savedText('params-', '.param')
    const lines = saved.split('\n')
    expect(lines[0]).toMatch(/^# Parameters of QUADROTOR \(ARDUPILOTMEGA\), vehicle 1, saved by Drone Configurator on /u)
    expect(lines).toContain(`${vehicle.param},${original}`)
    expect(saved).not.toContain('\r')

    // As it was saved: the same, to the last bit of every float (on a vehicle whose counters run, those few differ).
    await loadParamFile(saved)
    const [, differ = '', same = ''] = /^Different: (\d+); already the same: (\d+)\./u.exec(await app.text('.review-head p')) ?? []
    console.info(`a .param file loaded back unchanged: ${differ} differ, ${same} the same`)
    expect(Number(differ) + Number(same)).toBe(lines.length - 2)
    expect(Number(differ)).toBeLessThanOrEqual(vehicle.stableParams ? 0 : 5)
    await app.click('#close-import')

    // Edited the way a person does: CRLF line ends, a comment, a value changed, and a name the vehicle does not have.
    const edited = ['# edited by hand', ...lines.filter(line => !line.startsWith(`${vehicle.param},`)), `${vehicle.param} ${changed}`]
    await loadParamFile([...edited, 'NOT_ON_VEHICLE,1'].join('\r\n'))
    await app.waitForText('#import', new RegExp(`${vehicle.param}\\s+${original}\\s+→ ${changed}`, 'u'))
    await app.waitForText('#import', /NOT_ON_VEHICLE\s+—\s+→ 1\s+not on this vehicle/u)
    expect(await app.evaluate<boolean>(`document.querySelector('input[data-pick="NOT_ON_VEHICLE"]').disabled`)).toBe(true)
    expect(await app.evaluate<boolean>(`document.querySelector('input[data-pick="${vehicle.param}"]').checked`)).toBe(false)

    await app.click(`input[data-pick="${vehicle.param}"]`)
    await app.click('#apply')
    await app.waitForText('#question', `Write 1 parameter to the vehicle (${vehicle.param})?`)
    await confirmWrite(app)
    await app.waitForText('#import', `Written and read back: ${changed}`, vehicle.downloadTimeoutMs)
    expect(await currentValue()).toBe(changed)
    await app.click('#close-import')
  })

  it('loads a parameter file of ArduPilot\'s own for review, and writes nothing until told', async ({ skip }) => {
    const path = vehicle.realParamFile?.() ?? null
    if (path === null || !existsSync(path)) {
      skip()

      return
    }
    await loadParamFile(readFileSync(path, 'utf8'))

    // The review lists the rows that differ (or none), with nothing ticked.
    expect(await app.text('.review-head p')).toMatch(/^Different: \d+; already the same: \d+\. Tick the ones to write\.$/u)
    expect(await app.evaluate<number>(`document.querySelectorAll('#import input[type=checkbox]:checked').length`)).toBe(0)
    await app.click('#close-import')
  })

  /** The status (`same`, `differs`, `vehicleOnly`, `otherOnly`) of a row of the comparison, or '' when it is not shown. */
  const compareStatus = (id: string) => app.evaluate<string>(
    `document.querySelector('#compare [data-id="${id}"]')?.dataset.status ?? ''`,
  )

  /** Opens the comparison with the firmware's defaults, and narrows it to the parameter of these checks, every row of it shown. */
  async function compareWithDefaults(): Promise<void> {
    await app.click('#compare-defaults')
    await app.waitForText('#compare h3', 'Compared with: Firmware defaults', vehicle.downloadTimeoutMs)
    await app.click('#compare-only-differences')
    await app.fill('#compare-search', vehicle.param)
    await app.waitFor(`document.querySelector('#compare [data-id="${vehicle.param}"]') !== null`)
  }

  it('compares with the firmware defaults, and copies a default across through the review, read back', async ({ onTestFinished }) => {
    const original = await currentValue()
    onTestFinished(() => putBack(original))
    await compareWithDefaults()
    // A parameter at its default is moved off it first, so that there is something to copy across.
    if (await compareStatus(vehicle.param) === 'same') {
      await app.click('#close-compare')
      await write(original, original + vehicle.paramStep)
      await compareWithDefaults()
    }
    expect(await compareStatus(vehicle.param)).toBe('differs')
    const cells = await app.evaluate<string[]>(`[...document.querySelectorAll('#compare [data-id="${vehicle.param}"] [data-column]')]
      .map(cell => cell.innerText.trim())`)
    const fallback = Number(/^-?[\d.]+/u.exec(cells[3] ?? '')?.[0])
    console.info(`${vehicle.param}: ${cells[2]} on the vehicle, ${cells[3]} by default`)
    expect(Number.isFinite(fallback)).toBe(true)

    // Copied across: to the review, ticked, and nothing written until it is confirmed.
    await app.click(`#compare input[data-copy="${vehicle.param}"]`)
    await app.click('#compare-review')
    await app.waitForText('#import', 'Firmware defaults')
    expect(await app.evaluate<boolean>(`document.querySelector('input[data-pick="${vehicle.param}"]').checked`)).toBe(true)
    await app.click('#apply')
    await app.waitForText('#question', `Write 1 parameter to the vehicle (${vehicle.param})?`)
    await confirmWrite(app)
    await app.waitForText('#import', `Written and read back: ${fallback}`, vehicle.downloadTimeoutMs)
    await app.click('#close-import')
    expect(await currentValue()).toBe(fallback)
  })

  it('compares with a file that misses parameters and has one the vehicle lacks, and writes nothing', async ({ onTestFinished }) => {
    onTestFinished(() => rmSync(join(files, 'open.param'), { force: true }))
    const original = await currentValue()
    await showAllParameters(app)
    const count = Number((await app.waitForText('#list-status', /^\d+ parameters$/u)).split(' ')[0])
    writeFileSync(join(files, 'open.param'), `${vehicle.param},${original + vehicle.paramStep}\nNOT_ON_VEHICLE,1\n`)

    await app.click('#compare-file')
    await app.waitForText('#compare h3', 'Compared with: Parameter file: ')

    // One differs, one is not on the vehicle, and every other parameter of the vehicle is only on the vehicle.
    expect(await app.text('#compare-summary'))
      .toBe(`Different: 1; only on the vehicle: ${count - 1}; not on the vehicle: 1; the same: 0.`)
    await app.fill('#compare-search', 'NOT_ON_VEHICLE')
    await app.waitFor(`document.querySelector('#compare [data-id="NOT_ON_VEHICLE"]') !== null`)
    expect(await compareStatus('NOT_ON_VEHICLE')).toBe('otherOnly')
    expect(await app.evaluate<boolean>(`document.querySelector('#compare input[data-copy="NOT_ON_VEHICLE"]').disabled`)).toBe(true)
    await app.fill('#compare-search', vehicle.param)
    await app.waitFor(`document.querySelector('#compare [data-id="${vehicle.param}"]') !== null`)
    expect(await compareStatus(vehicle.param)).toBe('differs')
    await app.click('#close-compare')
    expect(await currentValue()).toBe(original)
  })

  it('disconnects and reconnects', async () => {
    await showAllParameters(app)
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
