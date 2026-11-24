// The link's quality (#29) against ArduPilot SITL behind a lossy proxy (flaky-proxy.ts): the backend counts what is lost from the
// MAVLink sequence numbers and times the TIMESYNC that ArduPilot answers.
//  1. No loss: the LINK cell of the top bar says 100 % and good, its details give the round trip of the ping, and the LINK card
//     of the Fly screen says the same.
//  2. The proxy drops 10 % of the vehicle's frames: the link is weak, with an icon and the word, in the cell and the card.
//  3. It drops 35 %: the link is poor.
//  4. No loss again: good, once the window has only lossless seconds.
// In 2 and 3 the loss the app shows is the share the proxy dropped, to within what chance allows over the window (the drops
// are random: a binomial count).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { FlakyProxy } from './flaky-proxy'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The backend's window (5 s) and a second of stats after it: what is shown is then all of one kind of link. */
const WINDOW_MS = 6000
/** How long a change of the link may take to show: the window, and some. */
const SHOWS_MS = 20_000
/** The LINK cell. */
const CELL = '#link-quality'
/** Its button. */
const TRIGGER = `${CELL} .trigger`
/** The LINK card of the Fly screen. */
const CARD = `[...document.querySelectorAll('#telemetry > *')]
  .find(card => card.querySelector('.label')?.textContent === 'LINK')`

let sitl: Sitl | undefined
let proxy: FlakyProxy | undefined
let app: E2eApp | undefined

/**
 * Something that has started.
 *
 * @param value it, or undefined before it has
 * @param name what it is
 * @returns it
 * @throws {Error} before it has started
 */
function started<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`${name} has not started`)
  }

  return value
}

const window = () => started(app, 'the app')
const cable = () => started(proxy, 'the proxy')

/**
 * Waits a while.
 *
 * @param ms how long
 */
const pause = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad' })
  proxy = await FlakyProxy.start(sitl.endpoint)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(proxy.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
}

async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    try {
      await proxy?.stop()
    } finally {
      await sitl?.stop()
    }
  }
}

/**
 * Waits until the LINK cell is at a level.
 *
 * @param level `ok`, `warn` or `error`
 */
async function cellIs(level: string): Promise<void> {
  await window().waitFor(`document.querySelector('${CELL}')?.classList.contains('${level}') === true`, SHOWS_MS)
}

/**
 * Opens the details of the LINK cell, if they are not open.
 */
async function openDetails(): Promise<void> {
  const open = `document.querySelector('${CELL} [role="dialog"]') !== null`
  if (!await window().evaluate<boolean>(open)) {
    await window().evaluate(`document.querySelector('${TRIGGER}').click()`)
    await window().waitFor(open)
  }
}

/**
 * The loss the details give: packets lost of those sent in the window.
 *
 * @returns the counts, and the quality the cell shows (percent)
 */
async function shownLoss(): Promise<{ lost: number, sent: number, quality: number }> {
  await openDetails()
  // both from the same stats: read at once
  const [text, value] = await window().evaluate<[string, string]>(
    `['${CELL} .link-detail.loss dd', '${CELL} .link-value'].map(selector => document.querySelector(selector).textContent)`,
  )
  const counts = /\((?<lost>[\d,]+) of (?<sent>[\d,]+) packets\)/u.exec(text)?.groups
  const number = (part: string | undefined) => Number((part ?? '').replaceAll(',', ''))

  return { lost: number(counts?.lost), sent: number(counts?.sent), quality: Number.parseInt(value, 10) }
}

/**
 * Checks that the loss shown is the share the proxy drops: the count lost of those sent in the window is binomial, so it is
 * within four standard deviations of the share (a chance of about 1 in 15,000 of being further). The share is what the proxy
 * really dropped (it never drops a heartbeat, so a little less than it was asked for).
 */
