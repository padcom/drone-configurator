// The telemetry model (#26) against ArduPilot SITL's own truth. A second reader on SITL's spare port (sitl-truth.ts) takes the
// simulator's SIM_STATE: where the vehicle really is, how it moves and how it is turned, from the physics model before any
// sensor or estimator. The app's telemetry (what the backend sends the page, with when the page got it and each group's age) is
// compared with that truth at the moment each value was the vehicle's.
//  1. Before a GPS fix (the simulated GPS is off at boot): no position, no home, no altitude on the display, and of the GPS only
//     what the vehicle itself reports (its GPS_RAW_INT, read on the second port): nothing made up.
//  2. The GPS on, a short flight: armed in GUIDED, up to 10 m, then 40 m north and east at 15 m. All along, the position, the
//     altitudes above sea level and above home, the velocities, the ground speed and climb, and the attitude match the truth.
//
// The tolerances are the estimator's error in SITL plus what the timing allows; see TOLERANCE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient, type Seen, type TimedTelemetry } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import type { GpsRaw, SimState } from './mavlink-wire'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'
import { SimTruth, angleDifference } from './sitl-truth'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The position and the EKF are ready once the GPS is on: an arm is accepted. */
const READY_MS = 300_000
/** How long the heartbeat may take to say the vehicle is armed after the arm was accepted. */
const ARMED_MS = 10_000
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
 * `timingMs`: when a value was the vehicle's is known only to within this. The page stamps each event when it gets it, and each
 * group says how old it was when the backend sent it (`ageMs`); the truth reader stamps each SIM_STATE when Node reads it. Each
 * stamp can be late: the backend, the page, the test and SITL share the runner, and a process that waits for a slice of it
 * reads its socket late (the transfer from the backend to the page is not in `ageMs` either). A value is compared with the truth
 * at its moment, and the difference allowed grows with how fast the truth changes around that moment: the static limit plus
 * the fastest rate of change within `timingMs` either side, times `timingMs`. Steady, the limit is the static one; in the
 * 70 degree a second turn, the heading may be a few degrees off. On GitHub's linux-x64 runner a stamp was seen about 120 ms
 * out (a heading 1.66 degrees off, with roll and velocity at their worst at the same moment, when the turn began); 250 ms is
 * twice that. The report gives each measure's worst, with its rate, so a failure says whether it was timing.
 *
 * Position and velocity: SITL's GPS has no noise (SIM_GPS1_NOISE 0) and the EKF compensates its lag (SIM_GPS1_LAG_MS 100), so
 * what is left is the estimator's lag in the turns: centimetres, and centimetres a second.
 *
 * Heights: the barometer's noise is 0.2 m (SIM_BARO_RND), blended with the GPS height: 1 m is five times that noise.
 *
 * Attitude: the gyros have no noise, so the estimator's roll and pitch are within a fraction of a degree. The heading on the
 * ground is the compass's alone, which in SITL is a few degrees off; ArduPilot's EKF3 realigns its yaw in the air once it
 * has climbed (copter's EK3_MAG_CAL 3: the final reset when its own height is 2.5 m above the takeoff, EKF3_MAG_FINAL_RESET_ALT;
 * seen here as a 2.3 degree step), and then learns the field with three-axis fusion, so the heading settles during the climb.
 * The reset comes at the EKF's own height, which may lag the truth's on a slow runner, so the heading is compared from
 * `alignedM`, most of the way to the 10 m of the takeoff, and through the whole leg.
 *
 * The heading's limit (`yawDeg`) is the compass's, not the gyros': the heading the EKF holds comes from a field it learns in
 * flight, corrected by ArduPilot's own declination table, while SITL's compass sees its world magnetic model. In steady flight
 * at 10 m/s that left it up to 1.71 degrees off on GitHub's runners (turning at 0.3 degrees a second: not the timing), and
 * 0.55 to 0.77 degrees here. 3 degrees is above that and still well below what a wrong heading gives: the declination at
 * SITL's home (CMAC, Canberra) is about 12 degrees, and a radian taken for a degree is 57.
 */
const TOLERANCE = {
  timingMs: 250,
  horizontalM: 1,
  amslM: 1,
  relativeM: 1,
  velocityMs: 0.3,
  attitudeDeg: 1,
  yawDeg: 3,
  alignedM: 8,
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
  gps?: { fixType: number, satellites?: number, hdop?: number, vdop?: number, ageMs: number }
  speed?: { groundspeed: number, climb: number, ageMs: number }
  attitude?: { roll: number, pitch: number, yaw: number, ageMs: number }
}

/** What the flight saw: where its events begin, and the truth's height on the ground at home. */
const flight = { from: 0, groundAlt: 0 }

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
 * The number of the last telemetry event the page got.
 *
 * @returns it, 0 before any
 */
