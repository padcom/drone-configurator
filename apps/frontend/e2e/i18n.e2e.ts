// End to end, in the real window: the interface's text comes from the precompiled messages. A message that was not
// precompiled (the unplugin did not run, or the CSP blocked the compiler) would show its key instead of its text.
import { type E2eApp, launchApp } from 'pico-desktop'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let app: E2eApp

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

describe('the interface language', () => {
  it('titles the window from the messages, not with the key', async () => {
    expect(await app.evaluate<string>('document.title')).toBe('Drone Configurator')
  })

  it('shows the translated text of the connection bar and the telemetry, not message keys', async () => {
    expect(await app.text('#connect-button')).toBe('Connect')
    expect(await app.text('#telemetry')).toContain('No telemetry: connect to a vehicle.')
    expect(await app.text('#connect')).not.toMatch(/connection\.[a-z]/u)
  })
})

describe('the parameter list and the editor', () => {
  it('show text, not message keys', async () => {
    expect(await app.text('#list-status')).toBe('Connect to download the parameters.')
    expect(await app.text('#refresh')).toBe('Download')
    expect(await app.text('#detail')).toBe('Select a parameter to see or change it.')
    expect(await app.text('#write')).toBe('Write')
  })

  it('close cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
