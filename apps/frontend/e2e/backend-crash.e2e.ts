// The backend dies while a parameter write is in flight: the real process, killed.
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { askToWriteQueued, chooseConnection, clickConnect, confirmWrite, queueValue, showScreen } from './click'
import { TcpVehicle } from './tcp-vehicle'

const backend = fileURLToPath(new URL('../../../.pico-desktop/e2e/backend', import.meta.url))
const row = 'tr[data-id="RTL_ALT"]'

let vehicle: TcpVehicle
let app: E2eApp

/** SIGKILL for this checkout's backend only: anchored, so the host (which names it in its arguments) lives. */
function killBackend(): void {
  execFileSync('pkill', ['-KILL', '-f', `^${backend}`])
}

/** Clicks Connect and waits for the vehicle and its parameters. */
async function connected(): Promise<void> {
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system')
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters$/u)
}

/** Starts a write of RTL_ALT that the vehicle never answers, and waits until it has been sent. */
async function startUnansweredWrite(): Promise<void> {
  await connected()
  expect(await app.text(`${row} td.num`)).toBe('1500')

  await queueValue(app, 'RTL_ALT', 1500, 1600)
  await askToWriteQueued(app, ['RTL_ALT'])
  vehicle.mute()
  const sent = vehicle.nextWrite()
  await confirmWrite(app)
  await sent
  expect(await app.text('#staged')).toContain('Writing…')
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
})

afterAll(async () => {
  await app?.close()
  vehicle?.stop()
})

describe('a backend crash during a parameter write', () => {
  it('keeps the UI, says the write is unconfirmed, and doesn\'t send it again', async () => {
    await startUnansweredWrite()

    killBackend()
    expect(await app.waitForText('#connection', 'lost')).toContain('Connect again to continue')
    // The change's row says it was not confirmed (a cross, and why), and the run says it stopped there: never done.
    expect(await app.waitForText('#staged .staged-row[data-id="RTL_ALT"] .line', /^✕/u)).toMatch(/^✕/u)
    expect(await app.waitForText('#staged', 'Stopped there')).toContain('the rest weren\'t written')
    expect(await app.text(`${row} td.num`)).toBe('1500')

    // Long enough for the host to bring a new backend up. It doesn't reconnect on its own, and
    // the warning stays until the user does.
    await sleep(3000)
    const { writes } = vehicle
    const connection = await app.text('#connection')
    expect(connection).not.toContain('connected · system')
    expect(connection).toContain('Connect again to continue')

    await connected()
    await sleep(1000)
    expect(vehicle.writes).toBe(writes)
  })
})
