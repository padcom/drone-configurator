// Against ArduPilot SITL for every vehicle type besides Copter (sitl.e2e.ts and the other sitl-*.e2e.ts have Copter): Heli,
// Plane, Rover, Sub, Blimp and Tracker, each at its default frame, launched one after the other. Each is connected over TCP,
// named as the vehicle type its heartbeat says, and has its parameters downloaded. CI builds and caches all seven
// (.github/sitl-build.sh, SITL_DIR); without one, its suite fails in CI and is skipped elsewhere.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, type VehicleName, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** Each vehicle, and the MAV_TYPE its heartbeat gives (the top bar says it as the protocol names it). */
const VEHICLES: [vehicle: VehicleName, type: string][] = [
  ['heli', 'HELICOPTER'],
  ['plane', 'FIXED_WING'],
  ['rover', 'GROUND_ROVER'],
  ['sub', 'SUBMARINE'],
  ['blimp', 'AIRSHIP'],
  ['tracker', 'ANTENNA_TRACKER'],
]

/** At least this many parameters: every vehicle has a few hundred; a download that stopped early has fewer. */
const MIN_PARAMETERS = 50

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
}

/**
 * The tests of one vehicle type: its own simulator and app, started and stopped around them.
 *
 * @param vehicle the vehicle
 * @param type the MAV_TYPE its heartbeat gives
 */
function vehicleTests(vehicle: VehicleName, type: string): void {
  let sitl: Sitl | undefined
  let app: E2eApp | undefined

  beforeAll(async () => {
    sitl = await startSitl({ vehicle })
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

  it(`is connected and named a ${type}`, async () => {
    await app!.waitForText('#connection', new RegExp(`^connected · system \\d+/\\d+ · ${type} · ARDUPILOTMEGA`, 'u'), 60_000)
  }, 70_000)

  it('has its parameters downloaded', async () => {
    await showScreen(app!, 'parameters')
    const status = await app!.waitForText('#list-status', /^\d+ parameters/u, 90_000)

    expect(Number.parseInt(status, 10)).toBeGreaterThanOrEqual(MIN_PARAMETERS)
  }, 100_000)
}

for (const [vehicle, type] of VEHICLES) {
  describeSitl(`the configurator against ArduPilot SITL: ${vehicle}`, () => {
    vehicleTests(vehicle, type)
  }, { vehicle, launchOnly: true })
}
