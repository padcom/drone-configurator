// End to end, in the real window with the real backend and a SCRIPTED vehicle that has 1,500 parameters behind a TCP port, each
// with a description as long as ArduPilot's (loaded from a metadata file): the speed budget of the Parameters screen's search
// (#36). Every keystroke is answered within 16 ms (the median; the 95th percentile within twice that), typos included: a query
// with a typo finds few strict results, and then every word of every description is looked at for one a letter away. The times
// are measured IN the page, from the input event to the table's rows in the page (the next task), so the host's own delays are
// not in them.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectWithinBudget } from './budgets'
import { typeQueries } from './param-typing'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'

/** How many parameters the vehicle has. The budget is `paramFilterKeystroke` in budgets.json. */
const PARAMETERS = 1500

/** Words a description is made of: ArduPilot's descriptions run to a few hundred characters of words like these. */
const WORDS = ['the',
  'vehicle',
  'altitude',
  'speed',
  'battery',
  'voltage',
  'failsafe',
  'throttle',
  'channel',
  'sensor',
  'filter',
  'output',
  'maximum',
  'minimum',
  'when',
  'this',
  'enabled',
  'controller',
  'gain',
  'rate',
  'position',
  'compass',
  'motor',
  'mission',
  'waypoint',
  'distance',
  'home',
  'landing',
  'mode',
  'value',
  'option',
  'used',
  'before',
  'after',
  'during',
  'time']

let vehicle: ScriptedVehicle | undefined
let app: E2eApp | undefined
let files = ''

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
 * The name of a parameter: letters and digits only.
 *
 * @param i its number
 * @returns the name, PRM0001 to PRM1500
 */
const nameOf = (i: number) => `PRM${String(i + 1).padStart(4, '0')}`

/**
 * A description of some 300 characters, different for each parameter.
 *
 * @param i the parameter's number
 * @returns the text
 */
function descriptionOf(i: number): string {
  return Array.from({ length: 45 }, (_, w) => WORDS[(i * 7 + w * 13) % WORDS.length]).join(' ')
}

/**
 * The metadata of the parameters, in the app's own format.
 *
 * @returns the file's text
 */
function metadata(): string {
  const params = Object.fromEntries(Array.from({ length: PARAMETERS }, (_, i) => [nameOf(i), {
    description: `Parameter ${i + 1} ${WORDS[i % WORDS.length]}`,
    longDescription: descriptionOf(i),
  }]))

  return JSON.stringify({ format: 'drone-configurator/param-metadata', version: 1, params })
}

beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  writeFileSync(join(files, 'open.json'), metadata())
  vehicle = await ScriptedVehicle.start()
  vehicle.params(Object.fromEntries(Array.from({ length: PARAMETERS }, (_, i) => [nameOf(i), i])))
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', `${PARAMETERS} parameters`, 120_000)
  await app.click('#metadata-button')
  await app.waitFor(`document.querySelector('.param-scroll table.described') !== null`, 30_000)
}, 240_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
    delete process.env.DRONE_CONFIGURATOR_TEST_FILES
    rmSync(files, { recursive: true, force: true })
  }
})

/** The queries: a name, words of the descriptions in another order, and typos (the close matches, the slowest). */
const QUERIES = ['prm0777', 'battery voltage', 'voltage battery home', 'batery voltge', 'controler gain', 'speed_mode']

describe('the speed of the Parameters screen\'s search, with 1,500 parameters described', () => {
  it('answers each keystroke within 16 ms, typos included (the median; the 95th in twice)', async () => {
    // Once to warm up (the first keystrokes are cold: the index is made, the code is compiled), then timed.
    const { times, firsts } = await typeQueries(window(), QUERIES)

    console.info('param filter keystroke (ms):', JSON.stringify(times.map(Math.round)))
    expectWithinBudget('paramFilterKeystroke', times)
    expect(firsts[0]).toBe('PRM0777')
    expect(firsts).not.toContain('')
  })

  it('closes cleanly', async () => {
    expect(await window().close()).toBe(0)
  })
})
