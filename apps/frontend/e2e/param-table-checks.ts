// The checks of the parameter table (#36) against ArduPilot SITL (Copter), with metadata loaded: the search by the everyday words
// (in any order, a typo a close match) over the real list of some 1,400 parameters, a search that finds what the chosen group and
// the Standard view hide, "Modified from default" from the defaults the vehicle's parameter file gives, the grouping by
// ArduPilot's own groups, and the speed budget of a keystroke at the real list's size. Shared by sitl-params.e2e.ts (a local
// stand-in for ArduPilot's server, every pull request) and weekly-params-metadata.e2e.ts (the real server, weekly).
//
// Names differ between firmware versions (RTL_ALT is RTL_ALT_M from 4.7), so none that changed is assumed: either is taken. The
// checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { expect, it } from 'vitest'
import { expectWithinBudget } from './budgets'
import { showFilters } from './click'
import type { E2eApp } from './launch'
import { typeQueries } from './param-typing'

let app: () => E2eApp = () => {
  throw new Error('no app')
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
  await app().fill('#filter', text)
  await app().evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)

  return app().evaluate<string[]>(ROWS)
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
  const line = await app().text('#list-status')
  const patterns = [/^(?<shown>\d+) of (?<total>\d+) parameters/u, /^(?<total>\d+) parameters/u]

  return patterns.map(pattern => numbersOf(pattern.exec(line)?.groups)).find(found => found !== null) ?? { shown: 0, total: 0 }
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
  expect(await app().text(`tr[data-id="${found}"] .why`)).toMatch(/close match/iu)
}

/**
 * Chooses the view, when the metadata offers the choice.
 *
 * @param view `standard` or `full`
 */
async function chooseView(view: string): Promise<void> {
  await showFilters(app())

  if (await app().evaluate<boolean>(`document.querySelector('#param-view') !== null`)) {
    await app().click(`#param-view input[value="${view}"]`)
  }
}

/** A search finds the same in the Standard view and another group as in the Full view and All. */
async function searchesEverywhere(): Promise<void> {
  const everywhere = await search('atc rat rll')
  expect(everywhere.length).toBeGreaterThan(0)
  await app().fill('#filter', '')
  await chooseView('standard')
  await app().click('button[data-group="BATT"]')

  expect(await search('atc rat rll')).toEqual(everywhere)
  await app().fill('#filter', '')
  await chooseView('full')
  await app().click('button[data-group=""]')
}

/** "Modified from default" lists some of the parameters, from the defaults the vehicle's parameter file gives. */
async function listsTheModified(): Promise<void> {
  await showFilters(app())
  await app().waitFor(`document.getElementById('modified-only')?.disabled === false`)
  const { total } = await counts()

  await app().click('#modified-only')
  await app().waitForText('#list-status', / of \d+ parameters/u)
  const modified = await counts()

  expect(modified.shown).toBeGreaterThan(0)
  expect(modified.shown).toBeLessThan(total)
  await showFilters(app())
  await app().click('#modified-only')
  await app().waitForText('#list-status', /^\d+ parameters/u)
}

/** The grouping by ArduPilot's groups has the vehicle's own parameters in one group. */
async function groupsByMetadata(): Promise<void> {
  await app().click('#param-group-by input[value="metadata"]')
  // The vehicle's own group is "Copter" in the latest definitions (JSON) and "ArduCopter" in a released version's (XML).
  const vehicle = 'button[data-group="Copter"], button[data-group="ArduCopter"]'
  await app().waitFor(`document.querySelector('${vehicle}') !== null`)
  await app().click(vehicle)
  await app().waitForText('#list-status', / of \d+ parameters/u)
  const { shown, total } = await counts()

  expect(shown).toBeGreaterThan(20)
  expect(shown).toBeLessThan(total / 4)
  expect((await search('fs_thr_enable'))[0]).toBe('FS_THR_ENABLE')
  await app().fill('#filter', '')
  await app().click('#param-group-by input[value="name"]')
}

/** Each keystroke is answered within the budget, at the real list's size, typos included. */
async function answersInTime(): Promise<void> {
  const queries = ['return height', 'radio lost', 'retun hieght', 'batery capacty', 'compass orientation', 'atc_rat_rll_p']
  const { times } = await typeQueries(app(), queries)
  const { total } = await counts()

  console.info(`param filter keystroke at ${total} parameters (ms):`, JSON.stringify(times.map(Math.round)))
  expect(total).toBeGreaterThan(1000)
  expectWithinBudget('paramFilterKeystroke', times)
}

/**
 * Defines the checks, on the app a spec has connected to SITL with the metadata loaded, on the Parameters screen.
 *
 * @param window the app
 */
export function paramTableTests(window: () => E2eApp): void {
  app = window
  it('finds the return height and the radio failsafe by everyday words, in any order', findsByEverydayWords)
  it('marks a one-letter typo as a close match', marksATypo)
  it('searches every parameter, whatever the chosen group and the Standard view', searchesEverywhere)
  it('lists the parameters modified from the firmware\'s default, from the defaults the vehicle gives', listsTheModified)
  it('groups by ArduPilot\'s own groups, the vehicle\'s parameters in one', groupsByMetadata)
  it('answers each keystroke within the budget at the real list\'s size, typos included', answersInTime)
}
