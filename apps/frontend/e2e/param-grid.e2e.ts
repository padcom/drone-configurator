// End to end, in the real window: the parameters grid. Without metadata it is the two columns it was; with metadata the name
// and the value are only as wide as their text and the description takes the rest of the row, on one line (cut short with an
// ellipsis, whole in its title), every row the same height. A table of 1400 rows is laid out quickly that way (the time is
// printed).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'

const LONG = 'The minimum altitude above home that the vehicle climbs to before it returns, and holds on the way back. '.repeat(3)
const METADATA = {
  format: 'drone-configurator/param-metadata',
  version: 1,
  params: {
    RTL_ALT: { description: LONG.trim() },
    BATT_CAPACITY: { description: 'Battery capacity' },
    LOIT_SPEED: { description: 'Loiter speed' },
  },
}

/** The width of the column of the stars (params.css). */
const STAR_PX = 44

let app: E2eApp
let files = ''

beforeAll(async () => {
  // Instead of the native file dialog, which a test cannot click (the backend's FileChooser).
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

/** Runs in the page: the widths of the columns of the grid, whether it overflows, and the heights of the rows. */
const MEASURE = `(() => {
  const table = document.querySelector('.param-scroll table')
  const width = selector => document.querySelector(selector)?.getBoundingClientRect().width ?? 0
  const rows = [...document.querySelectorAll('#rows tr:not(.spacer)')].map(row => Math.round(row.getBoundingClientRect().height))
  const cut = document.querySelector('tr[data-id="RTL_ALT"] .meaning')

  return {
    described: table.classList.contains('described'),
    name: Math.round(width('#rows tr th.name')),
    value: Math.round(width('#rows tr td.num')),
    meaning: Math.round(width('#rows tr td.meaning')),
    table: Math.round(table.getBoundingClientRect().width),
    scrollWidth: table.parentElement.scrollWidth,
    clientWidth: table.parentElement.clientWidth,
    heights: [...new Set(rows)],
    cut: cut && cut.scrollWidth > cut.clientWidth,
    title: cut && cut.title,
  }
})()`

/** Runs in the page: builds a table of 1400 rows like the grid's, forces its layout, and says how long that took (in ms). */
const LAYOUT_OF_1400_ROWS = `(() => {
  const cell = (tag, attributes, text) => '<' + tag + ' ' + attributes + '>' + text + '</' + tag + '>'
  const rows = Array.from({ length: 1400 }, (_, i) => '<tr>'
    + cell('th', 'scope="row" class="name"', '<span class="prefix">PARM_</span>NAME_' + i)
    + cell('td', 'class="num"', i * 7)
    + cell('td', 'class="meaning" title="x"', 'A description of this parameter, ' + i)
    + '</tr>').join('')
  const holder = document.createElement('div')
  holder.className = 'param-scroll'
  holder.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:400px;visibility:hidden'
  holder.innerHTML = '<table class="described"><tbody>' + rows + '</tbody></table>'
  const before = performance.now()
  document.body.append(holder)
  holder.querySelector('table').getBoundingClientRect()
  const took = performance.now() - before
  holder.remove()

  return took
})()`

interface Grid {
  described: boolean
  name: number
  value: number
  meaning: number
  table: number
  scrollWidth: number
  clientWidth: number
  heights: number[]
  cut: boolean | null
  title: string | null
}

describe('the parameters grid', () => {
  it('is two columns without metadata', async () => {
    const grid = await app.evaluate<Grid>(MEASURE)

    expect(grid.described).toBe(false)
    expect(grid.meaning).toBe(0)
    expect(grid.heights).toEqual([44])
  })

  it('has the name and the value as wide as their text, and the description the rest, with metadata', async () => {
    writeFileSync(join(files, 'open.json'), JSON.stringify(METADATA))
    await app.click('#metadata-button')
    await app.waitFor(`document.querySelector('.param-scroll table.described') !== null`)
    const grid = await app.evaluate<Grid>(MEASURE)

    // "SERIAL0_BAUD" and "PILOT_SPEED_UP" are the widest names: a column of their text and its padding, no more.
    expect(grid.name).toBeLessThan(220)
    expect(grid.value).toBeLessThan(120)
    // (The table has the star's column of 44 px before the name.)
    expect(grid.meaning).toBeGreaterThan(grid.table - STAR_PX - grid.name - grid.value - 4)
    // The description is the larger part of the table: the table is what is left of the window after the rail, the groups and the
    // detail column (about 660 px on the CI, 820 locally), the star is 44, the name about 140 and the value about 85 there.
    expect(grid.meaning).toBeGreaterThan(grid.table / 2)
    expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth)
    expect(grid.heights).toEqual([44])
  })
})

describe('the cells of the grid', () => {
  it('have every name and every value inside the column that was sized for it', async () => {
    // The columns are measured in characters of the face and the size of their cells: a text that does not fit has a
    // scrollWidth over the width of its cell.
    const spilling = await app.evaluate<string[]>(`[...document.querySelectorAll('#rows th.name, #rows td.num')]
      .filter(cell => cell.scrollWidth > cell.clientWidth).map(cell => cell.textContent)`)

    expect(spilling).toEqual([])
  })

  it('cuts a long description short on one line, and has all of it as its title', async () => {
    const grid = await app.evaluate<Grid>(MEASURE)

    expect(grid.cut).toBe(true)
    expect(grid.title).toBe(LONG.trim())
  })
})

describe('the cost of the layout', () => {
  it('lays 1400 rows out in a time that is printed, and is not slow', async () => {
    const ms = await app.evaluate<number>(LAYOUT_OF_1400_ROWS)
    console.info(`1400 rows laid out in ${Math.round(ms)} ms`)

    expect(ms).toBeLessThan(400)
  })

  it('closes cleanly', async () => {
    expect(await app.close()).toBe(0)
  })
})
