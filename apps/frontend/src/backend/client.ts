// The only module that talks to the Communicator. Components and composables call the backend through a
// BackendClient: one error type, subscriptions that end with the effect scope that made them, and no
// Communicator types in sight (docs/frontend-state.md).
import { Communicator, CommunicatorError, type ConnectionState, type Transport } from '@pico-desktop/communicator'
import { getCurrentScope, onScopeDispose } from 'vue'
import { type Services, validate } from '../generated/app'

/** The names of the services of one kind. */
type NamesOf<Kind extends string> = { [K in keyof Services]: Services[K] extends { kind: Kind } ? K : never }[keyof Services]

/** The backend's methods (request and response). */
export type MethodName = NamesOf<'method'>

/** The backend's subscriptions (parameters and values). */
export type TopicName = NamesOf<'subscription'>

/** The backend's one-way events. */
export type EventName = NamesOf<'event'>

/** What a method takes. */
export type RequestOf<K extends MethodName> = Services[K] extends { request: infer R } ? R : never

/** What a method answers. */
export type ResponseOf<K extends MethodName> = Services[K] extends { response: infer R } ? R : never

/** What a subscription is asked with. */
export type ParamsOf<K extends TopicName> = Services[K] extends { params: infer P } ? P : never

/** What a subscription delivers. */
export type ValueOf<K extends TopicName> = Services[K] extends { value: infer V } ? V : never

/** What an event carries. */
export type PayloadOf<K extends EventName> = Services[K] extends { payload: infer P } ? P : never

/** The state of the link to the backend. */
export type BackendState = ConnectionState

/** The transport a client talks over (the host's bridge, or the mock backend). */
export type { Transport } from '@pico-desktop/communicator'

export { bridgeTransport, type NativeBridge } from '@pico-desktop/communicator'

/** Every way a call to the backend fails, as one error: a stable code, and a message for people. */
export class BackendError extends Error {
  /**
   * Makes the error for a failed call.
   *
   * @param code the protocol's or the application's error code, or `unknown` for anything else
   * @param message what went wrong, in English (for people to read, not to match on)
   * @param cause the error this one stands for
   */
  constructor(readonly code: string, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'BackendError'
  }
}

/**
 * The BackendError for anything a call can throw.
 *
 * @param error what was thrown
 * @returns the error as the client reports it
 */
export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) {
    return error
  }
  if (error instanceof CommunicatorError) {
    return new BackendError(error.code, error.message, error)
  }

  return new BackendError('unknown', error instanceof Error ? error.message : String(error), error)
}

/** A running subscription. */
export interface Subscription {
  /** Resolves once the backend accepted it; rejects with a BackendError if it did not. */
  readonly ready: Promise<void>
  /** Ends it. Also done when the effect scope it was made in ends. Calling it again does nothing. */
  stop: () => void
}

/** What the rest of the interface sees of the backend. */
export interface BackendClient {
  /** Calls a method. Rejects with a BackendError. */
  call: <K extends MethodName>(method: K, payload: RequestOf<K>) => Promise<ResponseOf<K>>
  /** Subscribes to a topic; ends with the current effect scope, if there is one. */
  subscribe: <K extends TopicName>(topic: K, params: ParamsOf<K>, onValue: (value: ValueOf<K>) => void) => Subscription
  /** Listens to a one-way event; ends with the current effect scope, if there is one. */
  onEvent: <K extends EventName>(name: K, listener: (payload: PayloadOf<K>) => void) => () => void
  /** Observes the link to the backend (it restarts after a crash or an edit in development). */
  onState: (listener: (state: BackendState) => void) => () => void
}

/**
 * Ends something with the current effect scope, if there is one.
 *
 * @param stop what to do when the scope ends
 */
function endWithScope(stop: () => void): void {
  if (getCurrentScope()) {
    onScopeDispose(stop)
  }
}

/**
 * The Communicator as this module uses it: names and payloads as plain values. The types above (from the generated
 * `Services`) are what callers see; this is the one place where they are matched to the wire.
 */
interface Wire {
  request: (name: string, payload: unknown) => Promise<unknown>
  subscribe: (name: string, params: unknown, onValue: (value: unknown) => void) => Promise<{ unsubscribe: () => Promise<void> }>
  on: (name: string, listener: (payload: unknown) => void) => () => void
  onConnectionChange: (listener: (state: BackendState) => void) => () => void
}

/**
 * Asks the backend for a subscription, and makes the call that ends it.
 *
 * @param wire the link
 * @param topic the subscription's name
 * @param params its parameters
 * @param onValue gets each value, until it is stopped
 * @returns the subscription
 */
function openSubscription<K extends TopicName>(
  wire: Wire,
  topic: K,
  params: ParamsOf<K>,
  onValue: (value: ValueOf<K>) => void,
): Subscription {
  let stopped = false
  let live: { unsubscribe: () => Promise<void> } | undefined
  const accept = async () => {
    try {
      live = await wire.subscribe(topic, params, value => {
        if (!stopped) {
          onValue(value as ValueOf<K>)
        }
      })
    } catch (error) {
      throw toBackendError(error)
    }

    if (stopped) {
      await live.unsubscribe()
    }
  }
  const stop = () => {
    stopped = true
    void live?.unsubscribe()
  }

  return { ready: accept(), stop }
}

/**
 * Makes the client for a link to the backend.
 *
 * @param transport the host's bridge, or the mock backend
 * @returns the client
 */
export function createBackendClient(transport: Transport): BackendClient {
  const wire = new Communicator<Services>({ transport, validate }) as unknown as Wire

  return {
    async call(method, payload) {
      try {
        return await wire.request(method, payload) as ResponseOf<typeof method>
      } catch (error) {
        throw toBackendError(error)
      }
    },
    subscribe(topic, params, onValue) {
      const subscription = openSubscription(wire, topic, params, onValue)
      endWithScope(subscription.stop)

      return subscription
    },
    onEvent(name, listener) {
      const stop = wire.on(name, payload => listener(payload as PayloadOf<typeof name>))
      endWithScope(stop)

      return stop
    },
    onState: listener => wire.onConnectionChange(state => listener(state)),
  }
}
