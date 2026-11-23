// End to end, in the real window: the keys the user can change. In Settings, Keyboard, an action is given another key by
// pressing it (real key events through the host); a chord the system keeps (Ctrl+Backspace) is refused; a chord that another
// action has is named and may be taken over; the choices are kept in the settings (the window is closed and opened again) and
// "Back to the default keys" undoes them. F1 opens the help of the keys with every key in it (the fixed ones of the Parameters
// screen too), also from a text field, and the command is in the palette.
import { type E2eApp, launchApp } from './launch'
import { afterAll, describe, expect, it } from 'vitest'
import { showScreen } from './click'
import { CTRL, openPalette } from './palette-keys'

let app: E2eApp | undefined

/** The keys the spec presses: the virtual key code and the `code` of the event. */
const KEYS: Record<string, [number, string]> = {
  F1: [112, 'F1'],
  k: [75, 'KeyK'],
  Backspace: [8, 'Backspace'],
  Escape: [27, 'Escape'],
}

/**
 * The window the tests are in.
 *
 * @returns the window
 */
const win = () => app as E2eApp

/**
 * Presses a key, with the modifiers, as the host receives it.
 *
 * @param key a key of KEYS
 * @param modifiers the DevTools modifier bits
 */
async function press(key: string, modifiers = 0): Promise<void> {
  const [code, name] = KEYS[key] as [number, string]
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: name, modifiers }
  await win().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await win().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/**
 * A selector for an element whose id holds a dot.
 *
 * @param id the id
 * @returns the selector
 */
const byId = (id: string) => `[id="${id}"]`

/**
 * A page expression: the key an action's row of Settings shows.
 *
 * @param actionId the action
 * @returns the expression
 */
const keyText = (actionId: string) => {
  const row = `document.getElementById('keys-change-${actionId}')?.closest('.keys-row')`

  return `${row}?.querySelector('kbd')?.textContent`
}

/**
 * Waits until an action's row shows a key.
 *
 * @param actionId the action
 * @param text the key as written ("Ctrl K", "No key")
 * @returns once it does
 */
const shows = (actionId: string, text: string) => win().waitFor(`${keyText(actionId)} === ${JSON.stringify(text)}`)

/**
 * Opens the window on the Settings screen, once the page is ready.
 *
 * @returns the window
 */
async function openSettings(): Promise<E2eApp> {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('.settings-keys') !== null`)

  return app
}

/**
 * Presses Change on an action and then a key.
 *
 * @param actionId the action
 * @param key a key of KEYS
 */
async function change(actionId: string, key: string): Promise<void> {
  await win().click(byId(`keys-change-${actionId}`))
  await win().waitFor(`document.getElementById('keys-press-${actionId}') !== null`)
  await press(key, CTRL)
}

/**
 * Waits for the page to have an element (or not).
 *
 * @param selector the element
 * @param there whether it must be there
 * @returns once it is so
 */
const waitFor = (selector: string, there = true) => {
  const element = `document.querySelector(${JSON.stringify(selector)})`

  return win().waitFor(`(${element} !== null) === ${there}`)
}

afterAll(async () => {
  await app?.close()
})

describe('changing a key', () => {
  it('gives the palette another key by pressing it, and shows it', async () => {
    await openSettings()
    await shows('palette.open', 'Ctrl P')

    await change('palette.open', 'k')

    await shows('palette.open', 'Ctrl K')
    await waitFor(byId('keys-press-palette.open'), false)
  })

  it('opens the palette on the new key', async () => {
    await press('k', CTRL)
    await waitFor('#palette-input')
    await press('Escape')
    await waitFor('#palette-input', false)
  })

  it('refuses a chord that Ctrl does to text (Ctrl+Backspace), says why, and changes nothing', async () => {
    await change('help.keys', 'Backspace')

    await waitFor(byId('keys-refused-help.keys'))
    expect(await win().text(byId('keys-refused-help.keys'))).toMatch(/system or the browser/u)
    await shows('help.keys', 'F1')
  })
})

describe('taking a chord over', () => {
  it('names the action that has the chord, and changes nothing until asked', async () => {
    await change('help.keys', 'k')

    await waitFor(byId('keys-clash-help.keys'))
    expect(await win().text(byId('keys-clash-help.keys'))).toMatch(/Open the command palette/u)
    await shows('help.keys', 'F1')
  })

  it('gives the chord to the one that asked, and takes it from the other', async () => {
    await win().click(byId('keys-take-help.keys'))

    await shows('help.keys', 'Ctrl K')
    await shows('palette.open', 'No key')
  })
})

describe('the keys, kept', () => {
  it('are kept: the window is closed and opened again, and the choices are there', async () => {
    expect(await win().close()).toBe(0)
    await openSettings()

    await shows('help.keys', 'Ctrl K')
    await shows('palette.open', 'No key')
  })

  it("open the help of the keys on the key chosen for it, with every key in it, the Parameters screen's too", async () => {
    await press('k', CTRL)
    await waitFor('.keys-list')

    const lists = `[...document.querySelectorAll('.keys-list')].map(list => list.textContent)`
    const text = await win().evaluate<string>(`${lists}.join(' ')`)
    expect(text).toContain('Show the keyboard shortcuts')
    expect(text).toContain('Next pane')
    expect(text).toContain('Ctrl /')
    expect(text).toContain('Ctrl Enter')
    expect(text).not.toContain('Open the command palette')
    await press('Escape')
    await waitFor('.keys-list', false)
  })

  it('are put back to the defaults by "Back to the default keys"', async () => {
    await win().click('#keys-reset-all')

    await shows('palette.open', 'Ctrl P')
    await shows('help.keys', 'F1')
    await win().waitFor(`document.getElementById('keys-reset-all').disabled`)
  })
})

describe('a key of the Parameters screen', () => {
  it('goes to the search on the key chosen for it in Settings', async () => {
    await change('params.search', 'k')
    await shows('params.search', 'Ctrl K')
    await showScreen(win(), 'parameters')

    await press('k', CTRL)

    await win().waitFor(`document.activeElement?.id === 'filter'`)
  })

  it('is back on Ctrl+/ after "Back to the default keys"', async () => {
    await showScreen(win(), 'settings')
    await win().click('#keys-reset-all')
    await shows('params.search', 'Ctrl /')
  })
})

describe('the help of the keys', () => {
  it('opens on F1 from a text field too (a function key types nothing), and closes on F1 again', async () => {
    await showScreen(win(), 'parameters')
    await waitFor('#filter')
    await win().evaluate(`document.querySelector('#filter').focus()`)

    await press('F1')
    await waitFor('.keys-list')
    await press('F1')
    await waitFor('.keys-list', false)
  })

  it('does not open over the palette', async () => {
    await openPalette(win())

    await press('F1')
    await waitFor('.keys-list', false)
    await press('Escape')
    await waitFor('#palette-input', false)
  })
})

describe('the help command', () => {
  it('is in the palette, with its key', async () => {
    await openPalette(win())

    expect(await win().text('[data-command="help.keys"]')).toContain('F1')
    await press('Escape')
  })

  it('closes cleanly', async () => {
    expect(await win().close()).toBe(0)
  })
})
