// End to end, in the real window: the command palette. Ctrl+P (real key events through the host) opens it from anywhere, also
// from a text field, and the page prevents the default (Chromium would print); typing narrows the commands, Enter goes to the
// screen and puts the focus in it, and Escape gives the focus back to what had it.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'
import { CTRL, chord as press, openPalette } from './palette-keys'

let app: E2eApp

/**
 * Presses a key, with the modifiers, as the host receives it.
 *
 * @param key the key: `p`, `Escape` or `Enter`
 * @param modifiers the DevTools modifier bits
 * @returns once the key is pressed and let go
 */
const chord = (key: string, modifiers = 0) => press(app, key, modifiers)

/** What the page saw of Ctrl+P: recorded in the bubble phase, after the palette's own listener ran. */
const WATCH = `(() => {
  window.__ctrlP = []
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyP' && e.ctrlKey) {
      window.__ctrlP.push(e.defaultPrevented)
    }
  })
})()`

/** The rows of the palette, by their command. */
const ROWS = `[...document.querySelectorAll('.palette-row')].map(row => row.dataset.command)`

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await app.evaluate(WATCH)
})

afterAll(async () => {
  await app?.close()
})

describe('opening the palette', () => {
  it('opens on Ctrl+P, which the page prevents, with the focus in the search box', async () => {
    await openPalette(app)

    expect(await app.evaluate<boolean[]>('window.__ctrlP')).toEqual([true])
    expect(await app.evaluate<string>('document.activeElement.id')).toBe('palette-input')
    // The commands of the screens and of their parts (Setup and Logs have parts, and each part has its command) are all there;
    // the number is not pinned, since a new part is a new command.
    const rows = await app.evaluate<string[]>(ROWS)
    const goes = await app.evaluate<number>(`${ROWS}.filter(id => id.startsWith('go.')).length`)
    expect(rows).toEqual(expect.arrayContaining(['connect.open', 'go.flight', 'go.setup', 'go.setup.modes', 'go.logs.vehicle']))
    expect(goes).toBeGreaterThanOrEqual(7 + 5 + 12)
    expect(rows.length).toBeGreaterThanOrEqual(20)
    // Nothing printed and no other window: the page is still the only dialog, and still the one document.
    expect(await app.evaluate<number>(`document.querySelectorAll('dialog[open]').length`)).toBe(1)
  })

  it('closes on Ctrl+P again, and on Escape, and the focus goes back to what had it', async () => {
    await chord('p', CTRL)
    await app.waitFor(`document.querySelector('#palette-input') === null`)
    await showScreen(app, 'parameters')
    await app.waitFor(`document.querySelector('#filter') !== null`)
    await app.evaluate(`document.querySelector('#filter').focus()`)

    // From inside a text field too.
    await openPalette(app)
    await chord('Escape')
    await app.waitFor(`document.querySelector('#palette-input') === null`)

    await app.waitFor(`document.activeElement?.id === 'filter'`)
  })
})

describe('the top bar', () => {
  it('has no button for the palette: it is the command "Show command palette", reached by its key', async () => {
    expect(await app.evaluate<boolean>(`document.querySelector('#open-palette') === null`)).toBe(true)
  })
})

describe('running a command', () => {
  it('goes to the screen that was typed, closes, and puts the focus in the search box of the screen', async () => {
    await showScreen(app, 'flight')
    await openPalette(app)
    await app.fill('#palette-input', 'switch to param')
    await app.waitFor(`${ROWS}.length === 1`)

    expect(await app.evaluate<string[]>(ROWS)).toEqual(['go.parameters'])
    await chord('Enter')
    await app.waitFor(`document.querySelector('#palette-input') === null && location.hash === '#/parameters'`)

    // The Parameters screen's search box has the focus, and what is typed goes into it.
    await app.waitFor(`document.activeElement === document.getElementById('filter')`)
    await app.press('b')
    await app.press('a')
    await app.waitFor(`document.getElementById('filter').value === 'ba'`)
  })
})

describe('what the palette says', () => {
  it('says when nothing matches', async () => {
    await openPalette(app)
    await app.fill('#palette-input', 'zzzz')
    await app.waitFor(`document.querySelector('.palette-empty') !== null`)

    expect(await app.text('.palette-empty')).toBe('Nothing matches “zzzz”.')
    await chord('Escape')
  })

  it('finds a command by its English name in another language', async () => {
    await showScreen(app, 'settings')
    await app.waitFor(`document.querySelector('main select[id$="-language"]') !== null`)
    await app.fill('main select[id$="-language"]', 'pl')
    await app.waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Dane lotu'`)
    await openPalette(app)
    await app.fill('#palette-input', 'switch to logs')
    // The screen, and one command for each of its five parts ("Switch to Logs: Flights" ...): the screen's own is the first.
    await app.waitFor(`${ROWS}.length === 6`)

    expect(await app.text('.palette-label')).toBe('Przejdź do ekranu Logi')
    await chord('Escape')
    await showScreen(app, 'settings')
    await app.fill('main select[id$="-language"]', 'en')
  })
})
