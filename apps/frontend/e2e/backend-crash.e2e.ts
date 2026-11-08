// The backend dies while a parameter write is in flight: the real process, killed.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { type E2eApp, launchApp } from 'pico-desktop'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TcpVehicle } from './tcp-vehicle'

const backend = fileURLToPath(new URL('../../../.pico-desktop/e2e/backend', import.meta.url))
const row = 'tr[data-id="RTL_ALT"]'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** SIGKILL for this checkout's backend only: anchored, so the host (which names it in its arguments) lives. */
const killBackend = () => execFileSync('pkill', ['-KILL', '-f', `^${backend}`])

describe('a backend crash during a parameter write', () => {
  let vehicle: TcpVehicle
  let app: E2eApp

  async function connected() {
    await app.click('#connect-button')
    await app.waitForText('#connection', 'connected · system')
    await app.waitForText('#list-status', /^\d+ parameters$/u)
  }

  beforeAll(async () => {
    vehicle = await TcpVehicle.start()
    app = await launchApp()
    await app.waitForText('#connection', 'disconnected')
    await app.fill('#transport', 'tcp')
    await app.fill('#host', '127.0.0.1')
    await app.fill('#port', String(vehicle.port))
  })

  afterAll(async () => {
    await app?.close()
    vehicle?.stop()
  })

  it('keeps the UI, says the write is unconfirmed, and doesn\'t send it again', async () => {
    await connected()
    expect(await app.text(`${row} td.num`)).toBe('1500')

    await app.click(row)
    await app.fill('#draft', '1600')
    await app.click('#write')
    await app.waitForText('#question', 'Set RTL_ALT')
    vehicle.mute()
    const sent = vehicle.nextWrite()
    await app.click('#confirm button[value=yes]')
    await sent
    expect(await app.text('#detail')).toContain('Writing…')

    killBackend()
    expect(await app.waitForText('#connection', 'lost')).toContain('Connect again to continue')
    expect(await app.waitForText('#detail', 'Not confirmed')).toContain('The value on the vehicle is unknown')
    expect(await app.text(`${row} td.num`)).toBe('1500')

    // Long enough for the host to bring a new backend up. It doesn't reconnect on its own, and
    // the warning stays until the user does.
    await sleep(3000)
    const writes = vehicle.writes
    const connection = await app.text('#connection')
    expect(connection).not.toContain('connected · system')
    expect(connection).toContain('Connect again to continue')

    await connected()
    await sleep(1000)
    expect(vehicle.writes).toBe(writes)
  })
})
