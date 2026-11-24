// The parameter metadata of a real vehicle (#35), against ArduPilot SITL (Copter over TCP) in the real window with the real
// backend, and a LOCAL stand-in for ArduPilot's server (DRONE_CONFIGURATOR_METADATA_URL): no pull request depends on the real
// server (that is weekly-metadata-server.e2e.ts, weekly). The stand-in answers ranges in parts, as the real server does, and
// serves the file of a released version (XML) and the latest (JSON), each describing the parameters this vehicle has.
//
// First run offline: the parameters are shown without descriptions, and Settings says why. With the server: "Download again"
// asks for the version the vehicle reports (its released file when it is a release, else the latest, and Settings says which),
// in parts, and the vehicle's parameters are described. The next connection loads it from this computer, without the server.
//
// The names of parameters differ between firmware versions (MAV_SYSID and SYSID_THISMAV), so the file is made from the
// parameters the vehicle has, read from the list.
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp, presetSettings } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How many of the first parameters of the list the file describes and the test looks at. */
const LOOKED_AT = 10
/** The size of a part the stand-in sends for a range (the backend asks for 128 KiB; the file is smaller: one or two parts). */
const STAND_IN_PART = 2048

/** What the stand-in does, and what it saw. */
const stand = { up: false, hits: [] as string[], ranges: 0, ids: [] as string[] }

let server: Server | undefined
let sitl: Sitl | undefined
let app: E2eApp | undefined

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
 * The description the stand-in gives a parameter.
 *
 * @param id the parameter
 * @returns the text
 */
const descriptionOf = (id: string) => `Stand-in description of ${id}.`

/**
 * The latest definitions, in ArduPilot's JSON form, of the parameters the stand-in knows (and filler, so that it comes in parts).
 *
 * @returns the text
 */
function latestJson(): string {
  const entry = (id: string) => [id, { DisplayName: descriptionOf(id), Description: 'Made up by the test.' }]
  const params = Object.fromEntries(stand.ids.map(entry))

  return JSON.stringify({ json: { version: 0 }, ArduCopter: params, filler: { pad: 'x'.repeat(4000) } })
}

/**
 * A released version's definitions, in ArduPilot's XML form.
 *
 * @returns the text
 */
function versionXml(): string {
  const param = (id: string) => `<param humanName="${descriptionOf(id)}" name="ArduCopter:${id}" documentation="Made up."/>`
  const params = stand.ids.map(param)

  const vehicle = `<parameters name="ArduCopter">\n${params.join('\n')}\n</parameters>`

  return `<?xml version="1.0"?>\n<paramfile><vehicles>${vehicle}</vehicles>`
    + `<!-- ${'x'.repeat(4000)} -->\n</paramfile>\n`
}

/** What the stand-in answers. */
interface Answer {
  /** The status. */
  status: number
  /** The headers beside the ETag. */
  headers: Record<string, string>
  /** The body. */
  text: string
}

/**
 * The body of a request, whole or the part a `Range` asks for.
 *
 * @param body the file
 * @param range the `Range` header, if any
 * @returns the status, the headers and the bytes
 */
