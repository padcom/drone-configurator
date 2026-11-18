// "Landed" as the stick disarm rule (RS1) reads it, against ArduPilot SITL, through the real backend: the heartbeat's
// `system_status`, which the telemetry stream carries as `systemStatus`. The rule (`rudder.pi`, `lib/rc/safety.ts`) lifts the
// yaw hold for the sticks' disarm gesture only while the vehicle is armed AND landed, and it takes "landed" to be a fresh
// heartbeat of STANDBY (3): what ArduCopter sends exactly when `land_complete` is set and no failsafe is active. These are the
// facts the rule stands on:
//  1. disarmed on the ground: STANDBY;
//  2. ARMED on the ground (before a take off): still STANDBY (landed), so the disarm gesture on the ground is allowed;
//  3. in the air (ACTIVE), after a take off to 5 m: the hold stays;
//  4. back on the ground, after the landing: STANDBY again.
// Not covered here: the stick gesture itself (full yaw for 3 s). The backend's guard is tested with scripted heartbeats
// (rc.test.pi), the page's with the same golden vectors; driving `rc.control` needs a client that can subscribe, which the bridge
// client cannot.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The position, the EKF and the sensors are ready: an arm is accepted (a minute of simulated time, more on a slow machine). */
const READY_MS = 300_000
/** A heartbeat after a command says what it did. */
const HEARTBEAT_MS = 15_000
/** How long a climb to 5 m, and then a landing, may take. */
const CLIMB_MS = 90_000
const LAND_MS = 180_000
/** A vehicle that is starting says BOOT for a while (until its initialisation is done): how long to wait for STANDBY. */
const STANDBY_MS = 120_000
/** How long the status must hold still to be called stable (several heartbeats: they come once a second). */
const STABLE_MS = 10_000
/** MAV_STATE_STANDBY and MAV_STATE_ACTIVE. */
const STANDBY = 3
const ACTIVE = 4

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

/** What the backend answered to a command, as these tests look at it. */
interface Answered {
  result: 'accepted' | 'refused' | 'unsupported' | 'no-answer'
}

/**
 * Sends a command: the backend must have sent it, and the vehicle answered.
 *
 * @param name the method
 * @param payload its request
 * @returns the vehicle's answer
 */
async function command(name: string, payload: unknown = null): Promise<Answered> {
  const answer = await client().call(name, payload)
  if (answer.error) {
    throw new Error(`${name} was refused by the backend: ${answer.error.code} ${answer.error.message}`)
  }

  return answer.result as Answered
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
 * Asks for an arm until the vehicle accepts it (its checks pass once the position and the EKF are ready).
 */
async function armWhenReady(): Promise<void> {
  const deadline = Date.now() + READY_MS
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    if ((await command('vehicle.arm')).result === 'accepted') {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- one try after the other
    await new Promise<void>(resolve => {
      setTimeout(resolve, 5000)
    })
  }
  throw new Error(`the vehicle did not accept an arm in ${READY_MS} ms`)
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

/**
 * Adds a status to the list when it is not the one the list ended with.
 *
 * @param seen the list (`3@0.0`: the status, and the second it began at)
 * @param status what the telemetry says, if it does
 * @param second how long since the looking began
 */
function note(seen: string[], status: number | undefined, second: number): void {
  if (status !== undefined && !seen.at(-1)?.startsWith(`${status}@`)) {
    seen.push(`${status}@${second.toFixed(1)}`)
  }
}

/**
 * Looks at the telemetry for a while and says every value `systemStatus` had, in order, with the second it began at.
 *
 * @param ms how long to look
 * @returns for instance `3@0.0 4@2.5`
 */
async function statusesFor(ms: number): Promise<string> {
  const began = Date.now()
  const seen: string[] = []
  while (Date.now() - began < ms) {
    // eslint-disable-next-line no-await-in-loop -- one look after the other
    note(seen, (await client().telemetry())?.systemStatus, (Date.now() - began) / 1000)
    // eslint-disable-next-line no-await-in-loop -- one look after the other
    await new Promise<void>(resolve => {
      setTimeout(resolve, 250)
    })
  }

  return seen.join(' ')
}

/**
 * Whether the statuses `statusesFor` listed are STANDBY and nothing else.
 *
 * @param statuses what it said
 * @returns true when so
 */
function onlyStandby(statuses: string): boolean {
  return statuses.split(' ').every(entry => entry.startsWith(`${STANDBY}@`))
}

async function saysStandbyWhenDisarmed(): Promise<void> {
  // the first heartbeat of a vehicle that is still starting says BOOT: wait for what the rule reads, do not take the first
  const seen = await client().until('the heartbeat says STANDBY', s => s.systemStatus === STANDBY, STANDBY_MS)

  expect(seen.armed).toBe(false)
}

async function staysStandbyOnceDisarmed(): Promise<void> {
  await client().until('the heartbeat says STANDBY', s => s.systemStatus === STANDBY && !s.armed, STANDBY_MS)

  // a rule that reads the status once a second must not see it flap: STANDBY, and only STANDBY, for ten seconds
  const statuses = await statusesFor(STABLE_MS)

  expect(onlyStandby(statuses), `statuses (status@second): ${statuses}`).toBe(true)
}

async function saysStandbyWhenArmedOnTheGround(): Promise<void> {
  await goesTo('STABILIZE')
  await armWhenReady()
  const seen = await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)

  // armed, and on the ground: still landed (the throttle stays at the bottom, so it does not lift off)
  expect(seen.systemStatus).toBe(STANDBY)
  expect((await command('vehicle.disarm')).result).toBe('accepted')
  await client().until('the heartbeat says disarmed', s => !s.armed, HEARTBEAT_MS)
}

async function saysActiveInTheAirAndStandbyAgain(): Promise<void> {
  await goesTo('GUIDED')
  await armWhenReady()
  await client().until('the heartbeat says armed', s => s.armed, HEARTBEAT_MS)
  expect((await command('vehicle.takeoff', { altitude: 5 })).result).toBe('accepted')
  const up = await client().until('the vehicle is about 5 m above home', s => (s.position?.relativeAltitude ?? 0) > 4, CLIMB_MS)

  // in the air: not landed, so the sticks' disarm gesture stays held, in whatever mode
  expect(up.systemStatus).toBe(ACTIVE)
  await goesTo('LAND')
  const down = await client().until('the vehicle is landed again', s => s.systemStatus === STANDBY, LAND_MS)

  expect(down.position?.relativeAltitude ?? 0).toBeLessThan(1)
  // what the status does from touchdown on (the data the gesture's wait stands on: it is in the report when this fails)
  const after = await statusesFor(STABLE_MS)

  expect(onlyStandby(after), `statuses after touchdown (status@second): ${after}`).toBe(true)
  await client().until('the vehicle has disarmed', s => !s.armed, LAND_MS)
}

describeSitl(
  'the heartbeat says landed: the facts the stick disarm rule stands on, against ArduPilot SITL',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)

    it('says STANDBY when the vehicle is disarmed', saysStandbyWhenDisarmed, STANDBY_MS + 30_000)
    it('stays STANDBY, without flapping, while it is disarmed', staysStandbyOnceDisarmed, STANDBY_MS + STABLE_MS + 30_000)
    it('says STANDBY when it is armed on the ground, before a take off', saysStandbyWhenArmedOnTheGround, READY_MS + 60_000)
    it('says ACTIVE in the air, and STANDBY again once landed', saysActiveInTheAirAndStandbyAgain, READY_MS + CLIMB_MS + LAND_MS)
  },
  { launchOnly: true },
)
