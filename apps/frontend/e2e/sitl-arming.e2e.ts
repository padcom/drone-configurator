// Arming, disarming, the flight mode, the pre-arm checks and the emergency stop against ArduPilot SITL, through the real backend
// (the app has no buttons for them yet: the requests go over the page's bridge, see bridge-client.ts, and the telemetry is the
// app's own stream). It launches its own SITL, which starts with an arm voltage no battery can meet (BATT_ARM_VOLT 100), so that
// the first checks fail for a reason that is certain: "PreArm: Battery ... below minimum arming voltage".
//  1. The checks do not pass (telemetry.prearm), `vehicle.prearm` brings the vehicle's words, and an arm is refused with them and
//     arms nothing.
//  2. The arm voltage is let go; once the position and the EKF are ready the arm is accepted and the HEARTBEAT says armed (the
//     answer is never the state); a disarm on the ground is accepted and the heartbeat says disarmed.
//  3. RTL and Land are accepted and the heartbeat names the mode.
//  4. The emergency stop of a vehicle on the ground is accepted (ArduPilot accepts a forced disarm of a disarmed vehicle) and the
//     heartbeat says disarmed; then an arm (after the stop has finished) is accepted again. A stop's resends and the hold that
//     keeps an arm off while they run are tested with the simulated vehicle only, not here.
//  5. Take off: refused by the backend when the vehicle is disarmed (NOT_ARMED) and for an altitude outside 2 to 120 m
//     (INVALID_VALUE); in GUIDED and armed the vehicle accepts a takeoff to 5 m, and its own altitude reaches about 5 m; it lands
//     and disarms; a takeoff of a vehicle armed in STABILIZE is refused by the vehicle itself.
//  6. Nothing is sent when no vehicle is connected: every command is refused with NOT_CONNECTED.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The telemetry says the checks do not pass. */
const CHECKS_MS = 60_000
/** The position, the EKF and the sensors are ready: an arm is accepted (a minute of simulated time, more on a slow machine). */
const READY_MS = 300_000
/** A heartbeat after a command says what it did. */
const HEARTBEAT_MS = 15_000
/** How long a climb to 5 m, and then a landing with its automatic disarm, may take. */
const CLIMB_MS = 90_000
const LAND_MS = 180_000
/** ArduCopter's STABILIZE: a mode the vehicle arms in. */
const STABILIZE = 0
/** The arm voltage no battery meets. */
const IMPOSSIBLE_VOLTAGE = 100

let sitl: Sitl | undefined
let app: E2eApp | undefined
let backend: BridgeClient | undefined

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
 * The second client of the backend.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function client(): BridgeClient {
  if (!backend) {
    throw new Error('the client has not started')
  }

  return backend
}

/**
 * SITL.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function vehicleOf(): Sitl {
  if (!sitl) {
    throw new Error('SITL has not started')
  }

  return sitl
}

/** What the backend answered to a command, as these tests look at it. */
interface Armed {
  result: 'accepted' | 'refused' | 'unsupported' | 'no-answer'
  detail?: string
  code?: number
  messages: string[]
}

/**
 * Sends a command and reads its answer: it must have been answered by the vehicle.
 *
 * @param name the method
 * @param payload its request
 * @returns the vehicle's answer
 */
async function command(name: string, payload: unknown = null): Promise<Armed> {
  const answer = await client().call(name, payload)
  if (answer.error) {
    throw new Error(`${name} was refused by the backend: ${answer.error.code} ${answer.error.message}`)
  }

  return answer.result as Armed
}

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad', defaultParams: { BATT_ARM_VOLT: IMPOSSIBLE_VOLTAGE } })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  backend = new BridgeClient(app)
  await backend.install()
}

async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