async function lastEvent(): Promise<number> {
  return (await client().telemetrySince(0)).at(-1)?.n ?? 0
}

/**
 * Whether the app says the vehicle is armed (its heartbeat) within a few seconds.
 *
 * @returns true when it does
 */
async function showsArmed(): Promise<boolean> {
  try {
    await client().until('the heartbeat says armed', seen => seen.armed, ARMED_MS)

    return true
  } catch {
    return false
  }
}

/**
 * One try at a takeoff: GUIDED, an arm, the app saying the vehicle is armed (the backend refuses a takeoff until its heartbeat
 * says so), and the takeoff. Where it starts (the truth's ground height, the app's last event) is taken first: the vehicle is
 * on the ground until the takeoff is accepted.
 *
 * @param guided the number of GUIDED
 * @returns whether the takeoff was accepted
 */
async function triesToTakeOff(guided: number | undefined): Promise<boolean> {
  flight.groundAlt = reader().latest().alt
  flight.from = await lastEvent()

  const armed = await isAccepted('vehicle.setMode', { mode: guided }) && await isAccepted('vehicle.arm') && await showsArmed()

  return armed && isAccepted('vehicle.takeoff', { altitude: 10 })
}

/**
 * Takes off in GUIDED, trying again until the vehicle lets it: an arm is refused until the pre-arm checks pass (the EKF is
 * not ready for a while after the GPS comes on), and a vehicle that disarmed again refuses the takeoff.
 *
 * @throws {Error} when it never does
 */
