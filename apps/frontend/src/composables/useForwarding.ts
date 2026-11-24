// Forwarding the vehicle's MAVLink to other programs (#34): the endpoints, kept in the settings document (which the BACKEND reads
// itself and forwards by), and what the backend says each one is doing (`forward.status`: up, refused, dropping, with counts).
// This model edits the list (an edit shows at once, and the settings' answer is what stays) and listens to the status while
// someone watches it (the Settings screen).
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import type { BackendClient, Subscription } from '@/backend/client'
import type { ForwardEndpoint } from '@/generated/app'
import {
  type EndpointProblem, type EndpointSetting, FORWARD_KEY, type ForwardKindName,
  endpointKey, endpointsText, parseEndpoints, problemOf,
} from '@/lib/forward/endpoints'
import type { SettingsModel } from './useSettings'

/** What the model needs. */
export interface ForwardingDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The settings, whose entry holds the endpoints. */
  settings: SettingsModel
}

/** The forwarding, as refs and actions. */
export interface ForwardingModel {
  /** The endpoints, in order (what was just chosen, until the settings answer). */
  readonly endpoints: ComputedRef<EndpointSetting[]>
  /** What the backend last said of the endpoints (empty until it has). */
  readonly status: ShallowRef<ForwardEndpoint[]>
  /** What the backend last said of each endpoint, by its key. */
  readonly states: ComputedRef<Map<string, ForwardEndpoint>>
  /** Adds an endpoint, turned on; why it cannot be, or null when it was. */
  add: (candidate: { kind: ForwardKindName, host: string, port: string }) => Promise<EndpointProblem | null>
  /** Turns an endpoint on or off. */
  turn: (key: string, on: boolean) => Promise<void>
  /** Removes an endpoint. */
  remove: (key: string) => Promise<void>
  /** Listens to what the backend says of the endpoints (until `unwatch`). */
  watch: () => void
  /** Stops listening. */
  unwatch: () => void
}

/**
 * Waits for the backend to take a subscription. A backend that refuses it (an older one) leaves the states unknown: the list is
 * still edited.
 *
 * @param subscription the subscription
 */
async function settle(subscription: Subscription): Promise<void> {
  try {
    await subscription.ready
  } catch {
    // (nothing to show: the states stay unknown)
  }
}

/** The model. */
class Forwarding implements ForwardingModel {
  readonly endpoints: ComputedRef<EndpointSetting[]>
  readonly states: ComputedRef<Map<string, ForwardEndpoint>>
  /** The list as it was just chosen, until the settings answer. */
  private readonly pending = shallowRef<EndpointSetting[] | null>(null)
  readonly status: ShallowRef<ForwardEndpoint[]> = shallowRef([])
  private subscription: Subscription | null = null

  /**
   * Makes the model.
   *
   * @param deps the client and the settings
   */
  constructor(private readonly deps: ForwardingDeps) {
    this.endpoints = computed(() => this.pending.value ?? parseEndpoints(deps.settings.uiValue(FORWARD_KEY)))
    this.states = computed(() => new Map(this.status.value.map(e => [endpointKey(e), e])))
  }

  /**
   * Keeps a new list: it shows at once, and what the settings hold shows once they have answered.
   *
   * @param next the list
   */
  private async keep(next: EndpointSetting[]): Promise<void> {
    this.pending.value = next
    await this.deps.settings.setUi(FORWARD_KEY, endpointsText(next))

    if (this.pending.value === next) {
      this.pending.value = null
    }
  }

  async add(candidate: { kind: ForwardKindName, host: string, port: string }): Promise<EndpointProblem | null> {
    const list = this.endpoints.value
    const problem = problemOf(list, candidate)
    if (problem === null) {
      const added = { kind: candidate.kind, host: candidate.host.trim(), port: Number(candidate.port.trim()), on: true }
      await this.keep([...list, added])
    }

    return problem
  }

  async turn(key: string, on: boolean): Promise<void> {
    await this.keep(this.endpoints.value.map(e => (endpointKey(e) === key ? { ...e, on } : e)))
  }

  async remove(key: string): Promise<void> {
    await this.keep(this.endpoints.value.filter(e => endpointKey(e) !== key))
  }

  watch(): void {
    this.unwatch()
    this.subscription = this.deps.client.subscribe('forward.status', null, status => {
      this.status.value = status.endpoints
    })
    void settle(this.subscription)
  }

  unwatch(): void {
    this.subscription?.stop()
    this.subscription = null
  }
}

/**
 * The forwarding.
 *
 * @param deps the client and the settings
 * @returns the model
 */
export function useForwarding(deps: ForwardingDeps): ForwardingModel {
  return new Forwarding(deps)
}