async function refusesBeforeTheChecksPass(): Promise<void> {
  const seen = await client().until('the pre-arm checks are reported', s => s.prearm !== undefined, CHECKS_MS)

  expect(seen.prearm).toMatchObject({ enabled: true, passing: false })
  const run = await command('vehicle.prearm')

  // ArduPilot answers a run of the checks ACCEPTED whatever they found: what failed is in its words
  expect(run.result).toBe('accepted')
  expect(run.messages.some(text => /^PreArm: .*arming voltage/u.test(text))).toBe(true)
  const arm = await command('vehicle.arm')

  // The vehicle refuses (FAILED). Its reasons are the texts the checks printed (in `run` above): ArduPilot does not print the
  // same pre-arm text again at once, so the arm's own answer may carry none (which is why the page must show the vehicle's
  // messages, and not only an answer's).
  expect(arm.result).toBe('refused')
  expect(arm.code).toBe(4)
  expect((await client().telemetry())?.armed).toBe(false)
}

/**
 * Asks for an arm until the vehicle accepts it (its checks pass once the position and the EKF are ready): each refusal is real.
 *
 * @returns the answer that accepted
 */
async function armWhenReady(): Promise<Armed> {
  const deadline = Date.now() + READY_MS
  let last: Armed | undefined
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    last = await command('vehicle.arm')

    if (last.result === 'accepted') {
      return last
    }
    expect(last.result).toBe('refused')
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await new Promise<void>(resolve => {
      setTimeout(resolve, 5000)
    })
  }
  throw new Error(`the vehicle did not accept an arm in ${READY_MS} ms: ${JSON.stringify(last)}`)
}

async function armsAndDisarms(): Promise<void> {
  await vehicleOf().setParam('BATT_ARM_VOLT', 0)
  await armWhenReady()
  // the heartbeat says it: the answer is not the state
  const armed = await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)

  expect(armed.prearm?.passing).toBe(true)
  const disarm = await command('vehicle.disarm')

  expect(disarm.result).toBe('accepted')
  await client().until('the heartbeat says disarmed', s => !s.armed, HEARTBEAT_MS)
}

async function changesTheMode(): Promise<void> {
  const modes = await client().call('vehicle.modes')
  const known = (modes.result as { modes: { number: number, name: string }[] }).modes
  const named = (name: string) => known.find(m => m.name === name)?.number

  for (const name of ['LAND', 'RTL']) {
    // eslint-disable-next-line no-await-in-loop -- one change after the other
    const answer = await command('vehicle.setMode', { mode: named(name) })

    expect(answer.result).toBe('accepted')
    // eslint-disable-next-line no-await-in-loop -- one change after the other
    await client().until(`the heartbeat says ${name}`, s => s.mode === name, HEARTBEAT_MS)
  }
}

async function stopsAVehicleOnTheGround(): Promise<void> {
  const stop = await command('vehicle.emergencyStop')

  expect(stop.result).toBe('accepted')
  const seen = await client().until('the heartbeat says disarmed', s => !s.armed, HEARTBEAT_MS)

  expect(seen.armed).toBe(false)
  // arm, and stop it armed: the heartbeat says it stopped (RTL is not a mode to arm in: back to STABILIZE first)
  expect((await command('vehicle.setMode', { mode: STABILIZE })).result).toBe('accepted')
  await client().until('the heartbeat says STABILIZE', s => s.mode === 'STABILIZE', HEARTBEAT_MS)
  await armWhenReady()
  await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)
  expect((await command('vehicle.emergencyStop')).result).toBe('accepted')
  await client().until('the heartbeat says disarmed after the stop', s => !s.armed, HEARTBEAT_MS)
}

/**
 * Changes the mode by name and waits for the heartbeat to name it.
 *
 * @param name the mode
 */
async function goesTo(name: string): Promise<void> {
  const modes = await client().call('vehicle.modes')
  const number = (modes.result as { modes: { number: number, name: string }[] }).modes.find(mode => mode.name === name)?.number

  expect((await command('vehicle.setMode', { mode: number })).result).toBe('accepted')
  await client().until(`the heartbeat says ${name}`, s => s.mode === name, HEARTBEAT_MS)
}