async function showsWhatTheProxyDropped(): Promise<void> {
  const { passed, dropped } = cable().lossCount
  const share = dropped / (passed + dropped)
  const { lost, sent, quality } = await shownLoss()
  const sigma = Math.sqrt(sent * share * (1 - share))
  console.info('link loss:', JSON.stringify({ share, lost, sent, expected: sent * share, sigma, quality }))

  // a window of a few hundred packets: ArduPilot sends the app tens a second
  expect(sent).toBeGreaterThan(100)
  expect(Math.abs(lost - sent * share), `${lost} of ${sent} lost, ${share} dropped`).toBeLessThanOrEqual(4 * sigma)
  expect(quality).toBe(Math.round(100 - lost * 100 / sent))
}

/**
 * Checks the level the cell and the card say, with the icon and the word.
 *
 * @param word the word (`weak`, `poor`)
 */
async function saysInWords(word: string): Promise<void> {
  expect(await window().evaluate<boolean>(`document.querySelector('${TRIGGER} .icon') !== null`)).toBe(true)
  expect(await window().text(`${TRIGGER} .link-level`)).toMatch(new RegExp(`^${word}$`, 'iu'))
  expect(await window().evaluate<boolean>(`${CARD}.querySelector('.status .icon') !== null`)).toBe(true)
  const status = await window().evaluate<string>(`${CARD}.querySelector('.status').textContent`)

  expect(status).toMatch(new RegExp(`^\\s*${word}\\s*$`, 'iu'))
}

async function showsAGoodLink(): Promise<void> {
  await window().waitFor(`document.querySelector('${CELL} .link-value')?.textContent === '100%'`, SHOWS_MS)
  await cellIs('ok')

  expect(await window().evaluate<boolean>(`document.querySelector('${TRIGGER} .icon') === null`)).toBe(true)
  // ArduPilot answers the TIMESYNC: the round trip is in the details and on the card
  await openDetails()
  const latency = `document.querySelector('${CELL} .link-detail.latency dd')?.textContent ?? ''`
  await window().waitFor(`/^\\d+\\s?ms$/u.test(${latency})`, SHOWS_MS)
  expect(await window().text(`${CELL} .link-detail.loss dd`)).toMatch(/^0\.0%/u)
  // (the card needs the telemetry too, which can come after the link's first stats)
  await window().waitFor(`/100%\\s*\\d+\\s?ms · 0\\.0% lost/u.test(${CARD}.textContent)`, SHOWS_MS)
  expect(await window().evaluate<boolean>(`${CARD}.querySelector('.status') === null`)).toBe(true)
}

async function showsAWeakLink(): Promise<void> {
  cable().lose(0.1)
  await cellIs('warn')
  await pause(WINDOW_MS)

  await cellIs('warn')
  await showsWhatTheProxyDropped()
  await saysInWords('weak')
}

async function showsAPoorLink(): Promise<void> {
  cable().lose(0.35)
  await cellIs('error')
  await pause(WINDOW_MS)

  await cellIs('error')
  await showsWhatTheProxyDropped()
  await saysInWords('poor')
}

async function recovers(): Promise<void> {
  cable().lose(0)
  await window().waitFor(`document.querySelector('${CELL} .link-value')?.textContent === '100%'`, SHOWS_MS)
  await cellIs('ok')

  expect(await window().evaluate<boolean>(`${CARD}.querySelector('.status') === null`)).toBe(true)
}

describeSitl(
  'the link\'s quality against ArduPilot SITL behind a lossy link',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)
    it('shows a lossless link as 100 % and good, with the round trip of the ping', showsAGoodLink, 60_000)
    it('shows a link that loses a tenth of the frames as weak, with the loss it has', showsAWeakLink, 60_000)
    it('shows a link that loses a third of the frames as poor, with the loss it has', showsAPoorLink, 60_000)
    it('shows the link as good again once nothing is lost', recovers, 60_000)
  },
  { launchOnly: true },
)
