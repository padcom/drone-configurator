// End to end, in the real window: the initial values (what the parameters had at the last complete download). The footer says
// when they were taken; a parameter that was written is marked as changed; "Reset to initial value" (one parameter) and "Reset N
// changed to initial values" (all of them) queue the initial values, and the one question is the only way they are written;
// the user's Download takes the values as they are as the new initial ones.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { askToWriteQueued, clickConnect, confirmWrite, queueValue, showScreen, waitForQueuedWritten } from './click'

let app: E2eApp

/**
 * Writes a value of RTL_ALT the way a user does, and waits until the vehicle read it back.
 *
 * @param from the value it has
 * @param to the value to write
 */
async function writeRtl(from: number, to: number): Promise<void> {
  await queueValue(app, 'RTL_ALT', from, to)
  await askToWriteQueued(app, [{ id: 'RTL_ALT', from, to }])
  await confirmWrite(app)
  await waitForQueuedWritten(app, 'RTL_ALT', to)
}

/**
 * The ids of the rows whose value is marked as changed.
 *
 * @returns the names
 */
const changedRows = () => app.evaluate<string[]>(
  `[...document.querySelectorAll('td.num.changed')].map(c => c.parentElement.dataset.id)`,
)

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

describe('the initial values', () => {
  it('say when they were taken, and nothing has changed at first', async () => {
    await app.waitForText('#initial-status', /^Initial values: downloaded \d\d:\d\d:\d\d$/u)

    expect(await changedRows()).toEqual([])
    expect(await app.text('#reset-all')).toBe('Reset 0 changed parameters to their initial values')
    expect(await app.evaluate<boolean>(`document.querySelector('#reset-all').disabled`)).toBe(true)
  })

  it('make a written parameter a changed one: marked, counted on the button, and a reset for it in the detail', async () => {
    await writeRtl(1500, 1600)

    expect(await changedRows()).toEqual(['RTL_ALT'])
    expect(await app.evaluate<string>(`document.querySelector('tr[data-id="RTL_ALT"] td.num').getAttribute('title')`))
      .toBe('Changed from its initial value 1500')
    await app.waitForText('#reset-all', 'Reset 1 changed parameter to its initial value')
    await app.click('tr[data-id="RTL_ALT"]')
    expect(await app.text('#reset-one')).toBe('Reset to initial value')
  })
})

describe('the reset', () => {
  it('of one parameter queues its initial value, which is asked about and written, and it is no longer changed', async () => {
    await app.click('#reset-one')

    await app.waitFor(`[...document.querySelectorAll('#staged .staged-row')].some(r => /1600\\s*→\\s*1500/u.test(r.textContent))`)
    expect(await app.evaluate<string>(`document.querySelector('#draft').value`)).toBe('1500')
    await askToWriteQueued(app, [{ id: 'RTL_ALT', from: 1600, to: 1500 }])
    await confirmWrite(app)
    await waitForQueuedWritten(app, 'RTL_ALT', 1500)

    expect(await changedRows()).toEqual([])
    await app.waitFor(`document.querySelector('#reset-one') === null`)
  })

  it('of all that changed queues them, with the one question that names them', async () => {
    await writeRtl(1500, 1700)
    await app.click('#reset-all')

    // (An older toast, that the write before said, may still be in front of it.)
    await app.waitFor(`[...document.querySelectorAll('.kit-toast.sev-success')]
      .some(toast => /1 queued to go back to its initial value/u.test(toast.textContent))`)
    await askToWriteQueued(app, [{ id: 'RTL_ALT', from: 1700, to: 1500 }])
    await confirmWrite(app)
    await waitForQueuedWritten(app, 'RTL_ALT', 1500)

    expect(await changedRows()).toEqual([])
    await app.waitForText('#reset-all', 'Reset 0 changed parameters to their initial values')
  })
})

describe('the Download the user presses', () => {
  it('takes the values as they are as the initial ones: what was written is not changed after it', async () => {
    await writeRtl(1500, 1800)
    expect(await changedRows()).toEqual(['RTL_ALT'])

    await app.click('#refresh')

    await app.waitFor(`document.querySelectorAll('td.num.changed').length === 0`)
    await app.waitForText('#reset-all', 'Reset 0 changed parameters to their initial values')
    expect(await app.text('tr[data-id="RTL_ALT"] td.num')).toBe('1800')
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
