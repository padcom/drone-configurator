// The two ways of downloading the parameters against ArduPilot SITL (Copter, over TCP), in the real window (#38): the vehicle's
// parameter file (MAVLink FTP) and the parameter protocol (PARAM_REQUEST_LIST) give the same list, and the file is within its
// budget (`paramDownloadFtp`, under 2 s), with the protocol's time measured in the same run beside it. The downloads are asked
// for through the page's bridge (bridge-client.ts), as the app's own Download asks, with the way forced.
//
// "The same list": the same names, the same count, and each parameter with the same type and value, except the ones that
// change on their own while the vehicle runs. Those are found from the data, not named (names differ between firmware
// versions): a parameter whose value differs between two downloads BY THE SAME WAY, made one after the other around a download
// by the other way, is one that moves by itself.
//
// It launches its own SITL, so it ignores SITL_ENDPOINT. The checks go on from one another (one app, one connection).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { BridgeClient } from './bridge-client'
import { expectWithinBudget } from './budgets'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long a connection and its first download may take. */
const CONNECT_MS = 60_000
/** How many downloads of each way are timed. */
const ROUNDS = 5
/** A download by the protocol on SITL takes a few seconds; the time a test of all the rounds is given. */
const ROUNDS_MS = 240_000

/** A parameter as `params.list` gives it. */
interface Param {
  id: string
  type: string
  value: number
}

/** What `params.list` gives. */
interface List {
  params: Param[]
  count: number
  complete: boolean
  source?: 'ftp' | 'list'
}

/** One download: what it gave, and how long the call took (ms, from asking to the answer in the page). */
interface Download {
  list: List
  ms: number
}

let sitl: Sitl | undefined
let app: E2eApp | undefined
let backend: BridgeClient | undefined
/** The downloads made, by way. */
const made: Record<'ftp' | 'list', Download[]> = { ftp: [], list: [] }

/**
 * The client of the backend.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function client(): BridgeClient {
  if (!backend) {
    throw new Error('the app has not started')
  }

  return backend
}

/** Starts SITL and the app, connects, waits for the app's own download, and installs the client. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', CONNECT_MS)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters$/u, CONNECT_MS)
  backend = new BridgeClient(app)
  await backend.install()
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
 * Downloads the whole list by one way, and keeps it.
 *
 * @param method the way
 * @returns the download
 */
async function download(method: 'ftp' | 'list'): Promise<Download> {
  const started = performance.now()
  const answer = await client().call('params.list', { method }, 60_000)
  const ms = performance.now() - started
  expect(answer.error, JSON.stringify(answer.error)).toBeUndefined()
  const list = answer.result as List
  expect(`${list.source} ${list.complete}`).toBe(`${method} true`)
  made[method].push({ list, ms })

  return { list, ms }
}

/**
 * The parameters of a list by name.
 *
 * @param list the list
 * @returns each parameter by its name
 */
const byName = (list: List) => new Map(list.params.map(param => [param.id, param]))

/**
 * The names whose value is not the same in two lists of the same way.
 *
 * @param one a list
 * @param other a later one
 * @returns the names that moved
 */
function moved(one: List, other: List): string[] {
  const later = byName(other)

  return one.params.filter(param => later.get(param.id)?.value !== param.value).map(param => param.id)
}

/**
 * What tells two parameters apart, if anything: the type, or the value.
 *
 * @param mine a parameter of the file
 * @param theirs the same of the protocol
 * @returns the difference in words, or null when there is none
 */
function difference(mine: Param, theirs: Param | undefined): string | null {
  if (theirs === undefined) {
    return `${mine.id}: only in the file`
  }

  return mine.type === theirs.type && mine.value === theirs.value
    ? null
    : `${mine.id}: file ${mine.type} ${mine.value}, protocol ${theirs.type} ${theirs.value}`
}

/**
 * Downloads by the protocol and then by the file, `left` more times.
 *
 * @param left how many rounds are left
 */
async function rounds(left: number): Promise<void> {
  if (left === 0) {
    return
  }
  await download('list')
  await download('ftp')
  await rounds(left - 1)
}

/** Downloads by each way in turn, ROUNDS times, starting and ending with the file. */
async function downloadsByBothWays(): Promise<void> {
  await download('ftp')
  await rounds(ROUNDS)

  expect(made.ftp.length).toBe(ROUNDS + 1)
}

/**
 * The last two downloads of a way (the vehicle has settled by then: it sets some of its parameters while it starts).
 *
 * @param method the way
 * @returns the two lists, in the order they came
 * @throws {Error} when there are not two
 */
function lastTwo(method: 'ftp' | 'list'): [List, List] {
  const [one, other] = made[method].slice(-2)
  if (!one || !other) {
    throw new Error(`fewer than two downloads by ${method}`)
  }

  return [one.list, other.list]
}

/**
 * Compares the file's list with the protocol's that came after it, leaving out what moves by itself.
 *
 * @param file the file's list
 * @param protocol the protocol's
 * @param moving the names that move by themselves
 */
function expectTheSame(file: List, protocol: List, moving: Set<string>): void {
  const theirs = byName(protocol)
  expect(file.count).toBe(protocol.count)
  expect(file.params.map(param => param.id).sort()).toEqual(protocol.params.map(param => param.id).sort())
  const differences = file.params.filter(param => !moving.has(param.id)).map(param => difference(param, theirs.get(param.id)))
  expect(differences.filter(line => line !== null)).toEqual([])
}

/** The file's list and the protocol's are the same. */
function sameListBothWays(): void {
  // In time: ... protocol, FILE, PROTOCOL, file: the two in capitals are compared, the others tell what moved meanwhile.
  const [file, nextFile] = lastTwo('ftp')
  const [previous, protocol] = lastTwo('list')
  const moving = new Set([...moved(file, nextFile), ...moved(previous, protocol)])

  console.info(`${file.params.length} parameters; changing on their own, left out: ${[...moving].join(', ') || 'none'}`)
  expectTheSame(file, protocol, moving)
  // What moves by itself is a handful (counters and timers), not a list that is half different.
  expect(moving.size).toBeLessThan(file.params.length / 20)
}

/**
 * The middle sample.
 *
 * @param samples the samples
 * @returns the median (the upper one of an even count), rounded to a millisecond
 */
const median = (samples: number[]) => Math.round(samples.toSorted((a, b) => a - b)[Math.floor(samples.length / 2)] ?? Number.NaN)

/**
 * Samples as a list of whole milliseconds.
 *
 * @param samples the samples
 * @returns them, rounded, with commas between
 */
const shown = (samples: number[]) => samples.map(ms => Math.round(ms)).join(', ')

/** The file within its budget; the protocol's times are printed beside it. */
function fileWithinBudget(): void {
  const ftp = made.ftp.map(sample => sample.ms)
  const list = made.list.map(sample => sample.ms)
  console.info(`parameter download from SITL over TCP: by file ${shown(ftp)} ms (median ${median(ftp)}); `
    + `by protocol ${shown(list)} ms (median ${median(list)})`)

  expectWithinBudget('paramDownloadFtp', ftp)
}

describeSitl('the parameter download by file and by protocol against ArduPilot SITL', () => {
  beforeAll(startAll, 120_000)
  afterAll(stopAll)

  it('downloads the whole list by file and by protocol, in turn', downloadsByBothWays, ROUNDS_MS)
  it('gives the same list both ways, but for what changes on its own', sameListBothWays)
  it('downloads by file within its budget, with the protocol measured beside it', fileWithinBudget)
})
