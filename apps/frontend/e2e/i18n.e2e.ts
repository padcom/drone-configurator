// End to end, in the real window: the interface's text comes from the precompiled messages. A message that was not
// precompiled (the unplugin did not run, or the CSP blocked the compiler) would show its key instead of its text.
import { type E2eApp, launchApp } from 'pico-desktop'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('the interface language', () => {
  let app: E2eApp

  beforeAll(async () => {
    app = await launchApp()
    await app.waitForText('#connection', 'disconnected')
  })

  afterAll(async () => {
    await app?.close()
  })

  it('titles the window from the messages, not with the key', async () => {
    expect(await app.evaluate<string>('document.title')).toBe('Drone Configurator')
  })

  it('shows the translated text of a component, not message keys', async () => {
    expect(await app.text('#connect-button')).toBe('Connect')
    expect(await app.text('#telemetry')).toContain('No telemetry: connect to a vehicle.')
    expect(await app.text('#connect')).not.toMatch(/connection\.[a-z]/u)
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
