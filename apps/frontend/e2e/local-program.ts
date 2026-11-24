// For the serial bridge's specs (#198): a program on this computer that connects to the bridge's local TCP port (or to any TCP
// port: SITL's SERIAL1, standing in for the device at the far end of a serial line), what it has read, the waits around it, and
// the ways to the bridge's page and its buttons.
import { type Socket, createConnection, createServer } from 'node:net'
import type { E2eApp } from './launch'

/**
 * Waits until `done` says so.
 *
 * @param what what is waited for, for the failure
 * @param done the condition
 * @param timeoutMs how long it may take
 * @throws {Error} when it never does
 */
export async function until(what: string, done: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!done()) {
    if (Date.now() > deadline) {
      throw new Error(`never: ${what}`)
    }
    // eslint-disable-next-line no-await-in-loop -- one look after the other
    await new Promise<void>(resolve => {
      setTimeout(resolve, 50)
    })
  }
}

/**
 * A TCP port that is free now.
 *
 * @returns its number
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

/**
 * Whether a local port takes a connection.
 *
 * @param port the port
 * @returns true when it does
 */
export function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/** A program: a socket to a local port, and every byte it has read. */
export class Program {
  bytes: Buffer = Buffer.alloc(0)
  ended = false
  readonly socket: Socket

  /**
   * Connects it.
   *
   * @param port the local port
   */
  constructor(port: number) {
    this.socket = createConnection({ host: '127.0.0.1', port })
    this.socket.on('data', (chunk: Buffer) => {
      this.bytes = Buffer.concat([this.bytes, chunk])
    })
    this.socket.on('close', () => {
      this.ended = true
    })
    this.socket.on('error', () => {
      this.ended = true
    })
  }

  /**
   * What it has read, as text.
   *
   * @returns the text
   */
  get text(): string {
    return this.bytes.toString('latin1')
  }

  /**
   * Waits until it has read `what` since byte `from`.
   *
   * @param what the bytes, or text
   * @param timeoutMs how long it may take
   * @param from where to look from
   * @returns what it read from `from` to the end of `what`
   */
  async reads(what: string | Buffer, timeoutMs = 10_000, from = 0): Promise<Buffer> {
    const wanted = typeof what === 'string' ? Buffer.from(what, 'latin1') : what
    const shown = `the program reads ${JSON.stringify(wanted.toString('latin1'))}`
    await until(shown, () => this.bytes.indexOf(wanted, from) >= 0, timeoutMs)

    return this.bytes.subarray(from, this.bytes.indexOf(wanted, from) + wanted.length)
  }

  /** Closes it. */
  close(): void {
    this.socket.destroy()
  }
}

/**
 * Enter on what has the focus, as the keyboard sends it (a key down with its text: a button takes it as a press).
 *
 * @param app the app
 */
export async function pressEnter(app: E2eApp): Promise<void> {
  const event = {
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r',
  }
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/**
 * Opens a page of Setup from its link, and waits until the page is the one shown (a press can land beside the link while the
 * layout moves: it is made again, a few times).
 *
 * @param app the app
 * @param page the page
 * @param left how many presses remain
 */
export async function openSetupPage(app: E2eApp, page: string, left = 4): Promise<void> {
  const link = `document.querySelector('a[href="#/setup/${page}"]')`
  await app.waitFor(`${link} !== null`, 120_000)

  try {
    await app.click(`a[href="#/setup/${page}"]`)
    await app.waitFor(`${link}?.getAttribute('aria-current') === 'page'`, 5000)
  } catch (error) {
    if (left <= 1) {
      throw error
    }
    await openSetupPage(app, page, left - 1)
  }
}
