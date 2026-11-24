// WEEKLY ONLY (.github/workflows/weekly-e2e.yml; the `weekly-` name keeps it out of every pull request's and push's CI, see
// .github/ci-select.mjs `WEEKLY_SPEC`): it depends on ArduPilot's real server, which must not block a change. Every pull request
// has sitl-metadata.e2e.ts instead, against a local stand-in.
//
// The parameter metadata of each vehicle type (#35), from ArduPilot's REAL server, against ArduPilot SITL: Copter, Plane, Rover,
// Sub, Antenna Tracker and Blimp, each connected over TCP in the real window with the real backend, which downloads the metadata
// for the vehicle's kind and firmware version (the version's file, or the latest when the server has none for it, and the line in
// Settings says which), and the Parameters screen then describes the vehicle's parameters. And the definitions of a released
// version (`apm.pdef.xml`: the server has no JSON of one) of each type that has them are read by the app's own reader.
//
// Nothing of the GPL data set is in the repository: it is fetched while the test runs. The names of parameters differ between
// firmware versions (MAV_SYSID and SYSID_THISMAV), so no name is assumed: the parameters the vehicle has are the ones looked at.
import { afterAll, beforeAll, expect, it } from 'vitest'
// @ts-expect-error -- jsdom has no types in this repository; only its DOMParser is used, for the reader of the XML file
import { JSDOM } from 'jsdom'
import type { Metadata, ParamMeta } from '../src/lib/params/metadata'
import { parsePdefXml } from '../src/lib/params/metadataXml'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp, presetSettings } from './launch'
import { type Sitl, type VehicleName, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** Each vehicle, the name the line in Settings gives its kind, and the folder of its released versions on the server. */
const VEHICLES: [vehicle: VehicleName, kind: string, versioned: string][] = [
  ['copter', 'Copter', 'Copter'],
  ['plane', 'Plane', 'Plane'],
  ['rover', 'Rover', 'Rover'],
  ['sub', 'Sub', 'Sub'],
  ['tracker', 'Antenna Tracker', 'Tracker'],
  ['blimp', 'Blimp', ''],
]

/** A released version every type with released files has on the server. */
const RELEASED = '4.7.1'

/** How many of the first parameters in the list are looked at, and how many of them must have a description at least. */
const LOOKED_AT = 10
const DESCRIBED_AT_LEAST = 7

/** How long the download of a definition file from ArduPilot's server may take (a few MB). */
const DOWNLOAD_MS = 120_000

/**
 * Connects the app to a simulator over TCP.
 *
 * @param app the running app
 * @param sitl the simulator
 */
async function connect(app: E2eApp, sitl: Sitl): Promise<void> {
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: sitl.endpoint.host, port: String(sitl.endpoint.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
}

/**
 * How many of the first parameters of the list have a description, selected one after the other.
 *
 * @param app the running app
 * @returns the count
 */
async function describedOfTheFirst(app: E2eApp): Promise<number> {
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters/u, 90_000)
  const rows = `[...document.querySelectorAll('tr[data-id]')].slice(0, ${LOOKED_AT})`
  const ids = await app.evaluate<string[]>(`${rows}.map(row => row.dataset.id)`)
  let described = 0
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop -- one selection after the other
    await app.click(`tr[data-id="${id}"]`)
    // eslint-disable-next-line no-await-in-loop -- one selection after the other
    await app.waitForText('#detail .param-name', id)
    // eslint-disable-next-line no-await-in-loop -- one selection after the other
    described += await app.evaluate<boolean>(`(document.querySelector('#detail .description')?.textContent ?? '') !== ''`) ? 1 : 0
  }

  return described
}

/**
 * The tests of one vehicle type: its own simulator and app.
 *
 * @param vehicle the vehicle
 * @param kind the name the line in Settings gives its kind
 */
function vehicleTests(vehicle: VehicleName, kind: string): void {
  let sitl: Sitl | undefined
  let app: E2eApp | undefined

  beforeAll(async () => {
    sitl = await startSitl({ vehicle })
    presetSettings([{ key: 'metadata.download', value: 'on' }])
    app = await launchApp()
    await connect(app, sitl)
  }, 120_000)

  afterAll(async () => {
    try {
      await app?.close()
    } finally {
      await sitl?.stop()
    }
  })

  it(`downloads the ${kind} metadata from ArduPilot, and says which file it is`, async () => {
    await showScreen(app!, 'settings')
    const line = await app!.waitForText('#metadata-download-status', / metadata from ArduPilot, downloaded /u, DOWNLOAD_MS)

    expect(line).toMatch(new RegExp(`^(${kind} \\d+\\.\\d+\\.\\d+|Latest ${kind}) metadata from ArduPilot, downloaded `, 'u'))
  }, DOWNLOAD_MS + 10_000)

  it('describes the vehicle\'s parameters', async () => {
    expect(await describedOfTheFirst(app!)).toBeGreaterThanOrEqual(DESCRIBED_AT_LEAST)
  }, 120_000)
}

/**
 * The share of the parameters whose metadata has a field.
 *
 * @param metadata the metadata
 * @param field the field
 * @returns from 0 to 1
 */
function shareOf(metadata: Metadata, field: keyof ParamMeta): number {
  return [...metadata.values()].filter(meta => meta[field] !== undefined).length / metadata.size
}

for (const [vehicle, kind] of VEHICLES) {
  describeSitl(`the parameter metadata from ArduPilot against SITL: ${vehicle}`, () => {
    vehicleTests(vehicle, kind)
  }, { vehicle, launchOnly: true })
}

describeSitl('the definitions of a released version from ArduPilot\'s server', () => {
  for (const [, kind, versioned] of VEHICLES.filter(([, , folder]) => folder !== '')) {
    it(`are read for ${kind} ${RELEASED}`, async () => {
      const url = `https://autotest.ardupilot.org/Parameters/versioned/${versioned}/stable-${RELEASED}/apm.pdef.xml`
      const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_MS) })
      expect(response.status).toBe(200)
      const { DOMParser } = (new JSDOM('') as { window: { DOMParser: typeof globalThis.DOMParser } }).window
      globalThis.DOMParser = DOMParser

      const metadata = parsePdefXml(await response.text())

      expect(metadata.size).toBeGreaterThan(300)
      expect(shareOf(metadata, 'description')).toBeGreaterThan(0.9)
      expect(shareOf(metadata, 'values')).toBeGreaterThan(0)
      expect(shareOf(metadata, 'bits')).toBeGreaterThan(0)
      expect(shareOf(metadata, 'max')).toBeGreaterThan(0)
    }, DOWNLOAD_MS + 10_000)
  }
}, { launchOnly: true })
