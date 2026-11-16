// The plan service against ArduPilot SITL, through the real backend (the requests go over the page's
// bridge, see bridge-client.ts; the app has no Plan page yet). On the ground, then armed:
//  1. a vehicle that has just started has no room for a mission (it says "Only 0 items are supported"
//     for about 15 s): the reads wait for its home to be said;
//  2. a route is WRITTEN, READ BACK and VERIFIED: ArduPilot keeps only some of each command's fields (a
//     waypoint its first parameter as a whole number, a speed no place), so the comparison is made on
//     what it keeps, and every command the page edits has a row here;
//  3. a fence and rally points are written apart from the mission, and each is cleared by itself and
//     read back empty;
//  4. a vehicle with no room for 700 items says NO_SPACE as an upload that failed, in its own words;
//  5. once the vehicle is ARMED a write and a clear are refused (`ARMED`), nothing is sent, and a read
//     is still allowed.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The vehicle has a mission storage and says its home. */
const STORAGE_MS = 90_000
/** The position and the EKF are ready: an arm is accepted. */
const READY_MS = 300_000
/** A heartbeat after a command says what it did. */
const HEARTBEAT_MS = 15_000

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

/** One item as the contract has it. */
interface Item {
  command: number
  frame: number
  param1?: number
  param2?: number
  param3?: number
  param4?: number
  x: number
  y: number
  z: number
  autocontinue: boolean
}

/** What a write says. */
interface Written {
  result: 'verified' | 'mismatch' | 'upload-failed' | 'read-failed'
  count: number
  unchecked: number
  code?: string
  detail?: string
  at?: number
  messages: string[]
}

/** What a read says. */
interface Read {
  items: Item[]
  home?: Item
}

/** The four parameters of an item (a NaN where it gives none), and its place: x, y (degrees times 1e7), z (m). */
type Four = [number, number, number, number]
type Place = [number, number, number]

/**
 * An item.
 *
 * @param command the MAV_CMD
 * @param frame the MAV_FRAME
 * @param p the four parameters (a NaN is not given)
 * @param place where, and how high
 * @returns the item
 */
function item(command: number, frame: number, p: Four, place: Place): Item {
  const given = p.map(value => (Number.isNaN(value) ? undefined : value))

  return {
    command,
    frame,
    param1: given[0],
    param2: given[1],
    param3: given[2],
    param4: given[3],
    x: place[0],
    y: place[1],
    z: place[2],
    autocontinue: true,
  }
}

/**
 * A waypoint, its yaw not given (a NaN: the vehicle takes it as "no change").
 *
 * @param lat degrees
 * @param lon degrees
 * @param z metres above home
 * @returns the item
 */
function waypoint(lat: number, lon: number, z: number): Item {
  return item(16, 3, [0, 0, 0, Number.NaN], [Math.round(lat * 1e7), Math.round(lon * 1e7), z])
}

/**
 * A command of the mission's own frame with its parameters (it has no place).
 *
 * @param command the MAV_CMD
 * @param p the four parameters
 * @returns the item
 */
function plain(command: number, p: Four): Item {
  return item(command, 2, p, [0, 0, 0])
}

/**
 * Waits.
 *
 * @param ms how long
 */
