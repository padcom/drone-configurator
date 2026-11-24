// The serial bridge (#198): a port of the vehicle reached by a program on this computer through a local TCP port. The backend
// holds it (`serial.bridge.*`): this follows its state (`serial.bridge.status`, from the start of the app, so the top bar can say
// a port is locked whatever screen is shown) and asks it to start and to stop. Nothing here decides what is safe: the backend
// refuses an armed vehicle, and says why.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, toBackendError } from '@/backend/client'
import type { SerialBridgeStart, SerialBridgeState } from '@/generated/app'

/** What the bridge needs from the rest of the interface. */
export interface SerialBridgeDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** The serial bridge, as refs and actions. */
export interface SerialBridgeModel {
  /** The bridge as the backend last said it; null before it has. */
  readonly state: ShallowRef<SerialBridgeState | null>
  /** The code the last start was refused with (`ARMED`, `PORT_UNAVAILABLE` ...); null when it was not, or after a new start. */
  readonly refusal: ShallowRef<string | null>
  /** Whether a start or a stop is on its way. */
  readonly pending: ShallowRef<boolean>
  /** Asks for a bridge. */
  start: (ask: SerialBridgeStart) => Promise<void>
  /** Ends the bridge; resolves once the port was given back. */
  stop: () => Promise<void>
  /** Starts following the backend. */
  watch: () => Promise<void>
}

/** The serial bridge. */
class SerialBridge implements SerialBridgeModel {
  readonly state = shallowRef<SerialBridgeState | null>(null)
  readonly refusal = shallowRef<string | null>(null)
  readonly pending = shallowRef(false)

  /**
   * Makes it.
   *
   * @param deps the link to the backend
   */
  constructor(private readonly deps: SerialBridgeDeps) {}

  /**
   * Asks for a bridge.
   *
   * @param ask the port, its speed and the local port
   */
  async start(ask: SerialBridgeStart): Promise<void> {
    this.refusal.value = null
    await this.#ask(async () => {
      this.state.value = await this.deps.client.call('serial.bridge.start', ask)
    })
  }

  /** Ends the bridge. */
  async stop(): Promise<void> {
    await this.#ask(async () => {
      this.state.value = await this.deps.client.call('serial.bridge.stop', null)
    })
  }

  /** Follows the backend's state. */
  async watch(): Promise<void> {
    try {
      await this.deps.client.subscribe('serial.bridge.status', null, next => {
        this.state.value = next
      }).ready
    } catch {
      // A backend without it (an older one): nothing is held, and the page says the bridge is off.
    }
  }

  /**
   * Runs a request, with `pending` set while it is on its way and the refusal kept.
   *
   * @param work the request
   */
  async #ask(work: () => Promise<void>): Promise<void> {
    this.pending.value = true

    try {
      await work()
    } catch (error) {
      this.refusal.value = toBackendError(error).code
    } finally {
      this.pending.value = false
    }
  }
}

/**
 * The serial bridge.
 *
 * @param deps the link to the backend
 * @returns its state and actions
 */
export function useSerialBridge(deps: SerialBridgeDeps): SerialBridgeModel {
  return new SerialBridge(deps)
}
