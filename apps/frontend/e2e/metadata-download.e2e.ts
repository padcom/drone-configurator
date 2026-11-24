// End to end, in the real window with the real backend and the simulated vehicle, against a LOCAL stand-in for ArduPilot's
// parameter server (DRONE_CONFIGURATOR_METADATA_URL; never the real one): the metadata of the connected vehicle is downloaded
// when it is connected. The first run offline shows the parameters without descriptions and says why; with the server, the
// download is used and the line in Settings and a toast say that it is the latest file (the simulator reports no released
// version); the next connections load it from this computer's cache without asking the server, within the budget
// `metadataCachedLoad`; a corrupt cache entry is fetched again; and "Download again" asks the server, from the keyboard.
//
// The file the stand-in serves is made up here, of the size of ArduPilot's (about 6,000 parameters): the real one is GPL and is
// never part of the repository (sitl-metadata.e2e.ts reads the real ones from ArduPilot's server).
import { readdirSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { expectWithinBudget } from './budgets'
import { clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp, presetSettings } from './launch'

const DESCRIPTION = 'How high the vehicle climbs before it returns home.'
/** How many times the cached load is measured. */
const SAMPLES = 7

/** What the stand-in does, and what it saw. */
const stand = { up: false, hits: [] as string[] }

let server: Server | undefined
let app: E2eApp | undefined

/**
 * A definition file the size of ArduPilot's Copter file, in its JSON form, with RTL_ALT described.
 *
 * @returns its text
 */
function bigDefinitions(): string {
  const params: Record<string, unknown> = {
    RTL_ALT: { DisplayName: 'Return height', Description: DESCRIPTION, Units: 'cm', Range: { low: '30', high: '300000' } },
  }
  for (let n = 0; n < 6000; n++) {
    params[`TEST_${n}`] = {
      DisplayName: `Made-up parameter ${n}`,
      Description: `A parameter only this test has, number ${n}, with a description as long as most real ones. `.repeat(3),
      Range: { low: '0', high: String(n + 10) },
      Values: { 0: 'Off', 1: 'On', 2: 'Auto' },
      User: 'Advanced',
    }
  }

  return JSON.stringify({ json: { version: 0 }, ArduCopter: params })
}

/**
 * The window.
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
 * The cache entry of the latest Copter file, wherever the app keeps its cache under the test's folder.
 *
 * @returns its path
 * @throws {Error} when there is none
 */
function cachedLatest(): string {
  const all = readdirSync(join(home, 'cache'), { recursive: true, encoding: 'utf8' })
  const found = all.find(path => path.endsWith('copter-latest.json'))
  if (!found) {
    throw new Error('no cache entry of the latest Copter metadata')
  }

  return join(home, 'cache', found)
}

/**
 * Connects the simulator (disconnecting first when it is connected), and waits for the metadata download to be over.
 *
 * @returns the line in Settings that says where the metadata came from
 */
async function connectAgain(): Promise<string> {
  await showScreen(window(), 'settings')

  if ((await window().text('#connection')).includes('connected · system')) {
    await window().click('#disconnect-button')
    await window().waitForText('#connection', /^disconnected/u)
  }
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 30_000)
  const line = `document.querySelector('#metadata-download-status').textContent`
  await window().waitFor(`!/Downloading|Nothing downloaded/u.test(${line})`, 30_000)

  return window().text('#metadata-download-status')
}

/**
 * What the description panel of RTL_ALT says.
 *
 * @returns its text
 */
async function rtlAltDescription(): Promise<string> {
  await showScreen(window(), 'parameters')
  await window().waitForText('#list-status', /^\d+ parameters$/u, 30_000)
  await window().click('tr[data-id="RTL_ALT"]')

  return window().text('#param-description')
}

/**
 * The seconds a cached load took, as the line says them.
 *
 * @param line the line in Settings
 * @returns the milliseconds
 */