async function pause(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

/**
 * Calls a method and gives what came of it: the error's code, or the result's name.
 *
 * @param name the method
 * @param payload its request
 * @returns the code of the refusal, or the name of the result
 */
async function outcome(name: string, payload: unknown = null): Promise<string> {
  const answer = await client().call(name, payload)

  return answer.error ? answer.error.code : (answer.result as { result: string }).result
}

/**
 * Calls a method that the backend must have answered.
 *
 * @param name the method
 * @param payload its request
 * @returns the answer
 */
async function answered<T>(name: string, payload: unknown): Promise<T> {
  const answer = await client().call(name, payload, 120_000)
  if (answer.error) {
    throw new Error(`${name} was refused by the backend: ${answer.error.code} ${answer.error.message}`)
  }

  return answer.result as T
}

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad' })
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
 * The home the vehicle says in a read of its mission (none while it has no room for one).
 *
 * @returns the home item, or undefined
 */
async function homeSaid(): Promise<Item | undefined> {
  return ((await client().call('plan.read', { kind: 'mission' })).result as Read | undefined)?.home
}

async function waitsForTheMissionStorage(): Promise<void> {
  await client().until('a heartbeat', seen => seen.armed === false, STORAGE_MS)
  const deadline = Date.now() + STORAGE_MS
  let home = await homeSaid()
  while (home === undefined && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await pause(2000)
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    home = await homeSaid()
  }

  expect(home, 'the vehicle says its home').toBeDefined()
}

/**
 * Reads the mission and checks what a vehicle keeps of the route.
 *
 * @param second the x of the second item that was written
 */
async function readsBackAs(second: number): Promise<void> {
  const read = await answered<Read>('plan.read', { kind: 'mission' })

  expect(read.items.map(entry => entry.command)).toEqual([22, 16, 16, 178])
  expect(read.items[1]).toMatchObject({ x: second })
  expect(read.items[2]).toMatchObject({ param1: 3 })
  expect(read.items[3]).toMatchObject({ param2: 5 })
}

async function writesAReadsBackAndVerifiesARoute(): Promise<void> {
  const second = Math.round(52.2301 * 1e7)
  const route = [
    item(22, 3, [0, 0, 0, Number.NaN], [0, 0, 10]),
    waypoint(52.2301, 21.0131, 20),
    item(16, 3, [3, 0, 0, Number.NaN], [Math.round(52.2305 * 1e7), Math.round(21.0135 * 1e7), 25.004]),
    plain(178, [1, 5, 0, 0]),
  ]
  const out = await answered<Written>('plan.write', { kind: 'mission', items: route })

  expect(out.result).toBe('verified')
  expect(out.count).toBe(4)
  expect(out.unchecked).toBe(0)
  await readsBackAs(second)
}

async function everyCommandThePageEditsIsVerified(): Promise<void> {
  const at: Place = [522000000, 212000000, 25]
  const items: Item[] = [
    item(16, 3, [2, 0, 0, Number.NaN], [522000000, 212000000, 20]),
    item(17, 3, [0, 0, 30, 0], at),
    item(18, 3, [2, 0, 20, 1], at),
    item(19, 3, [10, 0, -1, 0], at),
    item(21, 3, [0, 0, 0, 1], [522000000, 212000000, 0]),
    plain(112, [3, 0, 0, 0]),
    plain(177, [1, 2, 0, 0]),
    plain(178, [1, 4, 0, 0]),
    item(179, 0, [1, 0, 0, 0], [522000000, 212000000, 100]),
    plain(181, [1, 1, 0, 0]),
    plain(183, [5, 1500, 0, 0]),
    item(201, 3, [3, 0, 0, 0], [522000000, 212000000, 20]),
    plain(206, [10, 0, 1, 0]),
    item(20, 3, [0, 0, 0, 0], [0, 0, 0]),
  ]
  const out = await answered<Written>('plan.write', { kind: 'mission', items })

  expect(out.result, `${out.code ?? ''} ${out.detail ?? ''}`).toBe('verified')
  expect(out.unchecked).toBe(0)
}

/**
 * How many items the vehicle holds of a kind, as a read says.
 *
 * @param kind mission, fence or rally
 * @returns how many
 */
async function holds(kind: string): Promise<number> {
  return (await answered<Read>('plan.read', { kind })).items.length
}

async function writesAFenceAndRallyPointsAndClearsEachByItself(): Promise<void> {
  const vertex = (lat: number): Item => item(5001, 0, [3, 0, 0, 0], [Math.round(lat * 1e7), 211000000, 0])
  const rally = item(5100, 3, [0, 0, 0, 0], [522000000, 211000000, 30])
  const fence = await answered<Written>('plan.write', { kind: 'fence', items: [vertex(52.19), vertex(52.21), vertex(52.21)] })
  const point = await answered<Written>('plan.write', { kind: 'rally', items: [rally] })

  expect(fence.result).toBe('verified')
  expect(point.result).toBe('verified')
  expect(await holds('fence')).toBe(3)
  // (each is cleared by itself and read back empty: the mission is untouched by a clear of the others)
  expect(await outcome('plan.clear', { kind: 'fence' })).toBe('cleared')
  expect(await outcome('plan.clear', { kind: 'rally' })).toBe('cleared')
  expect(await holds('fence')).toBe(0)
  expect(await holds('rally')).toBe(0)
  expect(await holds('mission')).toBeGreaterThan(0)
  expect(await outcome('plan.clear', { kind: 'mission' })).toBe('cleared')
  expect(await holds('mission')).toBe(0)
}

async function saysNoSpaceInTheVehiclesWords(): Promise<void> {
  const items: Item[] = []
  for (let i = 0; i < 700; i += 1) {
    items.push(waypoint(52.2 + i / 1e5, 21.2, 20))
  }
  const out = await answered<Written>('plan.write', { kind: 'mission', items })

  expect(out.result).toBe('upload-failed')
  expect(out.code).toBe('NO_SPACE')
  expect(out.messages.some(text => text.includes('items are supported'))).toBe(true)
  // (a count that is refused truncates nothing, and the link is free again)
  expect(await outcome('plan.clear', { kind: 'mission' })).toBe('cleared')
}

async function armWhenReady(): Promise<void> {
  const deadline = Date.now() + READY_MS
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    if (await outcome('vehicle.arm') === 'accepted') {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await pause(5000)
  }
  throw new Error(`the vehicle did not accept an arm in ${READY_MS} ms`)
}

async function refusesAWriteAndAClearWhileArmed(): Promise<void> {
  await armWhenReady()
  await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)
  // (an accepted arm holds the armed state unknown for 1.5 s, which every service takes for armed: STATE_UNKNOWN, also a refusal)
  await pause(2500)
  const waypoints = [waypoint(52.2301, 21.0131, 20)]

  expect(await outcome('plan.write', { kind: 'mission', items: waypoints })).toBe('ARMED')
  expect(await outcome('plan.clear', { kind: 'mission' })).toBe('ARMED')
  expect(await outcome('plan.write', { kind: 'fence', items: waypoints })).toBe('ARMED')
  // a read is still allowed (an arm is refused while a plan operation runs: the unit tests); disarm again
  expect((await client().call('plan.read', { kind: 'mission' })).error).toBeUndefined()
  expect(await outcome('vehicle.disarm')).toBe('accepted')
  await client().until('the heartbeat says disarmed', s => !s.armed, HEARTBEAT_MS)
}

describeSitl(
  'the plan against ArduPilot SITL',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)
    it('waits for a vehicle that has room for a mission', waitsForTheMissionStorage, STORAGE_MS * 2)
    it('writes a route, reads it back and verifies it', writesAReadsBackAndVerifiesARoute, 120_000)
    it('verifies every command the page edits', everyCommandThePageEditsIsVerified, 120_000)
    it('writes a fence and rally points and clears each by itself', writesAFenceAndRallyPointsAndClearsEachByItself, 120_000)
    it('says NO_SPACE in the vehicle\'s words, and sends nothing of the mission', saysNoSpaceInTheVehiclesWords, 120_000)
    it('refuses a write and a clear while the vehicle is armed', refusesAWriteAndAClearWhileArmed, READY_MS + 60_000)
  },
  { launchOnly: true },
)
