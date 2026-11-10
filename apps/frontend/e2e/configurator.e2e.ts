// End to end, in the real window: the Pico Desktop host, the Pico backend, pico-mavlink and the
// simulated vehicle, driven over DevTools. `pnpm e2e` (pico-desktop test --e2e) builds the app
// and runs this.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { askToWriteQueued, clickConnect, confirmWrite, queueValue, showScreen, waitForQueuedWritten } from './click'

let app: E2eApp

/**
 * What the host logged about the backend and itself.
 *
 * @returns the host's log lines, joined
 */
function hostLog(): string {
  return app.log.filter(line => line.includes('pd-host')).join('\n')
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

describe('the configurator against the simulated vehicle', () => {
  it('connects to the simulator through the Pico backend', async () => {
    // Right after the window opens a click can land before the page is laid out and do nothing (click.ts).
    await clickConnect(app)
    const connection = await app.waitForText('#connection', 'connected · system')

    expect(connection).toMatch(/connected · system 1\/1 · QUADROTOR · ARDUPILOTMEGA/u)
  })

  it('downloads the 12 parameters', async () => {
    await showScreen(app, 'parameters')
    expect(await app.waitForText('#list-status', '12 parameters')).toBe('12 parameters')
  })

  it('shows telemetry, the mode named from ArduPilot\'s table', async () => {
    await showScreen(app, 'flight')
    const telemetry = await app.waitForText('#telemetry', /BATTERY\s*\d/u)
    expect(telemetry).toMatch(/GPS/u)
    expect(await app.waitForText('#top-bar', /MODE\s*(?:STABILIZE|LOITER)/u)).toMatch(/BATTERY/u)
  })

  it('has the top bar on every screen: the vehicle and its link, the mode', async () => {
    await showScreen(app, 'parameters')
    const bar = await app.waitForText('#top-bar', /MODE\s*(?:STABILIZE|LOITER)/u)

    expect(bar).toMatch(/QUADROTOR\s*ARDUPILOTMEGA · system 1\/1/u)
  })
})

describe('writing, reconnecting and closing', () => {
  it('asks before writing, then writes and verifies the read-back', async () => {
    await showScreen(app, 'parameters')
    await queueValue(app, 'RTL_ALT', 1500, 1600)
    await askToWriteQueued(app, ['RTL_ALT'])
    await confirmWrite(app)
    await waitForQueuedWritten(app, 'RTL_ALT', 1600)
    expect(await app.text('tr[data-id="RTL_ALT"]')).toMatch(/1600/u)
  })

  it('disconnects and reconnects', async () => {
    await app.click('#disconnect-button')
    await app.waitForText('#connection', /^disconnected/u)
    await clickConnect(app)
    await app.waitForText('#connection', 'connected · system')
  })

  it('closing while connected, the backend ends cleanly in time', async () => {
    expect(await app.close()).toBe(0)
    const host = hostLog()
    expect(host).toContain('the backend ended (exit code 0)')
    expect(host).not.toContain('didn\'t finish in time')
  })
})
