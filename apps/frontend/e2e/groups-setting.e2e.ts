// End to end, in the real window: the setting "Show parameter groups" of the Settings screen. Off, the Parameters screen has no
// group list and no stars, the list takes the width, the choice is still there in a window that is opened again, and the
// favourites that were starred come back when the groups are on again. (The app's data folder is the file's own, so the second
// window sees what the first one kept.)
import { type E2eApp, launchApp } from './launch'
import { afterAll, describe, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'

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

/**
 * Opens a window, connects to the simulated vehicle, and shows the Parameters screen.
 *
 * @returns the window
 */
async function open(): Promise<E2eApp> {
  const opened = await launchApp()
  await opened.waitForText('#connection', 'disconnected')
  await clickConnect(opened)
  await opened.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(opened, 'parameters')
  await opened.waitForText('#list-status', '12 parameters', 60_000)

  return opened
}

afterAll(async () => {
  await shown.app?.close()
})

const groupsShown = () => win().evaluate<boolean>(`document.querySelector('.param-groups') !== null`)
const starsShown = () => win().evaluate<number>(`document.querySelectorAll('#rows td.star button').length`)
const fits = () => win().evaluate<boolean>(`(() => {
  const box = document.querySelector('.param-scroll')

  return box.scrollWidth <= box.clientWidth && document.querySelectorAll('#rows tr').length === 12
})()`)
const checked = (on: boolean) => `document.querySelector('#show-groups').getAttribute('aria-checked') === '${on}'`

/**
 * Switches the setting on the Settings screen, and goes back to the Parameters.
 *
 * @param on the state the switch is to be in
 */
async function setGroups(on: boolean): Promise<void> {
  await showScreen(win(), 'settings')
  await win().waitFor(`document.querySelector('#show-groups') !== null`)

  if (!(await win().evaluate<boolean>(checked(on)))) {
    await win().click('#show-groups')
  }
  await win().waitFor(checked(on))
  await showScreen(win(), 'parameters')
}

describe('the setting before it is touched', () => {
  it('is off: there are no groups and no stars', async () => {
    shown.app = await open()

    expect(await groupsShown()).toBe(false)
    expect(await starsShown()).toBe(0)
  })
})

describe('the setting turned on', () => {
  it('has the groups and the stars, and keeps a star', async () => {
    await setGroups(true)
    expect(await groupsShown()).toBe(true)
    expect(await starsShown()).toBe(12)

    await win().click('tr[data-id="RTL_ALT"] td.star button')
    await win().waitFor(`document.querySelector('tr[data-id="RTL_ALT"] td.star button').getAttribute('aria-pressed') === 'true'`)
  })
})

describe('the setting turned off', () => {
  it('takes the group list and the stars away, and leaves the list as wide as the screen allows', async () => {
    await setGroups(false)

    expect(await groupsShown()).toBe(false)
    expect(await starsShown()).toBe(0)
    expect(await fits()).toBe(true)
    expect(await win().evaluate<boolean>(`document.querySelector('#rows th.name') !== null`)).toBe(true)
  })

  it('is still off in a window that is opened again', async () => {
    await win().close()
    shown.app = await open()

    expect(await groupsShown()).toBe(false)
    expect(await starsShown()).toBe(0)
  })
})

describe('the setting turned on again', () => {
  it('brings back the groups and the stars, and the favourite that was starred', async () => {
    await setGroups(true)

    expect(await groupsShown()).toBe(true)
    expect(await starsShown()).toBe(12)
    const pressed = `document.querySelector('tr[data-id="RTL_ALT"] td.star button').getAttribute('aria-pressed')`

    expect(await win().evaluate<string>(pressed)).toBe('true')
    expect(await win().text('.param-group[data-group="*favourites"] .count')).toBe('1')
  })
})