function cachedMs(line: string): number {
  const found = /Loaded from this computer in (?<seconds>\d+\.\d+) s\./u.exec(line)
  if (!found?.groups?.seconds) {
    throw new Error(`not loaded from the cache: "${line}"`)
  }

  return Number(found.groups.seconds) * 1000
}

/**
 * What the stand-in answers a request with: 503 while it is down, the file for the latest Copter definitions, 404 for the rest.
 *
 * @param url the path asked for
 * @returns the status
 */
function statusFor(url: string | undefined): number {
  if (!stand.up) {
    return 503
  }

  return url === '/ArduCopter/apm.pdef.json' ? 200 : 404
}

beforeAll(async () => {
  const body = bigDefinitions()
  server = createServer((request, response) => {
    stand.hits.push(request.url ?? '')
    const status = statusFor(request.url)
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(status === 200 ? body : 'no')
  })
  await new Promise<void>(resolve => {
    server?.listen(0, '127.0.0.1', resolve)
  })
  process.env.DRONE_CONFIGURATOR_METADATA_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  presetSettings([{ key: 'metadata.download', value: 'on' }])
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
}, 60_000)

afterAll(async () => {
  await app?.close()
  server?.close()
  delete process.env.DRONE_CONFIGURATOR_METADATA_URL
})

it('shows the parameters without descriptions on a first run offline, and says why', async () => {
  const line = await connectAgain()

  expect(line).toMatch(/^Not downloaded: .*\. Parameters are shown without descriptions\.$/u)
  expect(await rtlAltDescription()).toMatch(/Load the parameter metadata/u)
}, 90_000)

it('downloads the latest file when the vehicle reports no released version, and says so', async () => {
  stand.up = true
  const line = await connectAgain()

  expect(line).toMatch(
    /^Latest Copter metadata from ArduPilot, downloaded .*: the vehicle did not report a released firmware version\.$/u,
  )
  expect(stand.hits).toContain('/ArduCopter/apm.pdef.json')
  await window().waitForText('.kit-toast', /latest Copter metadata is used/u)
  expect(await rtlAltDescription()).toContain(DESCRIPTION)
}, 90_000)

it('loads it from this computer at the next connections, without the server, within the budget', async () => {
  stand.up = false
  const before = stand.hits.length
  const samples: number[] = []
  for (let n = 0; n < SAMPLES; n++) {
    // eslint-disable-next-line no-await-in-loop -- one connection after the other
    samples.push(cachedMs(await connectAgain()))
  }

  expect(stand.hits.length).toBe(before)
  expect(await rtlAltDescription()).toContain(DESCRIPTION)
  expectWithinBudget('metadataCachedLoad', samples)
}, 300_000)

it('fetches a corrupt cache entry again', async () => {
  writeFileSync(cachedLatest(), '{"json": {"version": 0}, "ArduCopter": {"RTL_')
  stand.up = true
  const before = stand.hits.length

  const line = await connectAgain()

  expect(stand.hits.length).toBe(before + 1)
  expect(line).not.toMatch(/Loaded from this computer/u)
  expect(await rtlAltDescription()).toContain(DESCRIPTION)
}, 90_000)

it('downloads it again from the server with "Download again", from the keyboard', async () => {
  await showScreen(window(), 'settings')
  const before = stand.hits.length
  await window().evaluate(`document.querySelector('#metadata-refresh').focus()`)
  // Enter on the focused button: the key, and the character it types (a native button acts on the character).
  const enter = { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' }
  await window().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...enter })
  await window().devtools('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...enter })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...enter })

  await vi.waitFor(() => expect(stand.hits.length).toBe(before + 1), { timeout: 30_000 })
  await window().waitFor(`!/Downloading/u.test(document.querySelector('#metadata-download-status').textContent)`, 30_000)
  expect(await window().text('#metadata-download-status')).not.toMatch(/Loaded from this computer/u)
}, 90_000)
