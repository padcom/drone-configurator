// The parameter table (#36) against ArduPilot SITL (Copter), in the real window with the real backend and the real metadata,
// downloaded from ArduPilot's server for the vehicle's version (#35): the search by the everyday words (in any order, a typo a
// close match) over the real list of some 1,400 parameters, a search that finds what the chosen group and the Standard view hide,
// "Modified from default" from the defaults the vehicle's parameter file gives, the grouping by ArduPilot's own groups, and the
// speed budget of a keystroke at the real list's size.
//
// Names differ between firmware versions (RTL_ALT is RTL_ALT_M from 4.7), so none that changed is assumed: either is taken. The
// checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { expectWithinBudget } from './budgets'
import { typeQueries } from './param-typing'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp, presetSettings } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long the connection, the download of the parameters and of the metadata (a few MB from ArduPilot's server) may take. */
const READY_MS = 180_000

let sitl: Sitl | undefined
let app: E2eApp | undefined

/**
 * The app under test.
 *
 * @returns the app
 * @throws {Error} before it has started
 */
function window(): E2eApp {
  if (!app) {
    throw new Error('the app has not started')
  }

  return app
}

/** The rows that are drawn, in order. */
const ROWS = `[...document.querySelectorAll('#rows tr[data-id]')].map(r => r.dataset.id)`

/**
 * Types a search and gives the rows it lists (those that are drawn: the first screenful, the best results).
 *
 * @param text what is typed
 * @returns the names
 */
async function search(text: string): Promise<string[]> {
  await window().fill('#filter', text)
  await window().evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)

  return window().evaluate<string[]>(ROWS)
}

/**
 * The numbers of the line under the list.
 *
 * @param groups what the pattern found
 * @returns the shown and the total, or null when it found nothing
 */
function numbersOf(groups: Record<string, string> | undefined): { shown: number, total: number } | null {
  return groups ? { shown: Number(groups.shown ?? groups.total), total: Number(groups.total) } : null
}

/**
 * How many parameters the list shows, and of how many, as the line under it says ("12 of 1370 parameters", "1370 parameters").
 *
 * @returns the shown and the total
 */
async function counts(): Promise<{ shown: number, total: number }> {
  const line = await window().text('#list-status')
  const patterns = [/^(?<shown>\d+) of (?<total>\d+) parameters/u, /^(?<total>\d+) parameters/u]

  return patterns.map(pattern => numbersOf(pattern.exec(line)?.groups)).find(found => found !== null) ?? { shown: 0, total: 0 }
}

/** Starts SITL and the app, connects, and waits for the parameters and their metadata. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  presetSettings([{ key: 'metadata.download', value: 'on' }, { key: 'params.groups', value: 'on' }])
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters/u, 90_000)
  await app.waitFor(`document.querySelector('.param-scroll table.described') !== null`, READY_MS)
}

/** Stops what was started: the SITL also when the app does not close. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * Whether a name is the return altitude of either firmware (RTL_ALT before 4.7, RTL_ALT_M from it).
 *
 * @param id the name
 * @returns true for either
 */
const isReturnAltitude = (id: string) => /^RTL_ALT(?:_M)?$/u.test(id)

/** "return height" finds the return altitude and "radio lost" the radio failsafe, in any order of the words. */
async function findsByEverydayWords(): Promise<void> {
  expect((await search('return height')).slice(0, 5).some(isReturnAltitude)).toBe(true)
  expect((await search('radio lost')).slice(0, 3)).toContain('FS_THR_ENABLE')
  expect((await search('lost radio')).slice(0, 3)).toContain('FS_THR_ENABLE')
  expect((await search('thr_fs')).slice(0, 5)).toContain('FS_THR_ENABLE')
}

/** A typo of one letter finds the return altitude, marked as a close match. */
async function marksATypo(): Promise<void> {
  const found = (await search('retun height')).find(isReturnAltitude)

  expect(found).toBeDefined()
  expect(await window().text(`tr[data-id="${found}"] .why`)).toMatch(/close match/iu)
}

/**
 * Chooses the view, when the metadata offers the choice.
 *
 * @param view `standard` or `full`
 */
async function chooseView(view: string): Promise<void> {
  if (await window().evaluate<boolean>(`document.querySelector('#param-view') !== null`)) {
    await window().click(`#param-view input[value="${view}"]`)
  }
}

/** A search finds the same in the Standard view and another group as in the Full view and All. */
async function searchesEverywhere(): Promise<void> {
  const everywhere = await search('atc rat rll')
  expect(everywhere.length).toBeGreaterThan(0)
  await window().fill('#filter', '')
  await chooseView('standard')
  await window().click('button[data-group="BATT"]')

  expect(await search('atc rat rll')).toEqual(everywhere)
  await window().fill('#filter', '')
  await chooseView('full')
  await window().click('button[data-group=""]')
}

/** "Modified from default" lists some of the parameters, from the defaults the vehicle's parameter file gives. */
async function listsTheModified(): Promise<void> {
  await window().waitFor(`document.getElementById('modified-only')?.disabled === false`)
  const { total } = await counts()

  await window().click('#modified-only')
  await window().waitForText('#list-status', / of \d+ parameters/u)
  const modified = await counts()

  expect(modified.shown).toBeGreaterThan(0)
  expect(modified.shown).toBeLessThan(total)
  await window().click('#modified-only')
  await window().waitForText('#list-status', /^\d+ parameters/u)
}

/** The grouping by ArduPilot's groups has the vehicle's own parameters in one group. */
async function groupsByMetadata(): Promise<void> {
  await window().click('#param-group-by input[value="metadata"]')
  // The vehicle's own group is "Copter" in the latest definitions (JSON) and "ArduCopter" in a released version's (XML).
  const vehicle = 'button[data-group="Copter"], button[data-group="ArduCopter"]'
  await window().waitFor(`document.querySelector('${vehicle}') !== null`)
  await window().click(vehicle)
  await window().waitForText('#list-status', / of \d+ parameters/u)
  const { shown, total } = await counts()

  expect(shown).toBeGreaterThan(20)
  expect(shown).toBeLessThan(total / 4)
  expect((await search('fs_thr_enable'))[0]).toBe('FS_THR_ENABLE')
  await window().fill('#filter', '')
  await window().click('#param-group-by input[value="name"]')
}

/** Each keystroke is answered within the budget, at the real list's size, typos included. */
async function answersInTime(): Promise<void> {
  const queries = ['return height', 'radio lost', 'retun hieght', 'batery capacty', 'compass orientation', 'atc_rat_rll_p']
  const { times } = await typeQueries(window(), queries)
  const { total } = await counts()

  console.info(`param filter keystroke at ${total} parameters (ms):`, JSON.stringify(times.map(Math.round)))
  expect(total).toBeGreaterThan(1000)
  expectWithinBudget('paramFilterKeystroke', times)
}

describeSitl('the parameter table against SITL, with the real metadata', () => {
  beforeAll(startAll, READY_MS + 120_000)
  afterAll(stopAll)

  it('finds the return height and the radio failsafe by everyday words, in any order', findsByEverydayWords)
  it('marks a one-letter typo as a close match', marksATypo)
  it('searches every parameter, whatever the chosen group and the Standard view', searchesEverywhere)
  it('lists the parameters modified from the firmware\'s default, from the defaults the vehicle gives', listsTheModified)
  it('groups by ArduPilot\'s own groups, the vehicle\'s parameters in one', groupsByMetadata)
  it('answers each keystroke within the budget at the real list\'s size, typos included', answersInTime)
}, { launchOnly: true })
