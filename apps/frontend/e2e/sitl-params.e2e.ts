// The parameter table (#36) against ArduPilot SITL (Copter), in the real window with the real backend, and a LOCAL stand-in for
// ArduPilot's server (DRONE_CONFIGURATOR_METADATA_URL): no pull request depends on the real server (that is
// weekly-params-metadata.e2e.ts, weekly). The checks are param-table-checks.ts, over the vehicle's real list of some 1,400
// parameters.
//
// The stand-in's file is made from the parameters the vehicle has (names differ between firmware versions): they are read from a
// snapshot the app saves, then "Download again" fetches the file. Each parameter has a description of ArduPilot's length, a user
// (the attitude controller's are advanced) and a group as ArduPilot's definitions have them: the vehicle's own (ArduCopter) for
// the failsafes, the flight modes, the pilot's and the names without an underscore, a library's (`BATT_`) for the rest.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp, presetSettings } from './launch'
import { paramTableTests } from './param-table-checks'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long the connection, the download of the parameters and of the metadata may take. */
const READY_MS = 120_000

/** Words a description is made of: ArduPilot's run to a few hundred characters of words like these. */
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
  'motor']

/** The parameters the stand-in describes (none until they are read from the vehicle's list), and whether it answers. */
const stand = { up: false, ids: [] as string[] }

let server: Server | undefined
let sitl: Sitl | undefined
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
 * The group a parameter is in, as ArduPilot's definitions have it.
 *
 * @param id the parameter
 * @returns the vehicle's own group, or its library's
 */
function groupOf(id: string): string {
  const at = id.indexOf('_')

  return at < 0 || /^(?:FS_|FLTMODE|PILOT_)/u.test(id) ? 'ArduCopter' : id.slice(0, at + 1)
}

/**
 * What the stand-in says of a parameter.
 *
 * @param id the parameter
 * @param i its place in the list
 * @returns its short and long description, and who it is for
 */
function entryOf(id: string, i: number): { name: string, text: string, user: string } {
  const text = Array.from({ length: 40 }, (_, w) => WORDS[(i * 7 + w * 13) % WORDS.length]).join(' ')

  const user = id.startsWith('ATC_') ? 'Advanced' : 'Standard'

  return { name: `Stand-in ${id.toLowerCase().replaceAll('_', ' ')}`, text, user }
}

/**
 * The parameters the stand-in knows, by their group.
 *
 * @returns the groups, each with its parameters and their places
 */
function byGroup(): Map<string, [string, number][]> {
  const groups = new Map<string, [string, number][]>()
  stand.ids.forEach((id, i) => {
    groups.set(groupOf(id), [...groups.get(groupOf(id)) ?? [], [id, i]])
  })

  return groups
}

/**
 * The latest definitions, in ArduPilot's JSON form.
 *
 * @returns the text
 */
function latestJson(): string {
  const file: Record<string, unknown> = { json: { version: 0 } }
  for (const [group, params] of byGroup()) {
    file[group] = Object.fromEntries(params.map(([id, i]) => {
      const { name, text, user } = entryOf(id, i)

      return [id, { DisplayName: name, Description: text, User: user }]
    }))
  }

  return JSON.stringify(file)
}

/**
 * A released version's definitions, in ArduPilot's XML form.
 *
 * @returns the text
 */
function versionXml(): string {
  const groups = [...byGroup()].map(([group, params]) => {
    const prefix = group === 'ArduCopter' ? 'ArduCopter:' : ''
    const lines = params.map(([id, i]) => {
      const { name, text, user } = entryOf(id, i)

      return `<param humanName="${name}" name="${prefix}${id}" documentation="${text}" user="${user}"/>`
    })

    return `<parameters name="${group}">\n${lines.join('\n')}\n</parameters>`
  })
  const vehicle = groups.filter(group => group.includes('"ArduCopter"'))
  const libraries = groups.filter(group => !group.includes('"ArduCopter"'))

  return `<?xml version="1.0"?>\n<paramfile><vehicles>${vehicle.join('\n')}</vehicles>`
    + `<libraries>${libraries.join('\n')}</libraries></paramfile>\n`
}

/**
 * The file for a path: the latest Copter definitions, or any released version's.
 *
 * @param url the path
 * @returns the file, or null for any other path
 */
function fileFor(url: string): string | null {
  if (url === '/ArduCopter/apm.pdef.json') {
    return latestJson()
  }

  return /^\/versioned\/Copter\/stable-\d+\.\d+\.\d+\/apm\.pdef\.xml$/u.test(url) ? versionXml() : null
}

/**
 * The status of an answer.
 *
 * @param file the file it gives, if any
 * @returns 200 with a file, else 404 (the stand-in has no such file) or 503 (it is down)
 */
function statusOf(file: string | null): number {
  if (file !== null) {
    return 200
  }

  return stand.up ? 404 : 503
}

/**
 * Answers a request: 503 while the stand-in is down, 404 for a file it has not, the file else (whole: the app takes it so too).
 *
 * @param request the request
 * @param response its answer
 */
function serve(request: IncomingMessage, response: ServerResponse): void {
  const file = stand.up ? fileFor(request.url ?? '') : null
  response.writeHead(statusOf(file), { etag: '"stand-in"' })
  response.end(file ?? 'no')
}

/**
 * The names of the vehicle's parameters, from a snapshot the app saves into the test's folder.
 *
 * @returns the names
 */
async function vehicleNames(): Promise<string[]> {
  await window().click('#save')
  const deadline = Date.now() + 10_000
  let saved: string | undefined
  while (saved === undefined && Date.now() < deadline) {
    saved = readdirSync(files).find(name => name.startsWith('params-'))
    // eslint-disable-next-line no-await-in-loop -- waits for the file to be written
    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })
  }
  const snapshot = JSON.parse(readFileSync(join(files, saved ?? ''), 'utf8')) as { params: { id: string }[] }

  return snapshot.params.map(param => param.id)
}

/** Starts the stand-in, SITL and the app, connects, reads the vehicle's names, and downloads the stand-in's metadata. */
async function startAll(): Promise<void> {
  server = createServer(serve)
  await new Promise<void>(resolve => {
    server?.listen(0, '127.0.0.1', resolve)
  })
  process.env.DRONE_CONFIGURATOR_METADATA_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  presetSettings([{ key: 'metadata.download', value: 'on' }, { key: 'params.groups', value: 'on' }])
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: sitl.endpoint.host, port: String(sitl.endpoint.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters/u, 90_000)

  stand.ids = await vehicleNames()
  stand.up = true
  await showScreen(app, 'settings')
  await app.click('#metadata-refresh')
  await app.waitForText('#metadata-download-status', / metadata from ArduPilot, downloaded /u, 60_000)
  await showScreen(app, 'parameters')
  await app.waitFor(`document.querySelector('.param-scroll table.described') !== null`, READY_MS)
}

/** Stops what was started. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
    server?.close()
    delete process.env.DRONE_CONFIGURATOR_METADATA_URL
    delete process.env.DRONE_CONFIGURATOR_TEST_FILES
    rmSync(files, { recursive: true, force: true })
  }
}

describeSitl('the parameter table against SITL, with a stand-in for ArduPilot\'s server', () => {
  beforeAll(startAll, READY_MS + 180_000)
  afterAll(stopAll)
  paramTableTests(window)
}, { launchOnly: true })