async function takesOffInGuided(): Promise<void> {
  const guided = await modeNumber('GUIDED')
  const deadline = Date.now() + READY_MS
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    if (await triesToTakeOff(guided)) {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await pause(5000)
  }
  throw new Error(`the vehicle did not take GUIDED, an arm and a takeoff in ${READY_MS} ms`)
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

/**
 * A GPS group without its age and without the fields it has not, in one order.
 *
 * @param gps the group
 * @returns the fields it has
 */
function withoutAge(gps: Record<string, number | undefined>): Record<string, number> {
  const fields = ['fixType', 'satellites', 'hdop', 'vdop'] as const

  return Object.fromEntries(fields.flatMap(field => (gps[field] === undefined ? [] : [[field, gps[field]]])))
}

/**
 * The GPS group the backend makes of what the vehicle reports (the contract's gps-group): HDOP and VDOP in units, and none of
 * what the vehicle does not know.
 *
 * @param gps the vehicle's GPS_RAW_INT
 * @returns the group, without its age, with its fields in order
 */
function asGroup(gps: GpsRaw): Record<string, number> {
  const known = (value: number, unknown: number, scale = 1) => (value === unknown ? undefined : value / scale)

  return withoutAge({
    fixType: gps.fixType,
    satellites: known(gps.satellites, 255),
    hdop: known(gps.eph, 65_535, 100),
    vdop: known(gps.epv, 65_535, 100),
  })
}

async function showsNothingMadeUpBeforeAFix(): Promise<void> {
  // the attitude comes without a GPS: the telemetry flows
  await client().until('the attitude is reported', seen => (seen as Seen & Groups).attitude !== undefined, 60_000)
  await pause(5000)
  const events = await client().telemetrySince(0)
  const groups = events.map(event => event.telemetry as Groups)

  expect(groups.length).toBeGreaterThan(10)
  expect(groups.filter(g => g.position !== undefined || g.home !== undefined)).toEqual([])
  expect(groups.filter(g => g.gps !== undefined && g.gps.fixType >= 2)).toEqual([])
  // the GPS group is what the vehicle reports, and no more: its own numbers or none (Copter 4.7.3 reports an HDOP and a few
  // satellites while it has no fix)
  const reported = new Set(reader().gps.map(gps => JSON.stringify(asGroup(gps))))
  const shown = groups.flatMap(g => (g.gps ? [JSON.stringify(withoutAge(g.gps))] : []))

  expect(shown.length).toBeGreaterThan(0)
  expect(shown.filter(gps => !reported.has(gps))).toEqual([])
  // the display has no altitude, and the GPS card says there is no fix
  expect(await hudLabel()).not.toMatch(/altitude -?\d/u)
  expect(await cardText('GPS')).toMatch(/No GPS|No fix|—/u)
  expect(reader().latest().alt).toBeGreaterThan(0)
}

/** The worst comparison of a measure: the difference, the truth's rate of change then, and how high the vehicle was. */
interface Worst {
  /** How far the app's value was from the truth at its moment. */
  error: number
  /** The fastest the difference changed with the truth within the timing either side (units a second). */
  rate: number
  /** What was allowed: the static limit and the rate times the timing. */
  allowed: number
  /** How high above home the vehicle really was. */
  height: number
}

/** How far the app was from the truth: how many values of each measure were compared, and the worst of each. */
interface Report {
  compared: Record<string, number>
  /** The comparison with the least to spare (the largest error less what the timing allows). */
  worst: Record<string, Worst>
}

/** A measure of a truth: how far the app's value is from it. */
type Measure = (state: SimState) => number

/**
 * The fastest a measure changes with the truth around a moment: the largest change between two samples in a row, a second.
 *
 * @param at the moment
 * @param error the measure
 * @returns units a second (0 without samples)
 */
function rateAround(at: number, error: Measure): number {
  const samples = reader().between(at - TOLERANCE.timingMs, at + TOLERANCE.timingMs)

  return samples.slice(1).reduce((fastest, sample, index) => {
    const before = samples[index] as (typeof samples)[number]
    const rate = Math.abs(error(sample.state) - error(before.state)) * 1000 / Math.max(1, sample.at - before.at)

    return Math.max(fastest, rate)
  }, 0)
}

/**
 * How high above home the vehicle really was at a moment.
 *
 * @param at the moment
 * @returns metres, NaN when there is no truth then
 */
function heightAt(at: number): number {
  return (reader().at(at)?.alt ?? Number.NaN) - flight.groundAlt
}

/**
 * Judges a value against the truth at its moment: the difference, and what is allowed for it then.
 *
 * @param name the measure's name (its static limit is LIMIT's)
 * @param at the moment the value was the vehicle's
 * @param error the measure
 * @param state the truth at that moment
 * @returns the comparison
 */
function judge(name: string, at: number, error: Measure, state: SimState): Worst {
  const rate = rateAround(at, error)

  return { error: error(state), rate, allowed: (LIMIT[name] ?? 0) + rate * TOLERANCE.timingMs / 1000, height: heightAt(at) }
}

/**
 * Counts a comparison, and keeps it when it has the least to spare yet.
 *
 * @param report the report
 * @param name the measure
 * @param judged the comparison
 */
function keep(report: Report, name: string, judged: Worst): void {
  report.compared[name] = (report.compared[name] ?? 0) + 1
  const worst = report.worst[name]
  if (!worst || judged.error - judged.allowed > worst.error - worst.allowed) {
    report.worst[name] = judged
  }
}

/**
 * Compares a value with the truth at its moment, counts it, and keeps it when it has the least to spare yet.
 *
 * @param report the report
 * @param at the moment the value was the vehicle's
 * @param name the measure
 * @param error the measure, or undefined when this value is not compared
 */
function record(report: Report, at: number, name: string, error: Measure | undefined): void {
  const state = reader().at(at)
  if (error && state) {
    keep(report, name, judge(name, at, error, state))
  }
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
  record(report, at, 'horizontal', s => horizontal(position.lat, position.lon, s))
  record(report, at, 'amsl', s => Math.abs(position.altitude - s.alt))
  record(report, at, 'relative', s => Math.abs(position.relativeAltitude - (s.alt - groundAlt)))
  record(report, at, 'vn', s => Math.abs(position.vx - s.vn))
  record(report, at, 've', s => Math.abs(position.vy - s.ve))
  record(report, at, 'vd', s => Math.abs(position.vz - s.vd))
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
  record(report, at, 'groundspeed', s => Math.abs(speed.groundspeed - Math.hypot(s.vn, s.ve)))
  record(report, at, 'climb', s => Math.abs(speed.climb + s.vd))
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
  record(report, at, 'roll', s => Math.abs(attitude.roll - s.roll))
  record(report, at, 'pitch', s => Math.abs(attitude.pitch - s.pitch))
  const yaw = (s: SimState) => Math.abs(angleDifference(attitude.yaw, s.yaw))
  record(report, at, 'yaw', isAligned(at, groundAlt) ? yaw : undefined)
}

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

async function fliesAShortFlight(): Promise<void> {
  await started(sitl, 'SITL').setParam('SIM_GPS1_ENABLE', 1)
  await client().until('a position', seen => seen.position !== undefined, READY_MS)
  // on the ground at home until the takeoff: the truth's height there is where the height above home is 0
  await takesOffInGuided()
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

/**
 * Checks a measure of a report: enough values compared, and the worst within what was allowed for it.
 *
 * @param report the report
 * @param name the measure
 */
function withinLimits(report: Report, name: string): void {
  // at least six seconds of the app's events (5 a second); the heading has the fewest, from 8 m up
  expect(report.compared[name] ?? 0, `${name}: values compared`).toBeGreaterThanOrEqual(30)
  const worst = report.worst[name] ?? { error: Number.NaN, allowed: 0 }

  expect(worst.error, `${name}: the worst difference from the truth, ${JSON.stringify(worst)}`).toBeLessThanOrEqual(worst.allowed)
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

  Object.keys(LIMIT).forEach(name => withinLimits(report, name))
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
