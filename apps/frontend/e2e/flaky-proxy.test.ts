import { type Server, type Socket, connect, createServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlakyProxy } from './flaky-proxy'
import { FrameReader, MSG_HEARTBEAT, MSG_PARAM_VALUE, encodeFrame } from './mavlink-wire'

/** An echo server, with the sockets it accepted. */
interface Upstream {
  server: Server
  port: number
  sockets: Socket[]
}

/** Things to stop after a test, last first. */
const stops: (() => Promise<void>)[] = []

/**
 * Starts an echo server that says, as it answers, which server it is.
 *
 * @param name how it signs its answers
 * @returns the server, its port and its sockets
 */
async function serve(name: string): Promise<Upstream> {
  const sockets: Socket[] = []
  const server = createServer(socket => {
    sockets.push(socket)
    socket.on('data', data => socket.write(`${name}:${data.toString()}`))
    socket.on('error', () => undefined)
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  stops.push(() => new Promise<void>(resolve => {
    sockets.forEach(socket => socket.destroy())
    server.close(() => resolve())
  }))

  return { server, port: typeof address === 'object' && address ? address.port : 0, sockets }
}

/**
 * Connects, sends `text`, and says what came back.
 *
 * @param port the port to connect to
 * @param text what to send
 * @returns the answer, `closed` if the connection ended first, or `error`
 */
function ask(port: number, text: string): Promise<string> {
  return new Promise(resolve => {
    const socket = connect(port, '127.0.0.1')
    socket.on('data', data => {
      socket.destroy()
      resolve(data.toString())
    })
    socket.on('close', () => resolve('closed'))
    socket.on('error', () => resolve('error'))
    socket.on('connect', () => socket.write(text))
  })
}

/**
 * Waits for a socket to end.
 *
 * @param socket the socket
 * @param ms how long to wait
 * @returns `closed` if it ended in time, `open` if not
 */
function endsWithin(socket: Socket, ms: number): Promise<'closed' | 'open'> {
  return new Promise(resolve => {
    socket.on('close', () => resolve('closed'))
    setTimeout(() => resolve('open'), ms)
  })
}

/**
 * Starts a server and a proxy in front of it.
 *
 * @returns both
 */
async function rig(): Promise<{ upstream: Upstream, proxy: FlakyProxy }> {
  const upstream = await serve('a')
  const proxy = await FlakyProxy.start({ host: '127.0.0.1', port: upstream.port })
  stops.push(() => proxy.stop())

  return { upstream, proxy }
}

/** What goes through comes back, both ways. */
async function forwards(): Promise<void> {
  const { proxy } = await rig()
  expect(await ask(proxy.port, 'hello')).toBe('a:hello')
  expect(proxy.forwarded).toBe(1)
}

/**
 * Waits until the proxy has accepted a connection: the client's `connect` is the kernel finishing the handshake, which can
 * come before the proxy's own accept (macOS does), so a cut right after it would meet a connection the proxy has not seen.
 *
 * @param proxy the proxy
 * @param count how many connections it must have accepted
 * @returns a promise that resolves when it has
 */
async function hasAccepted(proxy: FlakyProxy, count: number): Promise<void> {
  await vi.waitFor(() => expect(proxy.forwarded).toBe(count), { timeout: 5000, interval: 5 })
}

/** A cut ends what is open, refuses what is new, and a restore forwards again. */
async function cutsAndRestores(): Promise<void> {
  const { proxy } = await rig()
  const open = connect(proxy.port, '127.0.0.1')
  await new Promise(resolve => {
    open.once('connect', resolve)
  })
  await hasAccepted(proxy, 1)
  const ended = endsWithin(open, 2000)
  proxy.cut()
  expect(await ended).toBe('closed')
  expect(proxy.isCut).toBe(true)
  // Refused: closed at once, which macOS and Windows report to the client as a reset rather than a clean close.
  expect(['closed', 'error']).toContain(await ask(proxy.port, 'hello'))
  expect(proxy.forwarded).toBe(1)

  proxy.restore()
  expect(await ask(proxy.port, 'hello')).toBe('a:hello')
  expect(proxy.forwarded).toBe(2)
}

/** The server's end goes when the client's does. */
async function endsUpstream(): Promise<void> {
  const { upstream, proxy } = await rig()
  await ask(proxy.port, 'hello')
  expect(await endsWithin(upstream.sockets[0] as Socket, 2000)).toBe('closed')
}

/** New connections go to the new place. */
async function retargets(): Promise<void> {
  const { proxy } = await rig()
  const other = await serve('b')
  proxy.retarget({ host: '127.0.0.1', port: other.port })
  expect(await ask(proxy.port, 'hello')).toBe('b:hello')
}

/**
 * Opens a connection through the proxy.
 *
 * @param port the proxy's port
 * @returns the socket, and what it has received so far
 */
async function openThrough(port: number): Promise<{ socket: Socket, received: string[] }> {
  const received: string[] = []
  const socket = connect(port, '127.0.0.1')
  socket.on('data', data => received.push(data.toString()))
  socket.on('error', () => undefined)
  await new Promise(resolve => {
    socket.once('connect', resolve)
  })

  return { socket, received }
}

/**
 * Waits.
 *
 * @param ms how long
 * @returns a promise that resolves after that long
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/** The cable is pulled once the vehicle's bytes asked for have gone to the app, and not before. */
async function cutsAfterBytes(): Promise<void> {
  const { proxy } = await rig()
  const { socket, received } = await openThrough(proxy.port)
  await hasAccepted(proxy, 1)
  const done = proxy.cutAfter(150)
  socket.write('x'.repeat(100))
  await wait(100)
  expect(proxy.isCut).toBe(false)
  expect(received.join('')).toHaveLength(102)
  socket.write('x'.repeat(100))
  await done
  expect(proxy.isCut).toBe(true)
  expect(await endsWithin(socket, 2000)).toBe('closed')
}

/** A muted cable keeps the connection and passes nothing, and what was said meanwhile is lost. */
async function mutes(): Promise<void> {
  const { proxy } = await rig()
  const { socket, received } = await openThrough(proxy.port)
  await hasAccepted(proxy, 1)
  proxy.mute()
  socket.write('lost')
  await wait(200)
  expect(received).toEqual([])
  expect(socket.destroyed).toBe(false)
  proxy.unmute()
  socket.write('heard')
  await wait(200)
  expect(received.join('')).toBe('a:heard')
}

/** How many frames the vehicle of the lossy test sends, and every how many a heartbeat. */
const FRAMES = 2000
const HEARTBEAT_EVERY = 20

/**
 * Starts a vehicle that sends its frames as soon as somebody connects, in pieces that split frames anywhere.
 *
 * @returns its port
 */
async function chattyVehicle(): Promise<number> {
  const frames = Array.from({ length: FRAMES }, (_, n) => (n % HEARTBEAT_EVERY === 0
    ? encodeFrame(MSG_HEARTBEAT, new Uint8Array(9), { systemId: 1, componentId: 1 }, n)
    : encodeFrame(MSG_PARAM_VALUE, new Uint8Array(25).fill(n & 0xff), { systemId: 1, componentId: 1 }, n)))
  const bytes = Buffer.concat(frames)
  const server = createServer(socket => {
    socket.on('error', () => undefined)

    for (let at = 0; at < bytes.length; at += 37) {
      socket.write(bytes.subarray(at, at + 37))
    }
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  stops.push(() => new Promise<void>(resolve => {
    server.close(() => resolve())
  }))
  const address = server.address()

  return typeof address === 'object' && address ? address.port : 0
}

/** A lossy proxy drops whole frames, about the share asked for, and never a heartbeat; what passes is whole. */
async function losesFrames(): Promise<void> {
  const proxy = await FlakyProxy.start({ host: '127.0.0.1', port: await chattyVehicle() })
  stops.push(() => proxy.stop())
  proxy.lose(0.3)
  const reader = new FrameReader()
  const frames: number[] = []
  const socket = connect(proxy.port, '127.0.0.1')
  socket.on('data', (data: Buffer) => frames.push(...reader.push(data).map(frame => frame.messageId)))
  stops.push(() => {
    socket.destroy()

    return Promise.resolve()
  })
  await vi.waitFor(() => expect(proxy.lossCount.passed + proxy.lossCount.dropped).toBe(FRAMES), { timeout: 5000, interval: 10 })
  await vi.waitFor(() => expect(frames).toHaveLength(proxy.lossCount.passed), { timeout: 5000, interval: 10 })
  const { dropped } = proxy.lossCount
  const droppable = FRAMES - FRAMES / HEARTBEAT_EVERY

  // every heartbeat, and of the rest the share asked for: within four standard deviations of the binomial
  expect(frames.filter(id => id === MSG_HEARTBEAT)).toHaveLength(FRAMES / HEARTBEAT_EVERY)
  expect(Math.abs(dropped - droppable * 0.3)).toBeLessThan(4 * Math.sqrt(droppable * 0.3 * 0.7))
}

/** Without loss the vehicle's bytes pass as they came. */
async function losesNothingAtZero(): Promise<void> {
  const proxy = await FlakyProxy.start({ host: '127.0.0.1', port: await chattyVehicle() })
  stops.push(() => proxy.stop())
  proxy.lose(0)
  const reader = new FrameReader()
  let count = 0
  const socket = connect(proxy.port, '127.0.0.1')
  socket.on('data', (data: Buffer) => {
    count += reader.push(data).length
  })
  stops.push(() => {
    socket.destroy()

    return Promise.resolve()
  })
  await vi.waitFor(() => expect(count).toBe(FRAMES), { timeout: 5000, interval: 10 })
}

describe('the flaky proxy', () => {
  afterEach(async () => {
    await Promise.all(stops.splice(0).map(stop => stop()))
  })

  it('forwards both ways', forwards)
  it('ends the connections that are open when it is cut, and refuses new ones until it is restored', cutsAndRestores)
  it('ends the upstream connection when the client goes', endsUpstream)
  it('sends new connections somewhere else after retargeting', retargets)
  it('cuts after the bytes it was told to let through', cutsAfterBytes)
  it('keeps the connection but passes nothing while muted', mutes)
  it('drops a share of the vehicle\'s whole frames when lossy, never a heartbeat', losesFrames)
  it('passes every frame when the loss is set back to nothing', losesNothingAtZero)
})
