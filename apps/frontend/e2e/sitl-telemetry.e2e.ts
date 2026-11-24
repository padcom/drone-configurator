// The telemetry model (#26) against ArduPilot SITL's own truth. A second reader on SITL's spare port (sitl-truth.ts) takes the
// simulator's SIM_STATE: where the vehicle really is, how it moves and how it is turned, from the physics model before any
// sensor or estimator. The app's telemetry (what the backend sends the page, with when the page got it and each group's age) is
// compared with that truth at the moment each value was the vehicle's.
//  1. Before a GPS fix (the simulated GPS is off at boot): no position, no home, no altitude on the display: nothing made up.
//  2. The GPS on, a short flight: armed in GUIDED, up to 10 m, then 40 m north and east at 15 m. All along, the position, the
//     altitudes above sea level and above home, the velocities, the ground speed and climb, and the attitude match the truth.
//
// The tolerances are the estimator's error in SITL plus what the timing allows; see TOLERANCE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient, type Seen, type TimedTelemetry } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import type { SimState } from './mavlink-wire'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'
import { SimTruth, angleDifference } from './sitl-truth'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The position and the EKF are ready once the GPS is on: an arm is accepted. */
const READY_MS = 300_000
/** A flight leg. */
const LEG_MS = 90_000
/** What a page sends by default: 50 m, 500 m, 10 m/s. */
const LIMITS = { maxAltitude: 50, maxDistance: 500, maxSpeed: 10 }
/** Metres in a degree of latitude (the mean Earth radius, 6371 km). */
const METRES_PER_DEGREE = 6_371_000 * Math.PI / 180

/**
 * How far the app may be from the truth. The app's values are the estimator's (EKF3, fusing the simulated GPS, barometer,
 * accelerometers, gyros and compass), so they are the truth as far as the estimator gets it, at a moment known to within the
 * timing. The limits sit between the two things they tell apart: well above the estimator's error in SITL, and well below what
 * a wrong conversion gives (centimetres taken for metres, radians for degrees, a frame turned or a sign flipped: metres and
 * tens of degrees).
 *
 * `timingMs`: when a value was the vehicle's is known to within this. The page stamps each event, each group says how old it
 * was when the backend sent it (`ageMs`, whole milliseconds), and the vehicle builds GLOBAL_POSITION_INT, VFR_HUD and
 * ATTITUDE in other slots of its scheduler than SIM_STATE (streams of up to 50 Hz: 20 ms apart) and sends them over another
 * port; on a loaded machine the two TCP links can be tens of ms apart. The app's value is compared with the truth anywhere in
 * this window around that moment (at the 10 m/s the vehicle flies, a metre of path).
 *
 * Position and velocity: SITL's GPS has no noise (SIM_GPS1_NOISE 0) and the EKF compensates its lag (SIM_GPS1_LAG_MS 100), so
 * what is left is the estimator's lag in the turns: centimetres, and centimetres a second.
 *
 * Heights: the barometer's noise is 0.2 m (SIM_BARO_RND), blended with the GPS height: 1 m is five times that noise.
 *
 * Attitude: the gyros have no noise, so the estimator's roll and pitch are within a fraction of a degree. The heading on the
 * ground is the compass's alone, which in SITL is a few degrees off; ArduPilot's EKF3 realigns its yaw in the air once it
 * has climbed (`alignedM`: copter's EK3_MAG_CAL 3, about 1.5 m up; seen here as a 2.3 degree step at 2.5 m), after which
 * the heading is held to the gyros. So the heading is compared from 3 m up.
 */
const TOLERANCE = {
  timingMs: 100,
  horizontalM: 1,
  amslM: 1,
  relativeM: 1,
  velocityMs: 0.3,
  attitudeDeg: 1,
  yawDeg: 1.5,
  alignedM: 3,
}

/** The telemetry groups these tests read, as the contract has them. */
interface Groups {
  position?: {
    lat: number
    lon: number
    altitude: number
    relativeAltitude: number
    vx: number
    vy: number
    vz: number
    ageMs: number
  }
  home?: { lat: number, lon: number, altitude: number, ageMs: number }
  gps?: { fixType: number, satellites?: number, hdop?: number, ageMs: number }
  speed?: { groundspeed: number, climb: number, ageMs: number }
  attitude?: { roll: number, pitch: number, yaw: number, ageMs: number }
}

let sitl: Sitl | undefined
let truth: SimTruth | undefined
let app: E2eApp | undefined
let backend: BridgeClient | undefined