function partOf(body: string, range: string | undefined): Answer {
  const found = /^bytes=(?<from>\d+)-(?<to>\d+)$/u.exec(range ?? '')
  if (!found?.groups) {
    return { status: 200, headers: {}, text: body }
  }
  stand.ranges += 1
  const from = Number(found.groups.from)
  const to = Math.min(Number(found.groups.to), from + STAND_IN_PART - 1, body.length - 1)

  return { status: 206, headers: { 'content-range': `bytes ${from}-${to}/${body.length}` }, text: body.slice(from, to + 1) }
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
 * Waits for the metadata download to be over.
 *
 * @returns the line in Settings that says where the metadata came from
 */
async function settled(): Promise<string> {
  await showScreen(window(), 'settings')
  const line = `document.querySelector('#metadata-download-status').textContent`
  await window().waitFor(`!/Downloading|Nothing downloaded/u.test(${line})`, 60_000)

  return window().text('#metadata-download-status')
}

/**
 * How many of the parameters the file describes have their description on the Parameters screen.
 *
 * @returns the count
 */
async function described(): Promise<number> {
  await showScreen(window(), 'parameters')
  let count = 0
  for (const id of stand.ids) {
    // eslint-disable-next-line no-await-in-loop -- one selection after the other
    await window().click(`tr[data-id="${id}"]`)
    // eslint-disable-next-line no-await-in-loop -- one selection after the other
    await window().waitForText('#detail .param-name', id)
    // eslint-disable-next-line no-await-in-loop -- one selection after the other
    count += await window().text('#detail .description') === descriptionOf(id) ? 1 : 0
  }

  return count
}

/**
 * What the stand-in answers a request with.
 *
 * @param request the request
 * @returns the answer
 */
function answerFor(request: IncomingMessage): Answer {
  if (!stand.up) {
    return { status: 503, headers: {}, text: 'no' }
  }
  const file = fileFor(request.url ?? '')

  return file === null ? { status: 404, headers: {}, text: 'no' } : partOf(file, request.headers.range)
}

/**
 * Answers a request: 503 while the stand-in is down, 404 for a file it has not, the file (or the part asked for) else.
 *
 * @param request the request
 * @param response its answer
 */
function serve(request: IncomingMessage, response: ServerResponse): void {
  stand.hits.push(request.url ?? '')
  const { status, headers, text } = answerFor(request)
  response.writeHead(status, { ...headers, etag: '"stand-in"' })
  response.end(text)
}

/** Starts the stand-in, SITL and the app, and chooses the vehicle's connection. */
async function startAll(): Promise<void> {
  server = createServer(serve)
  await new Promise<void>(resolve => {
    server?.listen(0, '127.0.0.1', resolve)
  })
  process.env.DRONE_CONFIGURATOR_METADATA_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  presetSettings([{ key: 'metadata.download', value: 'on' }])
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: sitl.endpoint.host, port: String(sitl.endpoint.port) })
}

/** Stops what was started. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
    server?.close()
    delete process.env.DRONE_CONFIGURATOR_METADATA_URL
  }
}

/**
 * What Settings says for a file of a version: that version's, or the latest when the vehicle reported no release.
 *
 * @param version the version whose file was asked for, if one was
 * @returns the line, as a pattern
 */
function lineFor(version: string | undefined): RegExp {
  return version === undefined
    ? /^Latest Copter metadata from ArduPilot, downloaded .*: the vehicle did not report a released firmware version\.$/u
    : new RegExp(`^Copter ${version.replaceAll('.', '\\.')} metadata from ArduPilot, downloaded `, 'u')
}

/** The first run, offline: nothing is described, and Settings says why. */
async function offlineFirst(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 60_000)

  expect(await settled()).toMatch(/^Not downloaded: .*\. Parameters are shown without descriptions\.$/u)
  await showScreen(window(), 'parameters')
  await window().waitForText('#list-status', /^\d+ parameters$/u, 90_000)
  const rows = `[...document.querySelectorAll('tr[data-id]')].slice(0, ${LOOKED_AT})`
  stand.ids = await window().evaluate<string[]>(`${rows}.map(row => row.dataset.id)`)
  expect(stand.ids).toHaveLength(LOOKED_AT)
  expect(await described()).toBe(0)
}

/** With the server: Download again asks for the vehicle's version, in parts. */
async function downloadsInParts(): Promise<void> {
  stand.up = true
  await showScreen(window(), 'settings')
  await window().click('#metadata-refresh')
  const line = await settled()

  const asked = stand.hits.filter(hit => hit.includes('apm.pdef'))
  // A release has its own file (the stand-in has every one); anything else is the latest, and Settings says which it is.
  expect(line).toMatch(lineFor(/^\/versioned\/Copter\/stable-(?<v>[\d.]+)\//u.exec(asked[0] ?? '')?.groups?.v))
  expect(stand.ranges).toBeGreaterThan(1)
  expect(await described()).toBe(LOOKED_AT)
}

/** The next connection: from this computer, without the server. */
async function fromTheCache(): Promise<void> {
  stand.up = false
  const before = stand.hits.length
  await showScreen(window(), 'settings')
  await window().click('#disconnect-button')
  await window().waitForText('#connection', /^disconnected/u)
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 60_000)

  expect(await settled()).toMatch(/Loaded from this computer in /u)
  expect(stand.hits.length).toBe(before)
  expect(await described()).toBe(LOOKED_AT)
}

describeSitl('the parameter metadata of a SITL vehicle, from a stand-in for ArduPilot\'s server', () => {
  beforeAll(startAll, 120_000)
  afterAll(stopAll)

  it('shows the parameters without descriptions on a first run offline, and says why', offlineFirst, 180_000)
  it('downloads the file for the version the vehicle reports, in parts, and describes its parameters', downloadsInParts, 180_000)
  it('loads it from this computer at the next connection, without the server', fromTheCache, 180_000)
})
