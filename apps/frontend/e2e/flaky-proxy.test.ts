import { type Server, type Socket, connect, createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { FlakyProxy } from './flaky-proxy'

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

/** A cut ends what is open, refuses what is new, and a restore forwards again. */
async function cutsAndRestores(): Promise<void> {
  const { proxy } = await rig()
  const open = connect(proxy.port, '127.0.0.1')
  await new Promise(resolve => {
    open.once('connect', resolve)
  })
  const ended = endsWithin(open, 2000)
  proxy.cut()
  expect(await ended).toBe('closed')
  expect(proxy.isCut).toBe(true)
  expect(await ask(proxy.port, 'hello')).toBe('closed')
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

describe('the flaky proxy', () => {
  afterEach(async () => {
    await Promise.all(stops.splice(0).map(stop => stop()))
  })

  it('forwards both ways', forwards)
  it('ends the connections that are open when it is cut, and refuses new ones until it is restored', cutsAndRestores)
  it('ends the upstream connection when the client goes', endsUpstream)
  it('sends new connections somewhere else after retargeting', retargets)
})