/**
 * Something that has started.
 *
 * @param value it, or undefined before it has
 * @param name what it is
 * @returns it
 * @throws {Error} before it has started
 */
function started<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`${name} has not started`)
  }

  return value
}

const client = () => started(backend, 'the client')
const reader = () => started(truth, 'the truth reader')
const window = () => started(app, 'the app')

/**
 * Waits a while.
 *
 * @param ms how long
 */
const pause = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * Calls a method that the vehicle must have accepted.
 *
 * @param name the method
 * @param payload its request
 */
async function accepted(name: string, payload: unknown = null): Promise<void> {
  const answer = await client().call(name, payload)

  expect(answer.error, `${name}: ${JSON.stringify(answer.error)}`).toBeUndefined()
  expect((answer.result as { result: string }).result, name).toBe('accepted')
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
 * Whether a call was accepted.
 *
 * @param name the method
 * @param payload its request
 * @returns true when the vehicle accepted it
 */
async function isAccepted(name: string, payload: unknown = null): Promise<boolean> {
  const answer = await client().call(name, payload)

  return !answer.error && (answer.result as { result: string }).result === 'accepted'
}

/**
 * Puts the vehicle in GUIDED and arms it, asking again until it accepts both (both need the position and the EKF).
 *
 * @throws {Error} when it never does
 */
async function armInGuided(): Promise<void> {
  const guided = await modeNumber('GUIDED')
  const deadline = Date.now() + READY_MS
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    if (await isAccepted('vehicle.setMode', { mode: guided }) && await isAccepted('vehicle.arm')) {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await pause(5000)
  }
  throw new Error(`the vehicle did not take GUIDED and an arm in ${READY_MS} ms`)
}

async function startAll(): Promise<void> {
  // SERIAL2 speaks MAVLink 2 (SIM_STATE's whole latitude and longitude are in its extension), and the GPS is off until test 2
  const defaultParams = { FS_GCS_ENABLE: 0, SERIAL2_PROTOCOL: 2, SIM_GPS1_ENABLE: 0 }
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad', defaultParams })
  truth = await SimTruth.start(sitl.spare.port)
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
  truth?.stop()

  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * What the HUD says, for a screen reader.
 *
 * @returns its label
 */
function hudLabel(): Promise<string> {
  return window().evaluate<string>('document.querySelector(\'.hud\').getAttribute(\'aria-label\')')
}

/**
 * The text of a card of the Fly aside.
 *
 * @param label its label
 * @returns its text
 */
function cardText(label: string): Promise<string> {
  const cards = '[...document.querySelectorAll(\'#telemetry > *\')]'
  const card = `${cards}.find(card => card.querySelector('.label')?.textContent === '${label}')`

  return window().evaluate<string>(`${card}.textContent`)
}

async function showsNothingMadeUpBeforeAFix(): Promise<void> {
  // the attitude comes without a GPS: the telemetry flows
  await client().until('the attitude is reported', seen => (seen as Seen & Groups).attitude !== undefined, 60_000)
  await pause(5000)
  const events = await client().telemetrySince(0)
  const groups = events.map(event => event.telemetry as Groups)

  expect(groups.length).toBeGreaterThan(10)
  expect(groups.filter(g => g.position !== undefined || g.home !== undefined)).toEqual([])
  expect(groups.filter(g => g.gps !== undefined && (g.gps.fixType >= 2 || g.gps.hdop !== undefined))).toEqual([])
  // the display has no altitude, and the GPS card says there is no fix
  expect(await hudLabel()).not.toMatch(/altitude -?\d/u)
  expect(await cardText('GPS')).toMatch(/No GPS|No fix|—/u)
  expect(reader().latest().alt).toBeGreaterThan(0)
}

/** How far the app was from the truth: the worst of each measure, and how many values were compared. */
interface Report {
  compared: Record<string, number>
  worst: Record<string, number>
}

/**
 * The smallest of a measure over the truth around a moment (the timing window).
 *
 * @param at the moment the value was the vehicle's
 * @param error the measure of a truth
 * @returns the smallest, or undefined when there is no truth around it
 */
function errorAround(at: number, error: (state: SimState) => number): number | undefined {
  const step = 10
  let best: number | undefined
  for (let offset = -TOLERANCE.timingMs; offset <= TOLERANCE.timingMs; offset += step) {
    const state = reader().at(at + offset)
    if (state) {
      best = Math.min(best ?? Number.POSITIVE_INFINITY, error(state))
    }
  }

  return best
}

/**
 * Records a measure in a report.
 *
 * @param report the report
 * @param name the measure
 * @param value how far it was, if there was truth to compare with
 */
function record(report: Report, name: string, value: number | undefined): void {
  if (value === undefined) {
    return
  }
  report.compared[name] = (report.compared[name] ?? 0) + 1
  report.worst[name] = Math.max(report.worst[name] ?? 0, value)
}

/**
 * The distance between the app's place and the truth's, over the ground.
 *
 * @param lat the app's latitude
 * @param lon the app's longitude
 * @param state the truth
 * @returns metres
 */
function horizontal(lat: number, lon: number, state: SimState): number {
  const north = (lat - state.lat) * METRES_PER_DEGREE
  const east = (lon - state.lon) * METRES_PER_DEGREE * Math.cos(state.lat * Math.PI / 180)

  return Math.hypot(north, east)
}

/**
 * Compares the position group of one event with the truth.
 *
 * @param report the report
 * @param event the event
 * @param groundAlt the truth's height above sea level on the ground at home
 */
function comparePosition(report: Report, event: TimedTelemetry, groundAlt: number): void {
  const { position } = event.telemetry as Groups
  if (!position) {
    return
  }
  const at = event.at - position.ageMs
  record(report, 'horizontal', errorAround(at, s => horizontal(position.lat, position.lon, s)))
  record(report, 'amsl', errorAround(at, s => Math.abs(position.altitude - s.alt)))
  record(report, 'relative', errorAround(at, s => Math.abs(position.relativeAltitude - (s.alt - groundAlt))))
  record(report, 'vn', errorAround(at, s => Math.abs(position.vx - s.vn)))
  record(report, 've', errorAround(at, s => Math.abs(position.vy - s.ve)))
  record(report, 'vd', errorAround(at, s => Math.abs(position.vz - s.vd)))
}

/**
 * Compares the speed group of one event with the truth.
 *
 * @param report the report
 * @param event the event
 */
function compareSpeed(report: Report, event: TimedTelemetry): void {
  const { speed } = event.telemetry as Groups
  if (!speed) {
    return
  }
  const at = event.at - speed.ageMs
  record(report, 'groundspeed', errorAround(at, s => Math.abs(speed.groundspeed - Math.hypot(s.vn, s.ve))))
  record(report, 'climb', errorAround(at, s => Math.abs(speed.climb + s.vd)))
}

/**
 * Whether the vehicle was high enough at a moment for the estimator to have aligned its heading in the air.
 *
 * @param at the moment
 * @param groundAlt the truth's height above sea level on the ground at home
 * @returns true when it was
 */
function isAligned(at: number, groundAlt: number): boolean {
  return (reader().at(at)?.alt ?? groundAlt) - groundAlt > TOLERANCE.alignedM
}

/**
 * Compares the attitude group of one event with the truth. The heading only once the vehicle has climbed past the estimator's
 * yaw alignment (see TOLERANCE.alignedM).
 *
 * @param report the report
 * @param event the event
 * @param groundAlt the truth's height above sea level on the ground at home
 */
function compareAttitude(report: Report, event: TimedTelemetry, groundAlt: number): void {
  const { attitude } = event.telemetry as Groups
  if (!attitude) {
    return
  }
  const at = event.at - attitude.ageMs
  record(report, 'roll', errorAround(at, s => Math.abs(attitude.roll - s.roll)))
  record(report, 'pitch', errorAround(at, s => Math.abs(attitude.pitch - s.pitch)))
  const yaw = (s: SimState) => Math.abs(angleDifference(attitude.yaw, s.yaw))
  record(report, 'yaw', isAligned(at, groundAlt) ? errorAround(at, yaw) : undefined)
}

/** The tolerance of each measure. */
const LIMIT: Record<string, number> = {
  horizontal: TOLERANCE.horizontalM,
  amsl: TOLERANCE.amslM,
  relative: TOLERANCE.relativeM,
  vn: TOLERANCE.velocityMs,
  ve: TOLERANCE.velocityMs,
  vd: TOLERANCE.velocityMs,
  groundspeed: TOLERANCE.velocityMs,
  climb: TOLERANCE.velocityMs,
  roll: TOLERANCE.attitudeDeg,
  pitch: TOLERANCE.attitudeDeg,
  yaw: TOLERANCE.yawDeg,
}

/** What the flight saw: where its events begin, and the truth's height on the ground at home. */
const flight = { from: 0, groundAlt: 0 }

/**
 * A place 40 m north and 40 m east of the vehicle.
 *
 * @returns its latitude and longitude
 * @throws {Error} when the vehicle reports no position
 */
async function placeAhead(): Promise<{ latitude: number, longitude: number }> {
  const position = (await client().telemetry())?.position
  if (!position) {
    throw new Error('the vehicle reports no position')
  }
  const east = 40 / METRES_PER_DEGREE / Math.cos(position.lat * Math.PI / 180)

  return { latitude: position.lat + 40 / METRES_PER_DEGREE, longitude: position.lon + east }
}

/**
 * Whether the vehicle is within 2 m (north) of a latitude.
 *
 * @param seen the telemetry
 * @param latitude the latitude
 * @returns true when it is
 */
function isAt(seen: Seen, latitude: number): boolean {
  return seen.position !== undefined && seen.position.lat > latitude - 2 / METRES_PER_DEGREE
}

/**
 * The number of the last telemetry event the page got.
 *
 * @returns it, 0 before any
 */
async function lastEvent(): Promise<number> {
  return (await client().telemetrySince(0)).at(-1)?.n ?? 0
}

async function fliesAShortFlight(): Promise<void> {
  await started(sitl, 'SITL').setParam('SIM_GPS1_ENABLE', 1)
  await client().until('a position', seen => seen.position !== undefined, READY_MS)
  await armInGuided()
  // on the ground at home: the truth's height there is where the height above home is 0
  flight.groundAlt = reader().latest().alt
  flight.from = await lastEvent()
  await accepted('vehicle.takeoff', { altitude: 10 })
  await client().until('the vehicle is about 10 m up', s => (s.position?.relativeAltitude ?? 0) > 9, LEG_MS)
  const place = await placeAhead()
  await accepted('vehicle.reposition', { ...place, altitude: 15, limits: LIMITS, failsafe: 'warn' })
  await client().until('the vehicle is there', s => isAt(s, place.latitude), LEG_MS)
}

/**
 * The fastest the vehicle really went over the ground, and the highest above home.
 *
 * @returns metres a second and metres
 */
function extremes(): { fastest: number, highest: number } {
  const { samples } = reader()

  return {
    fastest: Math.max(...samples.map(sample => Math.hypot(sample.state.vn, sample.state.ve))),
    highest: Math.max(...samples.map(sample => sample.state.alt - flight.groundAlt)),
  }
}

async function matchesTheTruth(): Promise<void> {
  const events = await client().telemetrySince(flight.from)
  const report: Report = { compared: {}, worst: {} }
  for (const event of events) {
    comparePosition(report, event, flight.groundAlt)
    compareSpeed(report, event)
    compareAttitude(report, event, flight.groundAlt)
  }
  const { fastest, highest } = extremes()
  console.info('telemetry against SIM_STATE:', JSON.stringify({ ...report, fastest, highest, events: events.length }))

  // it flew: fast and high enough for the comparison to mean something
  expect(fastest).toBeGreaterThan(3)
  expect(highest).toBeGreaterThan(12)

  for (const [name, limit] of Object.entries(LIMIT)) {
    expect(report.compared[name] ?? 0, `${name}: values compared`).toBeGreaterThan(50)
    expect(report.worst[name], `${name}: the worst difference from the truth`).toBeLessThanOrEqual(limit)
  }
}

async function showsTheAltitude(): Promise<void> {
  const label = await hudLabel()
  const shown = Number(/altitude (?<metres>-?\d+)/u.exec(label)?.groups?.metres)
  const real = reader().latest().alt - flight.groundAlt

  // (whole metres on the display)
  expect(Math.abs(shown - real), label).toBeLessThanOrEqual(TOLERANCE.relativeM + 0.5)
}

describeSitl(
  'the telemetry against ArduPilot SITL\'s truth',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)
    it('shows no position, no home and no altitude before a GPS fix: nothing made up', showsNothingMadeUpBeforeAFix, 90_000)
    it('flies a short flight in GUIDED', fliesAShortFlight, READY_MS + LEG_MS * 2)
    it('matches the truth all along: position, altitudes, velocities, speeds and attitude', matchesTheTruth, 60_000)
    it('shows the altitude above home on the display', showsTheAltitude, 30_000)
  },
  { launchOnly: true },
)
