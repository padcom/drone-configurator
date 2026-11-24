// The serial bridge of the mock backend (`serial.bridge.*`): what the real one (apps/backend/serialbridge.pi) says to the
// page, with a vehicle that is not there and no TCP port (the browser has none). A start is refused as the backend refuses it
// (`NOT_CONNECTED`, `ARMED`, `STATE_UNKNOWN`, `BUSY`, `INVALID_VALUE`); a bridge that runs says the port it would listen on,
// and a test makes a program connect, bytes flow and the bridge end by itself (`control`). Every end gives the port back at
// once (`released`).
import type { Envelope } from '@pico-desktop/protocol'
import type { SerialBridgeStart, SerialBridgeState } from '@/generated/app'

type Outgoing = Omit<Envelope, 'v'>

/** The local port the mock says it listens on when it is asked for any free one. */
const ANY_PORT = 47000

/** The fastest speed a port is set to (bits a second), as the backend has it. */
const MAX_BAUD = 4_000_000

/**
 * A bridge that runs, as asked for.
 *
 * @param ask what was asked for
 * @returns its state
 */
function running(ask: SerialBridgeStart): SerialBridgeState {
  const state: SerialBridgeState = {
    state: 'running', device: ask.device, address: ask.address ?? '127.0.0.1', port: ask.port || ANY_PORT,
    client: false, toVehicle: 0, fromVehicle: 0, dropped: 0, refused: 0,
  }

  return ask.baudrate ? { ...state, baudrate: ask.baudrate } : state
}

/**
 * A bridge with no program connected.
 *
 * @param state the bridge
 * @returns it without the program
 */
function withoutClient(state: SerialBridgeState): SerialBridgeState {
  const entries = Object.entries({ ...state, client: false }).filter(([key]) => key !== 'clientAddress')

  return Object.fromEntries(entries) as SerialBridgeState
}

/** What a test reads and does of the mock's bridge. */
export interface MockSerialBridgeControl {
  /** The bridge as the mock has it. */
  state: () => SerialBridgeState
  /** How many times a port was given back. */
  released: () => number
  /** A program connects (or leaves: false). */
  program: (connected: boolean) => void
  /** Bytes went to the vehicle and came from it. */
  bytes: (toVehicle: number, fromVehicle: number) => void
  /** The bridge ends by itself (the link was lost, the vehicle armed ...) with this reason. */
  end: (why: string) => void
}

/** What the mock's bridge needs of the rest of the mock. */
export interface MockSerialBridgeDeps {
  /** How the mock sends to the page. */
  send: (e: Outgoing) => void
  /** Whether a vehicle is connected. */
  connected: () => boolean
  /** Whether the vehicle is armed: null or undefined when it is not known. */
  armed: () => boolean | null | undefined
}

/** The serial bridge of the mock. */
export class MockSerialBridge {
  private current: SerialBridgeState = { state: 'off', client: false, toVehicle: 0, fromVehicle: 0, dropped: 0, refused: 0 }
  private readonly watchers = new Set<number>()
  private releases = 0

  /**
   * Makes it.
   *
   * @param deps how it sends, and what it knows of the vehicle
   */
  constructor(private readonly deps: MockSerialBridgeDeps) {}

  /**
   * What a test reads and does.
   *
   * @returns the controls
   */
  control(): MockSerialBridgeControl {
    return {
      state: () => ({ ...this.current }),
      released: () => this.releases,
      program: connected => this.change(connected ? { client: true, clientAddress: '127.0.0.1:50123' } : { client: false }),
      bytes: (toVehicle, fromVehicle) => this.change({
        toVehicle: this.current.toVehicle + toVehicle, fromVehicle: this.current.fromVehicle + fromVehicle,
      }),
      end: why => this.finish(why),
    }
  }

  /**
   * `serial.bridge.start`.
   *
   * @param ask what is asked for
   * @param ok sends the result
   * @param fail sends an error
   */
  start(ask: SerialBridgeStart, ok: (p: Envelope['p']) => void, fail: (code: string, message: string) => void): void {
    const code = this.refusal(ask)
    if (code !== null) {
      fail(code, 'refused')

      return
    }
    this.current = running(ask)
    this.tell()
    ok(this.current)
  }

  /**
   * Why a start may not begin, or null.
   *
   * @param ask what is asked for
   * @returns the code
   */
  private refusal(ask: SerialBridgeStart): string | null {
    const armed = this.deps.armed()
    const checks: [boolean, string][] = [
      [!this.deps.connected(), 'NOT_CONNECTED'],
      [typeof armed !== 'boolean', 'STATE_UNKNOWN'],
      [armed === true, 'ARMED'],
      [this.current.state !== 'off', 'BUSY'],
      [Number(ask.baudrate) > MAX_BAUD, 'INVALID_VALUE'],
    ]

    return checks.find(([failed]) => failed)?.[1] ?? null
  }

  /**
   * `serial.bridge.stop`: the port is given back, and the state is the answer.
   *
   * @param ok sends the result
   */
  stop(ok: (p: Envelope['p']) => void): void {
    this.finish('STOPPED')
    ok(this.current)
  }

  /**
   * A subscription to `serial.bridge.status`: the state at once, and whenever it changes.
   *
   * @param e the request
   */
  subscribe(e: Envelope): void {
    const s = e.id!
    this.watchers.add(s)
    this.send({ k: 'response', id: s, s })
    this.send({ k: 'event', n: 'serial.bridge.status', s, p: this.current })
  }

  /**
   * The page unsubscribed.
   *
   * @param s the subscription
   */
  unsubscribe(s: number): void {
    this.watchers.delete(s)
  }

  /** The session ended (a disconnect): the bridge ends with it. */
  disconnected(): void {
    this.finish('DISCONNECTED')
  }

  /** The mock restarts: no bridge, nobody watching. */
  reset(): void {
    this.watchers.clear()
    this.current = { state: 'off', client: false, toVehicle: 0, fromVehicle: 0, dropped: 0, refused: 0 }
  }

  /**
   * The bridge ends: the port is given back at once.
   *
   * @param why the reason
   */
  private finish(why: string): void {
    if (this.current.state === 'off') {
      return
    }
    this.releases += 1
    this.current = { ...withoutClient(this.current), state: 'off', why }
    this.tell()
  }

  /**
   * A change of a bridge that runs, told to who watches.
   *
   * @param patch what changes
   */
  private change(patch: Partial<SerialBridgeState>): void {
    if (this.current.state === 'running') {
      const next = { ...this.current, ...patch }
      this.current = next.client ? next : withoutClient(next)
      this.tell()
    }
  }

  /** Tells who watches. */
  private tell(): void {
    for (const s of this.watchers) {
      this.send({ k: 'event', n: 'serial.bridge.status', s, p: this.current })
    }
  }

  /**
   * Sends to the page.
   *
   * @param e what
   */
  private send(e: Outgoing): void {
    this.deps.send(e)
  }
}
