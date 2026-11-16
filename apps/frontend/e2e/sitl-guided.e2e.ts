// Guided control against ArduPilot SITL, through the real backend (the requests go over the page's bridge, see
// bridge-client.ts; the app has no buttons for them yet). The vehicle starts with FS_GCS_ENABLE 0 (a Copter's default),
// which the backend looks at:
//  1. Refused, nothing sent: a reposition of a disarmed vehicle (NOT_ARMED) and of one on the ground (NOT_AIRBORNE); out
//     of GUIDED (NOT_GUIDED); 0, 0, NaN and a place off the globe (INVALID_VALUE); beyond the request's limits
//     (OUT_OF_LIMITS); with the GCS failsafe off and the policy `block` (GCS_FAILSAFE_OFF).
//  2. Armed in GUIDED and 10 m up: with the policy `warn` a reposition about 55 m north is ACCEPTED with the failsafe's
//     warning in its messages, and the vehicle's OWN position moves there (the answer is not the flight).
//  3. With FS_GCS_ENABLE 1: a change of altitude goes to the new height and keeps the place, a speed is accepted, and
//     set home here is accepted once the vehicle stands still; its height above home is then about 0 (home's altitude
//     moved with it).
//  4. Land, disarm.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient, type Seen } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The position and the EKF are ready: an arm is accepted. */
const READY_MS = 300_000
/** A heartbeat after a command says what it did. */
const HEARTBEAT_MS = 15_000
/** A flight leg. */
const LEG_MS = 90_000
/** What a page sends by default: 50 m, 500 m, 10 m/s. */
const LIMITS = { maxAltitude: 50, maxDistance: 500, maxSpeed: 10 }

let sitl: Sitl | undefined
let app: E2eApp | undefined
let backend: BridgeClient | undefined

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
interface Answer {
  result: 'accepted' | 'refused' | 'unsupported' | 'no-answer'
  messages: string[]
}

/**
 * Calls a method and gives what came of it: the error's code, or the vehicle's answer's name.
 *
 * @param name the method
 * @param payload its request
 * @returns the code of the refusal, or the name of the result
 */
async function outcome(name: string, payload: unknown = null): Promise<string> {
  const answer = await client().call(name, payload)

  return answer.error ? answer.error.code : (answer.result as Answer).result
}

/**
 * Calls a method that the vehicle must have answered.
 *
 * @param name the method
 * @param payload its request
 * @returns the answer
 */
async function answered(name: string, payload: unknown): Promise<Answer> {
  const answer = await client().call(name, payload)
  if (answer.error) {
    throw new Error(`${name} was refused by the backend: ${answer.error.code} ${answer.error.message}`)
  }

  return answer.result as Answer
}

/**
 * The reposition request to a place.
 *
 * @param latitude degrees
 * @param longitude degrees
 * @param altitude metres above home
 * @param failsafe the policy
 * @returns the request
 */
function reposition(latitude: number, longitude: number, altitude: number, failsafe: 'block' | 'warn'): unknown {
  return { latitude, longitude, altitude, limits: LIMITS, failsafe }
}

/**
 * Where the vehicle says it is.
 *
 * @returns its position
 * @throws {Error} when it says none
 */
async function whereItIs(): Promise<NonNullable<Seen['position']>> {
  const position = (await client().telemetry())?.position
  if (!position) {
    throw new Error('the vehicle reports no position')
  }

  return position
}

/**
 * Changes the mode by name and waits for the heartbeat to name it.
 *
 * @param name the mode
 */
async function goesTo(name: string): Promise<void> {
  const modes = await client().call('vehicle.modes')
  const number = (modes.result as { modes: { number: number, name: string }[] }).modes.find(mode => mode.name === name)?.number

  expect((await answered('vehicle.setMode', { mode: number })).result).toBe('accepted')
  await client().until(`the heartbeat says ${name}`, s => s.mode === name, HEARTBEAT_MS)
}

/**
 * The number of a flight mode of the vehicle, by its name.
 *
 * @param name the mode
 * @returns its number
 */
