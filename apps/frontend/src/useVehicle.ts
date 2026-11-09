// The vehicle link: connecting and disconnecting, what the backend says about the connection, the serial ports, and
// the vehicle's telemetry. It talks to the backend through the client (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, type BackendState, describeError } from './backend/client'
import type { Connection, ConnectRequest, SerialPort, Telemetry } from './generated/app'

/** What the vehicle link needs from the rest of the interface. */
export interface VehicleDeps {
  /** The link to the backend. */
  client: BackendClient
  /** Records why the last thing failed (null: clears it). */
  fail: (message: string | null) => void
}

/** Told when the vehicle has just been connected (true), and each time the connection is reported not connected (false). */
export type SessionListener = (connected: boolean) => void

/** The vehicle link, as refs and actions. */
export interface Vehicle {
  /** The connection's state, and the vehicle found. */
  readonly connection: ShallowRef<Connection>
  /** The backend machine's serial ports, as last listed. */
  readonly ports: ShallowRef<SerialPort[]>
  /** Why the vehicle session ended without the user asking (a backend restart). */
  readonly notice: ShallowRef<string | null>
  /** The latest telemetry; null without a connected vehicle. */
  readonly telemetry: ShallowRef<Telemetry | null>
  /** Connects to what the request says. */
  connect: (request: ConnectRequest) => Promise<void>
  /** Disconnects. */
  disconnect: () => Promise<void>
  /** Lists the serial ports (for the serial transport's device choice). */
  listPorts: () => Promise<void>
  /** Starts listening to the backend: the connection and the telemetry. */
  watch: () => Promise<void>
  /** The link to the backend changed state: if it went away, the vehicle session went with it. */
  backendChanged: (state: BackendState) => void
  /** Listens to the vehicle being connected (its parameters can be downloaded) and no longer being connected. */
  onSession: (listener: SessionListener) => void
}

/**
 * Why a connection failed, if it did.
 *
 * @param connection what the backend reported
 * @returns its error, or null
 */
const errorOf = (connection: Connection) => connection.error ?? null

/**
 * The text for a vehicle session that ended because the backend did.
 *
 * @param state the link's new state
 * @returns the notice
 */
function sessionEndedNotice(state: BackendState): string {
  const what = state === 'restarting' ? 'restarted' : 'stopped'

  return `The backend ${what}: the vehicle session ended. Connect again to continue.`
}

/**
 * The connection once the session is lost: the vehicle stays shown.
 *
 * @param connection the connection until now
 * @returns the lost connection
 */
function lostFrom(connection: Connection): Connection {
  return connection.vehicle ? { state: 'lost', vehicle: connection.vehicle } : { state: 'lost' }
}

/** The vehicle link. */
class VehicleLink implements Vehicle {
  readonly connection = shallowRef<Connection>({ state: 'disconnected' })
  readonly ports = shallowRef<SerialPort[]>([])
  readonly notice = shallowRef<string | null>(null)
  readonly telemetry = shallowRef<Telemetry | null>(null)
  private readonly listeners: SessionListener[] = []

  /**
   * Makes the link.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: VehicleDeps) {}

  /**
   * Whether a vehicle session is on, or being set up.
   *
   * @returns true while connected or connecting
   */
  private sessionOn(): boolean {
    const { state } = this.connection.value

    return state === 'connected' || state === 'connecting'
  }

  /**
   * The backend reported a new connection.
   *
   * @param next the connection
   */
  private connectionChanged(next: Connection): void {
    const becameConnected = next.state === 'connected' && this.connection.value.state !== 'connected'
    this.connection.value = next
    this.deps.fail(errorOf(next))

    if (becameConnected) {
      this.listeners.forEach(listener => listener(true))
    }
    if (next.state !== 'connected') {
      this.sessionEnded(next)
    }
  }

  /**
   * The link is not up. What's shown may no longer be the vehicle's: keep it visible, but don't offer edits. While the
   * backend is bringing the link back (`reconnecting`) the last telemetry stays too, and the cards mark it stale.
   *
   * @param next the connection, in any state but `connected`
   */
  private sessionEnded(next: Connection): void {
    if (next.state !== 'reconnecting') {
      this.telemetry.value = null
    }
    this.listeners.forEach(listener => listener(false))
  }

  onSession(listener: SessionListener): void {
    this.listeners.push(listener)
  }

  async connect(request: ConnectRequest): Promise<void> {
    this.connection.value = { state: 'connecting' }
    this.notice.value = null
    this.deps.fail(null)

    try {
      this.connectionChanged(await this.deps.client.call('vehicle.connect', request))
    } catch (error) {
      this.connection.value = { state: 'disconnected' }
      this.deps.fail(describeError(error))
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.connectionChanged(await this.deps.client.call('vehicle.disconnect', null))
    } catch (error) {
      this.deps.fail(describeError(error))
    }
  }

  async listPorts(): Promise<void> {
    try {
      this.ports.value = (await this.deps.client.call('serial.ports', null)).ports
    } catch (error) {
      this.deps.fail(`Couldn't list the serial ports: ${describeError(error)}`)
    }
  }

  async watch(): Promise<void> {
    const { client } = this.deps
    try {
      await client.subscribe('vehicle.connection', null, next => this.connectionChanged(next)).ready
      await client.subscribe('telemetry.stream', {}, next => {
        this.telemetry.value = next
      }).ready
    } catch (error) {
      this.deps.fail(`the backend: ${describeError(error)}`)
    }
  }

  backendChanged(state: BackendState): void {
    if (state === 'ready' || !this.sessionOn()) {
      return
    }
    this.connection.value = lostFrom(this.connection.value)
    this.telemetry.value = null
    this.notice.value = sessionEndedNotice(state)
  }
}

/**
 * Makes the vehicle link.
 *
 * @param deps the client and the rest of the interface
 * @returns the refs and the actions
 */
export function useVehicle(deps: VehicleDeps): Vehicle {
  return new VehicleLink(deps)
}
