// End to end, in the real window: the language of the interface. Picking one in Settings changes the text at once (the rail, the
// screens), sets the page's `lang`, is kept across a reopened window, and no text of the longer language is clipped silently
// (a label that does not fit has an ellipsis and a title, so that scrollWidth over clientWidth is not left unsaid).
import { type E2eApp, launchApp } from './launch'
import { afterAll, describe, expect, it } from 'vitest'
import { cancelConfirm, clickConnect, showScreen } from './click'

/** The window that is open (a test closes it and opens another to see what the settings kept). */
const shown: { app: E2eApp | null } = { app: null }

/**
 * The open window.
 *
 * @returns it
 * @throws {Error} when none is open
 */
function win(): E2eApp {
  if (shown.app === null) {
    throw new Error('no window is open')
  }

  return shown.app
}

afterAll(async () => {
  await shown.app?.close()
})

// What the rail says, in order.
const rail = () => win().evaluate<string[]>(`[...document.querySelectorAll('nav a')].map(a => a.textContent.trim())`)

// The text that does not fit in its box and has no title to say it in full: the element and its text.
const BOXES = 'button, a, label, h2, th, .cell, .param-group, .segment, .kit-badge, select, p, .name'
const CLIPPED = `[...document.querySelectorAll('${BOXES}')]
  .filter(el => el.getClientRects().length > 0 && !el.closest('.visually-hidden'))
  .filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
  .filter(el => !el.title && !el.getAttribute('aria-label'))
  .map(el => el.tagName + '.' + el.className + ': ' + el.textContent.trim().slice(0, 40))`

/**
 * Shows a screen and says which of its texts are cut off.
 *
 * @param screen the screen
 * @returns the elements whose text is cut off, with no title
 */
async function clippedOn(screen: string): Promise<string[]> {
  await showScreen(win(), screen)

  return win().evaluate<string[]>(CLIPPED)
}

/**
 * Picks a language in the Settings screen.
 *
 * @param code the language
 */
async function pick(code: string): Promise<void> {
  await showScreen(win(), 'settings')
  await win().waitFor(`document.querySelector('main select[id$="-language"]') !== null`)
  await win().fill('main select[id$="-language"]', code)
}

describe('the language of the interface', () => {
  it('is English at first, with the languages named in themselves in Settings', async () => {
    shown.app = await launchApp()
    await win().waitForText('#connection', 'disconnected')
    await showScreen(win(), 'settings')

    expect(await win().evaluate<string>('document.documentElement.lang')).toBe('en')
    // The language select only: Settings has more selects now (the preferences about logs).
    const options = `[...document.querySelectorAll('main select[id$="-language"] option')].map(o => o.textContent.trim())`
    expect(await win().evaluate<string[]>(options))
      .toEqual(['English', 'Deutsch', 'Polski', 'Italiano', 'Español', 'Українська', 'Русский'])
  })

  it('changes the text at once when another is picked (the rail names), and the page\'s lang', async () => {
    await pick('de')

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Flugdaten'`)
    expect(await rail()).toEqual(expect.arrayContaining(['Flugdaten', 'Parameter', 'Einstellungen']))
    expect(await win().evaluate<string>('document.documentElement.lang')).toBe('de')
    expect(await win().text('main h2')).toBe('Einstellungen')
  })
})

describe('the longer text of the language', () => {
  it('is on screens that are full: connected to the simulator, with the parameters downloaded', async () => {
    await clickConnect(win())
    await win().waitForText('#connection', /verbunden/u, 60_000)
    await showScreen(win(), 'parameters')
    await win().waitForText('#list-status', /12 Parameter/u, 60_000)
  })

  it('asks the question of a write, and says what is wrong with a value, in the language (words made in code)', async () => {
    await showScreen(win(), 'parameters')
    await win().click('tr[data-id="SERIAL0_BAUD"]')
    await win().waitFor(`document.querySelector('#draft')?.value === '115'`)
    await win().fill('#draft', 'abc')
    await win().waitForText('#draft-error', 'bitte eine Zahl')
    await win().fill('#draft', '57')
    await win().waitFor(`document.querySelector('#staged .staged-row[data-id="SERIAL0_BAUD"]') !== null`)
    await win().click('#write-staged')

    expect(await win().waitForText('#question', /^1 Parameter ans Fahrzeug schreiben\?/u)).toContain('SERIAL0_BAUD 115 → 57')
    await cancelConfirm(win())
  })

  it.each([[1440], [1000]])('has no text cut off without a title at %i px, on Fly, Parameters and Settings', async width => {
    await win().devtools('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await win().evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')

    expect(await clippedOn('flight')).toEqual([])
    expect(await clippedOn('parameters')).toEqual([])
    expect(await clippedOn('settings')).toEqual([])
    await win().devtools('Emulation.clearDeviceMetricsOverride', {})
  })
})

describe('Polish, Italian, Spanish, Ukrainian and Russian: Latin Extended and Cyrillic letters', () => {
  it('shows the rail in Polish, and loads the Latin Extended face for ą ć ę ł ń ś ź ż once they are shown', async () => {
    await pick('pl')

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Dane lotu'`)
    expect(await rail()).toEqual(expect.arrayContaining(['Dane lotu', 'Parametry', 'Ustawienia']))
    // "Łącze" in the top bar and "Zażółć" in the language help are Latin Extended: the face is fetched for them.
    await win().waitFor(`[...document.fonts].some(face => face.status === 'loaded' && /U\\+0*100\\b/u.test(face.unicodeRange))`)
    expect(await win().evaluate<string>('document.documentElement.lang')).toBe('pl')
  })
})

describe('Russian, Ukrainian and the rest: Cyrillic letters, and no clipped text', () => {
  it('shows the rail in Russian, and loads the Cyrillic face once Cyrillic is shown', async () => {
    await pick('ru')

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Полёт'`)
    expect(await rail()).toEqual(expect.arrayContaining(['Полёт', 'Параметры', 'Настройки']))
    // U+0400-045F is the Cyrillic range of the face: it is fetched for the letters on the page, and not before.
    await win().waitFor(`[...document.fonts].some(face => face.status === 'loaded' && /U\\+0*400\\b/u.test(face.unicodeRange))`)
    expect(await win().evaluate<string>('document.documentElement.lang')).toBe('ru')
  })

  const RAILS = [
    ['pl', 'Dane lotu'], ['it', 'Dati di volo'], ['es', 'Datos de vuelo'], ['uk', 'Політ'], ['ru', 'Полёт'],
  ]

  it.each(RAILS)('shows the rail in %s, with no text cut off at 1000 px', async (code, flight) => {
    await pick(code)

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === '${flight}'`)
    expect(await win().evaluate<string>('document.documentElement.lang')).toBe(code)
    await win().devtools('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false })
    await win().evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    expect(await clippedOn('parameters')).toEqual([])
    expect(await clippedOn('settings')).toEqual([])
    await win().devtools('Emulation.clearDeviceMetricsOverride', {})
  })
})

describe('the language that was picked', () => {
  it('is German again, to see what is kept', async () => {
    await pick('de')

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Flugdaten'`)
  })

  it('is kept: a window that is opened again is in it', async () => {
    await win().close()
    shown.app = await launchApp()

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]')?.textContent.trim() === 'Flugdaten'`)
    expect(await win().evaluate<string>('document.documentElement.lang')).toBe('de')
  })

  it('goes back to English when English is picked', async () => {
    await pick('en')

    await win().waitFor(`document.querySelector('nav a[href="#/flight"]').textContent.trim() === 'Flight data'`)
    expect(await win().evaluate<string>('document.documentElement.lang')).toBe('en')
  })
})