async function modeNumber(name: string): Promise<number | undefined> {
  const modes = await client().call('vehicle.modes')

  return (modes.result as { modes: { number: number, name: string }[] }).modes.find(mode => mode.name === name)?.number
}

/**
 * Asks once for GUIDED and, when the vehicle takes it, for an arm.
 *
 * @param guided the number of GUIDED
 * @returns whether the vehicle accepted both
 */
async function triesGuidedAndArm(guided: number | undefined): Promise<boolean> {
  const asked = await outcome('vehicle.setMode', { mode: guided })

  return asked === 'accepted' && await outcome('vehicle.arm') === 'accepted'
}

/**
 * Puts the vehicle in GUIDED and arms it, asking again until it accepts both (GUIDED needs the position, and the arm the
 * checks: both come once the position and the EKF are ready).
 *
 * @throws {Error} when it never does
 */
async function armInGuided(): Promise<void> {
  const guided = await modeNumber('GUIDED')
  const deadline = Date.now() + READY_MS
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    if (await triesGuidedAndArm(guided)) {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await new Promise<void>(resolve => {
      setTimeout(resolve, 5000)
    })
  }
  throw new Error(`the vehicle did not take GUIDED and an arm in ${READY_MS} ms`)
}

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad', defaultParams: { FS_GCS_ENABLE: 0 } })
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

/**
 * Whether the vehicle is north of a latitude and about 20 m up.
 *
 * @param s what it says
 * @param lat the latitude (degrees)
 * @returns true when it is
 */
function isNorthAndUp(s: Seen, lat: number): boolean {
  return s.position !== undefined && s.position.lat > lat + 0.0004 && s.position.relativeAltitude > 18
}

/**
 * Whether the vehicle moves at less than half a metre a second over the ground and less than 0.3 m/s up or down.
 *
 * @param s what it says
 * @returns true when it does not move
 */
function isStill(s: Seen): boolean {
  return s.position !== undefined && Math.hypot(s.position.vx, s.position.vy) < 0.5 && Math.abs(s.position.vz) < 0.3
}

/**
 * Whether the vehicle is within 3 m of its home's height.
 *
 * @param s what it says
 * @returns true when it is
 */
function isNearHome(s: Seen): boolean {
  return s.position !== undefined && Math.abs(s.position.relativeAltitude) < 3
}

async function refusesWhatItShould(): Promise<void> {
  // (the heartbeat is there, so that the state is known)
  await client().until('a heartbeat', seen => seen.armed === false, READY_MS)
  // disarmed
  expect(await outcome('vehicle.reposition', reposition(52.0, 21.0, 20, 'warn'))).toBe('NOT_ARMED')
  expect(await outcome('vehicle.setSpeed', { speed: 5, limits: LIMITS })).toBe('NOT_ARMED')
  await armInGuided()
  await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)
  // armed, in GUIDED, on the ground: a vehicle that is not in the air is not sent anywhere
  expect(await outcome('vehicle.reposition', reposition(52.0, 21.0, 20, 'warn'))).toBe('NOT_AIRBORNE')
  expect((await answered('vehicle.takeoff', { altitude: 10 })).result).toBe('accepted')
  await client().until('the vehicle is about 10 m up', s => (s.position?.relativeAltitude ?? 0) > 8, LEG_MS)
}

async function refusesBadRequestsBeforeSending(): Promise<void> {
  const at = await whereItIs()
  const north = at.lat + 0.0005
  for (const [name, request, code] of [
    ['0, 0', reposition(0, 0, 20, 'warn'), 'INVALID_VALUE'],
    ['NaN', reposition(Number.NaN, at.lon, 20, 'warn'), 'INVALID_VALUE'],
    ['off the globe', reposition(95, at.lon, 20, 'warn'), 'INVALID_VALUE'],
    ['too high', reposition(north, at.lon, 51, 'warn'), 'OUT_OF_LIMITS'],
    ['too low', reposition(north, at.lon, 1, 'warn'), 'OUT_OF_LIMITS'],
    ['too far from home', reposition(at.lat + 0.01, at.lon, 20, 'warn'), 'OUT_OF_LIMITS'],
    // the GCS failsafe of this vehicle is off, and the policy blocks
    ['the failsafe is off', reposition(north, at.lon, 20, 'block'), 'GCS_FAILSAFE_OFF'],
  ] as const) {
    // eslint-disable-next-line no-await-in-loop -- one after the other
    expect(await outcome('vehicle.reposition', request), name).toBe(code)
  }
  // out of GUIDED
  await goesTo('LOITER')

  expect(await outcome('vehicle.reposition', reposition(north, at.lon, 20, 'warn'))).toBe('NOT_GUIDED')
  await goesTo('GUIDED')
}

