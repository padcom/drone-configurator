// End to end, in the real window: the command palette. Ctrl+P (real key events through the host) opens it from anywhere, also
// from a text field, and the page prevents the default (Chromium would print); typing narrows the commands, Enter goes to the
// screen and puts the focus in it, and Escape gives the focus back to what had it.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'

let app: E2eApp

/** DevTools modifier bit for Ctrl, and the virtual key codes of the keys used. */
const CTRL = 2
const CODES: Record<string, [number, string]> = { p: [80, 'KeyP'], Escape: [27, 'Escape'], Enter: [13, 'Enter'] }

/**
 * Presses a key, with the modifiers, as the host receives it.
 *
 * @param key the key: `p`, `Escape` or `Enter`
 * @param modifiers the DevTools modifier bits
 */
async function chord(key: string, modifiers = 0): Promise<void> {
  const [code, name] = CODES[key] as [number, string]
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: name, modifiers }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

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
    await chord('p', CTRL)
    await app.waitFor(`document.querySelector('#palette-input') !== null`)

    expect(await app.evaluate<boolean[]>('window.__ctrlP')).toEqual([true])
    expect(await app.evaluate<string>('document.activeElement.id')).toBe('palette-input')
    expect(await app.evaluate<string[]>(ROWS)).toHaveLength(14)
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
    await chord('p', CTRL)
    await app.waitFor(`document.querySelector('#palette-input') !== null`)
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
    await chord('p', CTRL)
    await app.waitFor(`document.querySelector('#palette-input') !== null`)
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
    await chord('p', CTRL)
    await app.waitFor(`document.querySelector('#palette-input') !== null`)
    await app.fill('#palette-input', 'zzzz')
    await app.waitFor(`document.querySelector('.palette-empty') !== null`)

    expect(await app.text('.palette-empty')).toBe('Nothing matches “zzzz”.')
    await chord('Escape')
  })

  it('finds a command by its English name in another language', async () => {
    await showScreen(app, 'settings')
    await app.waitFor(`document.querySelector('main select') !== null`)
    await app.fill('main select', 'pl')
    await app.waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Dane lotu'`)
    await chord('p', CTRL)
    await app.waitFor(`document.querySelector('#palette-input') !== null`)
    await app.fill('#palette-input', 'switch to logs')
    await app.waitFor(`${ROWS}.length === 1`)

    expect(await app.text('.palette-label')).toBe('Przejdź do ekranu Logi')
    await chord('Escape')
    await showScreen(app, 'settings')
    await app.fill('main select', 'en')
  })
})
