// End to end, in the real window: the Pico Desktop host, the Pico backend, pico-mavlink and the
// simulated vehicle, driven over DevTools. `pnpm e2e` (pico-desktop test --e2e) builds the app
// and runs this.
import { type E2eApp, launchApp } from 'pico-desktop'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
    await app.click('#connect-button')
    const connection = await app.waitForText('#connection', 'connected · system')

    expect(connection).toMatch(/connected · system 1\/1 · QUADROTOR · ARDUPILOTMEGA/u)
  })

  it('downloads the 12 parameters', async () => {
    expect(await app.waitForText('#list-status', '12 parameters')).toBe('12 parameters')
  })

  it('shows telemetry, the mode named from ArduPilot\'s table', async () => {
    const telemetry = await app.waitForText('#telemetry', 'Heartbeat')
    expect(telemetry).toMatch(/Mode\s*(?:STABILIZE|LOITER)/u)
    expect(telemetry).toMatch(/Battery/u)
  })
})

describe('writing, reconnecting and closing', () => {
  it('asks before writing, then writes and verifies the read-back', async () => {
    await app.click('tr[data-id="RTL_ALT"]')
    await app.fill('#draft', '1600')
    await app.click('#write')
    expect(await app.waitForText('#question', 'Set RTL_ALT')).toBe('Set RTL_ALT from 1500 to 1600?')
    await app.click('#confirm button[value=yes]')
    expect(await app.waitForText('#detail', 'Written and read back')).toMatch(/Written and read back: 1600\./u)
    expect(await app.text('tr[data-id="RTL_ALT"]')).toMatch(/1600/u)
  })

  it('disconnects and reconnects', async () => {
    await app.click('#disconnect-button')
    await app.waitForText('#connection', /^disconnected/u)
    await app.click('#connect-button')
    await app.waitForText('#connection', 'connected · system')
  })

  it('closing while connected, the backend ends cleanly in time', async () => {
    expect(await app.close()).toBe(0)
    const host = hostLog()
    expect(host).toContain('the backend ended (exit code 0)')
    expect(host).not.toContain('didn\'t finish in time')
  })
})
