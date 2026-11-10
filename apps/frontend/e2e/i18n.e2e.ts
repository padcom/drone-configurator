// End to end, in the real window: the interface's text comes from the precompiled messages. A message that was not
// precompiled (the unplugin did not run, or the CSP blocked the compiler) would show its key instead of its text.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openConnect, showScreen } from './click'

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

  it('shows the translated text of the Connect dialog and the telemetry, not message keys', async () => {
    await openConnect(app)
    expect(await app.text('#connect-button')).toBe('Connect')
    expect(await app.text('#telemetry')).toContain('No telemetry: connect to a vehicle.')
    expect(await app.text('#connect')).not.toMatch(/connection\.[a-z]/u)
    expect(await app.text('dialog')).not.toMatch(/connect\.[a-z]/u)
    await app.click('#connect-cancel')
    await app.waitFor('document.querySelector(\'dialog\') === null')
  })

  it('names the screens in the navigation from the messages, not with their keys', async () => {
    const navigation = await app.text('nav')

    expect(navigation).toContain('Flight data')
    expect(navigation).toContain('Parameters')
    expect(navigation).not.toMatch(/screen\.[a-z]/u)
  })
})

describe('the parameter list and the editor', () => {
  it('show text, not message keys', async () => {
    await showScreen(app, 'parameters')
    expect(await app.text('#list-status')).toBe('Connect to download the parameters.')
    expect(await app.text('#refresh')).toBe('Download')
    expect(await app.text('#detail')).toBe('Select a parameter to see or change it.')
    expect(await app.text('#write')).toBe('Write')
  })

  it('show the file buttons and the import panel as text, not message keys', async () => {
    expect(await app.text('#save')).toBe('Save snapshot')
    expect(await app.text('#load-button')).toBe('Load snapshot')
    expect(await app.text('#metadata-button')).toBe('Load metadata')
    expect(await app.text('#apply')).toBe('Write 0 ticked')
    expect(await app.text('#close-import')).toBe('Close')
  })

  it('close cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
