// End to end, in the real window with the real backend, no vehicle and no tile server (the tiles are switched off before the app
// starts: nothing is ever asked of a real server): "Replay" in Logs over two DataFlash logs written by the test (see
// dataflash.ts). One has a position (a lap of 150 m, 60 s long, with a gap of ten seconds in its fixes), home, the vehicle
// armed and disarmed, a change of flight mode and a warning; the other has none. The page draws the path ahead dashed, the
// vehicle at the first fix and home, moves the vehicle with the scrubber, holds it in the gap as old, jumps to an event, says
// why a log with no position cannot be shown, and nothing scrolls but the aside. Not covered: a log written by ArduPilot (the
// SITL flight is sitl-logs.e2e.ts, which flies vertically: its track is a point), tiles of a real source, and a recording
// (backend/localtrack.test.pi).
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { showScreen } from './click'
import { TRACK, copyName, flightLog, trackLog } from './dataflash'
import { type E2eApp, home, launchApp } from './launch'

const APP = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')
const FOLDER = join(APP, 'logs', 'uid-e2e')

let app: E2eApp

/**
 * Puts a log in the library.
 *
 * @param id the number of the log
 * @param bytes the log
 */
function putLog(id: number, bytes: Buffer): void {
  const path = join(FOLDER, copyName(id, bytes))
  writeFileSync(path, bytes)
  const when = new Date(Date.UTC(2026, 0, id))
  utimesSync(path, when, when)
}

/** The settings of a user who turned the tiles off, before the app starts. */
function turnTilesOff(): void {
  const document = { version: 1, ui: [{ key: 'map.enabled', value: 'false' }] }
  writeFileSync(join(APP, 'settings.json'), `${JSON.stringify(document)}\n`)
}

beforeAll(async () => {
  mkdirSync(FOLDER, { recursive: true })
  putLog(1, trackLog())
  putLog(2, flightLog({ rate: false, step: false }))
  turnTilesOff()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'logs')
  await app.click('a[href="#/logs/replay"]')
  await app.waitFor(`document.querySelector('#replay-log') !== null`, 60_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

/**
 * Chooses a log in the menu of logs, and waits until the page has what it needs of it.
 *
 * @param id the number of the log
 */
async function choose(id: number): Promise<void> {
  await app.click('#replay-log button')
  await app.waitFor(`document.querySelectorAll('#replay-log [role="menuitem"]').length >= 2`, 30_000)
  const items = `[...document.querySelectorAll('#replay-log [role="menuitem"]')]`
  await app.evaluate(`${items}.find(i => i.innerText.startsWith('${id} ')).click()`)
  await app.waitFor(`document.querySelector('#replay-busy') === null && (document.querySelector('#replay-scrub') !== null
    || document.querySelector('#replay-none') !== null)`, 120_000)
}

/**
 * Moves the scrubber to a moment, as a person moving the range does.
 *
 * @param seconds the moment
 */
async function scrubTo(seconds: number): Promise<void> {
  await app.evaluate(`(() => {
    const range = document.querySelector('#replay-scrub')
    range.value = ${seconds}
    range.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
}

/**
 * The latitude of the vehicle marker.
 *
 * @returns degrees
 */
async function vehicleLat(): Promise<number> {
  return Number(await app.evaluate<string>(`document.querySelector('.map-vehicle')?.getAttribute('data-lat') ?? ''`))
}

it('says that no flight is chosen, and has the map', async () => {
  expect(await app.text('#replay-idle .title')).toBe('No flight chosen')
  expect(await app.evaluate<boolean>(`document.querySelector('.replay-map .map') !== null`)).toBe(true)
  expect(await app.evaluate<boolean>(`document.querySelector('.map-vehicle') === null`)).toBe(true)
})

it('draws the path ahead dashed, home, and the vehicle at the first fix', async () => {
  await choose(1)

  const [lat0, dashed, home0] = await Promise.all([
    vehicleLat(),
    app.evaluate<string>(`getComputedStyle(document.querySelector('.map-ahead')).strokeDasharray`),
    app.evaluate<boolean>(`document.querySelector('.map-home') !== null`),
  ])
  expect(lat0).toBeCloseTo(TRACK.lat + (TRACK.radius * Math.cos((1 / TRACK.seconds) * 2 * Math.PI)) / 111_195, 4)
  expect(dashed).not.toBe('none')
  expect(home0).toBe(true)
  // Nothing has been flown yet: no solid path.
  expect(await app.evaluate<boolean>(`document.querySelector('.map-trail') === null`)).toBe(true)
  // (the clock counts from the first message of the log, half a second before the first fix; the log is 59.5 s long)
  expect(await app.text('#replay-clock')).toBe('0:00 of 0:59')
})

it('moves the vehicle with the scrubber and draws the path flown', async () => {
  const before = await vehicleLat()
  await scrubTo(15)
  await app.waitFor(`document.querySelector('.map-trail') !== null`)

  expect(await vehicleLat()).not.toBeCloseTo(before, 4)
  expect(await app.text('#replay-clock')).toBe('0:15 of 0:59')
  expect(await app.text('#replay-tile-mode dd')).toBe('Stabilize')
})

it('holds the vehicle in the gap of the fixes as one that is old, with the speed not known there', async () => {
  await scrubTo(30)
  await app.waitFor(`document.querySelector('.map-vehicle.stale') !== null`)

  expect(await app.text('#replay-tile-speed dd')).toBe('–')
  expect(await app.evaluate<string>(`document.querySelector('.map-vehicle .map-stale-label').textContent`)).toContain('s ago')
})

it('jumps to an event of the flight, the vehicle\'s own words as text', async () => {
  const all = `[...document.querySelectorAll('.replay-jump')]`
  const jumps = await app.evaluate<string[]>(`${all}.map(b => b.innerText.replace(/\\s+/g, ' '))`)

  expect(jumps.some(text => text.includes('Failsafe: radio'))).toBe(true)
  expect(jumps.some(text => text.includes('Armed'))).toBe(true)
  await app.evaluate(`${all}.find(b => b.innerText.includes('Failsafe')).click()`)
  await app.waitFor(`document.querySelector('#replay-clock').innerText === '0:39 of 0:59'`)
})

it('plays: the clock runs on its own and the vehicle moves, and it stops when paused', async () => {
  await scrubTo(2)
  await app.click('.replay-speed[data-speed="8"]')
  const before = await vehicleLat()
  await app.click('#replay-play')
  await app.waitFor(`document.querySelector('#replay-play').innerText === 'Pause'`)
  await app.waitFor(`!document.querySelector('#replay-clock').innerText.startsWith('0:02 ')`, 10_000)
  await app.click('#replay-play')

  expect(await vehicleLat()).not.toBeCloseTo(before, 5)
})

it('says why a log with no position cannot be shown, and draws nothing', async () => {
  await choose(2)

  expect(await app.text('#replay-none .title')).toBe('This flight cannot be shown on a map')
  expect(await app.text('#replay-none')).toContain('no position')
  const drawn = `document.querySelector('.map-vehicle') !== null || document.querySelector('.map-ahead') !== null`
  expect(await app.evaluate<boolean>(drawn)).toBe(false)
})

it('has no scrollbar on the page: only the aside scrolls', async () => {
  await choose(1)
  const fits = await app.evaluate<boolean>(`(() => {
    const page = document.documentElement
    const aside = document.querySelector('.replay-aside')
    return page.scrollHeight <= page.clientHeight + 1 && page.scrollWidth <= page.clientWidth + 1
      && ['auto', 'scroll'].includes(getComputedStyle(aside).overflowY)
  })()`)

  expect(fits).toBe(true)
})
