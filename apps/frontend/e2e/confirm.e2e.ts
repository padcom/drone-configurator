// End to end, in the real window: the confirmation before a parameter write is a modal dialog with Cancel and Write (no
// hold, no typed word), and what the browser does with focus (which jsdom does not) is what makes it usable by keyboard.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cancelConfirm, clickConnect, confirmWrite, showScreen, waitForWritten } from './click'

let app: E2eApp

/**
 * Asks to write RTL_ALT, and waits for the question.
 *
 * @param value the value to write
 */
async function askToWrite(value: string): Promise<void> {
  await app.click('tr[data-id="RTL_ALT"]')
  await app.fill('#draft', value)
  await app.click('#write')
  await app.waitForText('#question', `Set RTL_ALT from 1500 to ${value}?`)
}

/**
 * The id of the element that has the focus.
 *
 * @returns the id, or an empty string
 */
function focused(): Promise<string> {
  return app.evaluate<string>('document.activeElement ? document.activeElement.id : \'\'')
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 30_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters')
}, 120_000)

afterAll(async () => {
  await app?.close()
})

describe('the confirmation before a write, in the window', () => {
  it('is a modal dialog that names the vehicle, with the safe choice focused', async () => {
    await askToWrite('1700')

    expect(await app.evaluate<boolean>('document.querySelector(\'#confirm\').matches(\':modal\')')).toBe(true)
    expect(await app.text('#vehicle')).toMatch(/QUADROTOR · ARDUPILOTMEGA · system 1\/1/u)
    expect(await focused()).toBe('confirm-cancel')
  })

  it('has a Write button and no hold: the vehicle\'s read-back makes a write safe, not the press', async () => {
    expect(await app.text('#confirm-yes')).toBe('Write')
    expect(await app.evaluate<boolean>('document.querySelector(\'#confirm-hold\') === null')).toBe(true)
    expect(await app.evaluate<boolean>('document.querySelector(\'#confirm input\') === null')).toBe(true)
  })

  it('does not write when it is cancelled with Escape, and gives the focus back to Write', async () => {
    await app.press('Escape')
    await app.waitFor('document.querySelector(\'#confirm\') === null')

    expect(await focused()).toBe('write')
    expect(await app.text('tr[data-id="RTL_ALT"]')).toMatch(/1500/u)
  })
})

describe('answering the confirmation, in the window', () => {
  it('does not write when it is cancelled with the button', async () => {
    await app.click('#write')
    await app.waitForText('#question', 'Set RTL_ALT from 1500 to 1700?')
    await cancelConfirm(app)

    expect(await app.text('tr[data-id="RTL_ALT"]')).toMatch(/1500/u)
  })

  it('writes and verifies the read-back when Write is pressed', async () => {
    await app.click('#write')
    await app.waitForText('#question', 'Set RTL_ALT from 1500 to 1700?')
    await confirmWrite(app)

    await waitForWritten(app, 'tr[data-id="RTL_ALT"]', 1700)
    // The focus is not lost to the page: the button that opened the dialog was disabled while it wrote.
    expect(await app.evaluate<boolean>('document.activeElement !== document.body')).toBe(true)
  })
})