async function refusesATakeoffThatIsNotAllowed(): Promise<void> {
  // disarmed: the backend sends nothing
  expect((await client().call('vehicle.takeoff', { altitude: 5 })).error?.code).toBe('NOT_ARMED')

  // out of its limits (2 to 120 m): the backend sends nothing, armed or not
  for (const altitude of [1, 121, Number.NaN]) {
    // eslint-disable-next-line no-await-in-loop -- one after the other
    expect((await client().call('vehicle.takeoff', { altitude })).error?.code, String(altitude)).toBe('INVALID_VALUE')
  }
}

async function takesOffInGuidedAndLands(): Promise<void> {
  await goesTo('GUIDED')
  await armWhenReady()
  await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)
  const up = await command('vehicle.takeoff', { altitude: 5 })

  expect(up.result).toBe('accepted')
  // the vehicle's own altitude says it: the answer is not the flight
  const seen = await client().until('the vehicle is about 5 m above home', s => (s.position?.relativeAltitude ?? 0) > 4, CLIMB_MS)

  expect(seen.position?.relativeAltitude).toBeLessThan(8)
  await goesTo('LAND')
  await client().until('the vehicle has landed and disarmed', s => !s.armed, LAND_MS)
}

async function refusesATakeoffOfAVehicleNotInGuided(): Promise<void> {
  await goesTo('STABILIZE')
  await armWhenReady()
  await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)

  // ArduPilot does not take off by command in STABILIZE: its own refusal (FAILED), with the vehicle still on the ground
  expect((await command('vehicle.takeoff', { altitude: 5 })).result).toBe('refused')
  expect((await command('vehicle.disarm')).result).toBe('accepted')
  await client().until('the heartbeat says disarmed', s => !s.armed, HEARTBEAT_MS)
}

async function sendsNothingWithoutAVehicle(): Promise<void> {
  await client().call('vehicle.disconnect')

  const asks: [string, unknown][] = [
    ['vehicle.arm', null],
    ['vehicle.disarm', null],
    ['vehicle.emergencyStop', null],
    ['vehicle.prearm', null],
    ['vehicle.takeoff', { altitude: 5 }],
  ]

  for (const [name, payload] of asks) {
    // eslint-disable-next-line no-await-in-loop -- one after the other
    const answer = await client().call(name, payload)

    expect(answer.error?.code, name).toBe('NOT_CONNECTED')
  }
  expect((await client().call('vehicle.setMode', { mode: 6 })).error?.code).toBe('NOT_CONNECTED')
  await window().waitForText('#connection', 'disconnected', 10_000)
}

describeSitl(
  'arming, modes and the pre-arm checks against ArduPilot SITL',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)

    it('says the checks do not pass, and refuses an arm with its words', refusesBeforeTheChecksPass, CHECKS_MS + 60_000)
    it('arms once the checks pass, and the heartbeat says armed and then disarmed', armsAndDisarms, READY_MS + 60_000)
    it('changes the mode to LAND and RTL, and the heartbeat names them', changesTheMode, 60_000)
    it('stops a vehicle with the emergency stop, and the heartbeat says disarmed', stopsAVehicleOnTheGround, READY_MS + 60_000)
    it('refuses a takeoff when disarmed and an altitude out of limits, sending nothing', refusesATakeoffThatIsNotAllowed, 60_000)
    it('takes off in GUIDED to 5 m (its altitude says so), and lands', takesOffInGuidedAndLands, READY_MS + CLIMB_MS + LAND_MS)
    it('has a vehicle that is not in GUIDED refuse the takeoff', refusesATakeoffOfAVehicleNotInGuided, READY_MS + 60_000)
    it('refuses every command when no vehicle is connected', sendsNothingWithoutAVehicle, 60_000)
  },
  { launchOnly: true },
)
