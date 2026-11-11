// End to end, in the real window: values by the type of the parameter. An integer has no decimals (what is typed is rounded when
// it is settled, and the field says so), a float is shown without noise and queued and asked about as the float nearest to
// what was typed.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cancelConfirm, clickConnect, showScreen } from './click'

let app: E2eApp

const field = () => app.evaluate<string>(`document.querySelector('#draft').value`)
const values = (id: string) => `document.querySelector('#staged .staged-row[data-id="${id}"] .values')`
const row = (id: string) => app.evaluate<string>(`${values(id)}.innerText`)

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
})

afterAll(async () => {
  await app?.close()
})

describe('an integer parameter', () => {
  it('rounds what is typed with decimals when it is settled, shows that in the field, and queues the whole number', async () => {
    await app.click('tr[data-id="SERIAL0_BAUD"]')
    await app.waitFor(`document.querySelector('#draft')?.value === '115'`)

    await app.fill('#draft', '115.6')

    await app.waitFor(`document.querySelector('#staged .staged-row[data-id="SERIAL0_BAUD"]') !== null`)
    expect(await field()).toBe('116')
    expect(await row('SERIAL0_BAUD')).toMatch(/115\s*→\s*116/u)
  })
})

describe('a float parameter', () => {
  it('queues the float nearest to what was typed and asks about it without noise', async () => {
    await app.click('tr[data-id="FENCE_RADIUS"]')
    await app.waitFor(`document.querySelector('#draft')?.value === '150'`)

    await app.fill('#draft', '3.3')
    await app.waitFor(`document.querySelector('#staged .staged-row[data-id="FENCE_RADIUS"]') !== null`)
    await app.click('#write-staged')

    expect(await row('FENCE_RADIUS')).toMatch(/150\s*→\s*3\.3/u)
    await app.waitForText('#question', /FENCE_RADIUS 150 → 3\.3\b/u)
    await cancelConfirm(app)
  })

  it('shows a value that the vehicle holds as a float without the digits of its widening', async () => {
    expect(await app.evaluate<boolean>(
      `[...document.querySelectorAll('#rows td.num')].every(cell => !/\\d{9,}/u.test(cell.textContent))`,
    )).toBe(true)
  })
})
