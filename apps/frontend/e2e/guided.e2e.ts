// End to end, in the real window with the real backend and a SCRIPTED vehicle behind a TCP port (e2e/scripted-vehicle.ts: it says
// what a test tells it and notes EVERY command it is sent): the guided commands. A request the backend refuses must send the
// vehicle NOTHING, which the recorded commands prove; what is allowed is sent once, as one COMMAND_INT with the place as degrees
// times 1e7. The vehicle is armed in GUIDED, 20 m up and standing still, with FS_GCS_ENABLE 0 and no fence. What ArduPilot does
// with them is sitl-guided.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { BridgeClient } from './bridge-client'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'
import { sleep } from './strip'

/** MAV_CMD_DO_CHANGE_SPEED, MAV_CMD_DO_SET_HOME and MAV_CMD_DO_REPOSITION: the commands that must not go out when refused. */
const GUIDED_COMMANDS = [178, 179, 192]
const LIMITS = { maxAltitude: 50, maxDistance: 500, maxSpeed: 10 }
const HOME = { lat: 52.2297, lon: 21.0122 }
/** About 55 m north of home. */
const NORTH = 52.2302

let vehicle: ScriptedVehicle | undefined
let app: E2eApp | undefined
let backend: BridgeClient | undefined

/**
 * The vehicle under test.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function scripted(): ScriptedVehicle {
  if (!vehicle) {
    throw new Error('the vehicle has not started')
  }

  return vehicle
}

/**
 * The client of the backend.
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
 * The guided commands the vehicle was sent so far.
 *
 * @returns what they were, as the vehicle noted them
 */
function sent(): { command: number, params: number[], frame?: number }[] {
  return scripted().received().filter(received => GUIDED_COMMANDS.includes(received.command))
}

/**
 * What a method came to: the code of its refusal, or the vehicle's answer.
 *
 * @param name the method
 * @param payload its request
 * @returns the code, or the name of the result
 */
async function outcome(name: string, payload: unknown = null): Promise<string> {
  const answer = await client().call(name, payload)

  return answer.error ? answer.error.code : (answer.result as { result: string }).result
}

/**
 * A reposition request.
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

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  vehicle.position({ lat: HOME.lat, lon: HOME.lon, heading: 0, height: 20 })
  vehicle.home(HOME)
  vehicle.params({ FS_GCS_ENABLE: 0, FENCE_ENABLE: 0 })
  vehicle.arm(true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  // (a command is held off while the parameters are downloaded)
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
  backend = new BridgeClient(app)
  await backend.install()
  // GUIDED (4), by the backend, as the page does
  expect(await outcome('vehicle.setMode', { mode: 4 })).toBe('accepted')
  await client().until('the heartbeat says GUIDED and armed', s => s.mode === 'GUIDED' && s.armed, 30_000)
  // (home is said once a second here)
  await client().until('the vehicle has said where it is', s => s.position !== undefined, 30_000)
  await sleep(1500)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('sends the vehicle NOTHING for a request that is refused', async () => {
  const request = (...args: [number, number, number, 'block' | 'warn']): unknown => reposition(...args)
  const refused: [string, unknown, string][] = [
    ['0, 0', request(0, 0, 20, 'warn'), 'INVALID_VALUE'],
    ['NaN', request(Number.NaN, HOME.lon, 20, 'warn'), 'INVALID_VALUE'],
    ['off the globe', request(95, HOME.lon, 20, 'warn'), 'INVALID_VALUE'],
    ['too high', request(NORTH, HOME.lon, 51, 'warn'), 'OUT_OF_LIMITS'],
    ['too low', request(NORTH, HOME.lon, 1, 'warn'), 'OUT_OF_LIMITS'],
    ['too far from home', request(HOME.lat + 0.01, HOME.lon, 20, 'warn'), 'OUT_OF_LIMITS'],
    ['the failsafe is off and the policy blocks', request(NORTH, HOME.lon, 20, 'block'), 'GCS_FAILSAFE_OFF'],
  ]
  for (const [name, payload, code] of refused) {
    // eslint-disable-next-line no-await-in-loop -- one after the other
    expect(await outcome('vehicle.reposition', payload), name).toBe(code)
  }
  expect(await outcome('vehicle.setSpeed', { speed: 11, limits: LIMITS })).toBe('OUT_OF_LIMITS')
  expect(await outcome('vehicle.setSpeed', { speed: 0, limits: LIMITS })).toBe('INVALID_VALUE')
  expect(await outcome('vehicle.changeAltitude', { altitude: 51, limits: LIMITS, failsafe: 'warn' })).toBe('OUT_OF_LIMITS')
  // (no request at all)
  expect(['INVALID_VALUE', 'INVALID_PAYLOAD']).toContain(await outcome('vehicle.reposition'))
  // (and not one command reached the vehicle)
  expect(sent()).toEqual([])
})

it('sends nothing out of GUIDED', async () => {
  // LOITER (5)
  expect(await outcome('vehicle.setMode', { mode: 5 })).toBe('accepted')
  await client().until('the heartbeat says LOITER', s => s.mode === 'LOITER', 30_000)

  expect(await outcome('vehicle.reposition', reposition(NORTH, HOME.lon, 20, 'warn'))).toBe('NOT_GUIDED')
  expect(await outcome('vehicle.setSpeed', { speed: 5, limits: LIMITS })).toBe('NOT_GUIDED')
  expect(sent()).toEqual([])
  expect(await outcome('vehicle.setMode', { mode: 4 })).toBe('accepted')
  await client().until('the heartbeat says GUIDED', s => s.mode === 'GUIDED', 30_000)
})

it('sends one COMMAND_INT for a reposition, with the failsafe warning in the answer', async () => {
  const answer = await client().call('vehicle.reposition', reposition(NORTH, HOME.lon, 30, 'warn'))
  const result = answer.result as { result: string, messages: string[] }

  expect(result.result).toBe('accepted')
  expect(result.messages.some(text => text.includes('FS_GCS_ENABLE is 0'))).toBe(true)
  // the place as degrees times 1e7, the altitude, the frame above home (6)
  expect(sent()).toEqual([{ command: 192, params: [-1, 0, 0, 0, 522302000, 210122000, 30], frame: 6 }])
})

it('keeps the place of the backend for a change of altitude, and sends once', async () => {
  const before = sent().length
  const result = await outcome('vehicle.changeAltitude', { altitude: 12, limits: LIMITS, failsafe: 'warn' })
  const last = sent()[before]

  expect(result).toBe('accepted')
  expect(sent().length).toBe(before + 1)
  expect(last?.params).toEqual([-1, 0, 0, 0, 522297000, 210122000, 12])
})

it('forgets home when it sets it here, until the vehicle says it again', async () => {
  const before = sent().length

  expect(await outcome('vehicle.setHomeHere')).toBe('accepted')
  // (home that was heard is forgotten: nothing is measured from it)
  expect(await outcome('vehicle.reposition', reposition(NORTH, HOME.lon, 20, 'warn'))).toBe('HOME_UNKNOWN')
  expect(sent().length).toBe(before + 1)
  expect(sent()[before]?.command).toBe(179)
  // the vehicle says home once a second
  await sleep(6000)

  expect(await outcome('vehicle.reposition', reposition(NORTH, HOME.lon, 20, 'warn'))).toBe('accepted')
})