async function fliesWithTheWarning(): Promise<void> {
  const before = await whereItIs()
  const reply = await answered('vehicle.reposition', reposition(before.lat + 0.0005, before.lon, 20, 'warn'))

  expect(reply.result).toBe('accepted')
  expect(reply.messages.some(text => text.includes('FS_GCS_ENABLE is 0'))).toBe(true)
  // the vehicle's own position says it goes there: north about 55 m, and up to 20 m
  const seen = await client().until('the vehicle is north and 20 m up', s => isNorthAndUp(s, before.lat), LEG_MS)

  expect(seen.position?.lat).toBeGreaterThan(before.lat + 0.0004)
}

async function changesAltitudeAndSpeedAndSetsHome(): Promise<void> {
  await vehicleOf().setParam('FS_GCS_ENABLE', 1)
  // (a change of altitude holds the vehicle where it is: it must have arrived, or the place would be one it has left)
  await client().until('the vehicle has stopped', isStill, LEG_MS)
  const there = await whereItIs()
  // another height, and the place stays (the backend's own, fresh)
  expect((await answered('vehicle.changeAltitude', { altitude: 12, limits: LIMITS, failsafe: 'block' })).result).toBe('accepted')
  await client().until('the vehicle is about 12 m up', s => Math.abs((s.position?.relativeAltitude ?? 0) - 12) < 2, LEG_MS)
  const after = await whereItIs()

  expect(Math.abs(after.lat - there.lat)).toBeLessThan(0.0001)
  expect(await outcome('vehicle.setSpeed', { speed: 11, limits: LIMITS })).toBe('OUT_OF_LIMITS')
  expect((await answered('vehicle.setSpeed', { speed: 4, limits: LIMITS })).result).toBe('accepted')
  // home here, once the vehicle stands still: RTL goes there from now on, and home's height moves with it
  await client().until('the vehicle stands still', isStill, LEG_MS)
  const home = await answered('vehicle.setHomeHere', null)
  const at = await whereItIs()

  expect(home.result).toBe('accepted')
  await client().until('home moved under the vehicle: it is near 0 m above it', isNearHome, HEARTBEAT_MS)
  expect(Math.abs(at.lat - after.lat)).toBeLessThan(0.0002)
}

async function landsAndDisarms(): Promise<void> {
  await goesTo('LAND')
  await client().until('the vehicle has landed and disarmed', s => !s.armed, LEG_MS * 2)
  // a vehicle that is down is not sent anywhere
  expect(await outcome('vehicle.reposition', reposition(52.0, 21.0, 20, 'warn'))).toBe('NOT_ARMED')
}

describeSitl(
  'guided control against ArduPilot SITL',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)
    it('refuses a reposition that is not allowed, and takes off', refusesWhatItShould, READY_MS + LEG_MS + 60_000)
    it('refuses bad numbers, limits, the failsafe and another mode, sending nothing', refusesBadRequestsBeforeSending, 60_000)
    it('flies north with the failsafe warning, as the vehicle\'s own position says', fliesWithTheWarning, LEG_MS + 30_000)
    it('changes the altitude and the speed, and sets home where it stands', changesAltitudeAndSpeedAndSetsHome, LEG_MS * 3)
    it('lands and disarms', landsAndDisarms, LEG_MS * 3)
  },
  { launchOnly: true },
)
