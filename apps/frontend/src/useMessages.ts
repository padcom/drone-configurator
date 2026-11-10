// The texts the vehicle sends: the list the Fly aside shows, how many warnings have come that nobody has looked at, and the
// failsafe that is told over the map. Two subscriptions to `vehicle.messages` do it: one with the stored messages replayed
// (fills the list), one with none (what is new: only this one makes toasts, unread counts and the failsafe banner, so that
// a replay on connecting never raises a toast for something that was said minutes ago).
import { type Ref, type ShallowRef, ref, shallowRef } from 'vue'
import { type BackendClient, type Subscription } from './backend/client'
import type { VehicleMessage } from './generated/app'
import { isFailsafe, isWarning } from './messages'

/** How many messages the list keeps, and asks to have replayed (the backend replays at most 200). */
export const KEPT = 200

/** What the messages need from the rest of the interface. */
export interface MessagesDeps {
  /** The link to the backend. */
  client: BackendClient
  /** Told of each new message (not of the replayed ones), for a toast. */
  announce: (message: VehicleMessage) => void
}

/** The messages, as refs and actions. */
export interface MessagesModel {
  /** The messages, oldest first. */
  readonly list: ShallowRef<VehicleMessage[]>
  /** How many new warnings (or worse) came since the list was last looked at. */
  readonly unread: Readonly<Ref<number>>
  /** The failsafe told over the map, or null. */
  readonly failsafe: ShallowRef<VehicleMessage | null>
  /** Starts listening (again), with the stored messages replayed into the list. */
  start: () => void
  /** The list has been looked at (the Fly screen was opened, or the pointer or the focus came to the list): nothing is unread. */
  markRead: () => void
  /** Takes the failsafe banner away. */
  dismissFailsafe: () => void
}

/**
 * Waits for the backend to accept a subscription, and lets it be refused: the list is then empty, and that is all.
 *
 * @param subscription the subscription
 */
async function refused(subscription: Subscription): Promise<void> {
  try {
    await subscription.ready
  } catch {
    // Nothing to do: there are no messages to show.
  }
}

/** The messages. */
class Messages implements MessagesModel {
  readonly list = shallowRef<VehicleMessage[]>([])
  readonly unread = ref(0)
  readonly failsafe = shallowRef<VehicleMessage | null>(null)
  private readonly subscriptions: Subscription[] = []

  /**
   * Makes the model.
   *
   * @param deps the client and what a new message is told to
   */
  constructor(private readonly deps: MessagesDeps) {}

  start(): void {
    this.subscriptions.splice(0).forEach(subscription => subscription.stop())
    this.list.value = []
    this.failsafe.value = null
    const { client } = this.deps
    this.subscriptions.push(
      client.subscribe('vehicle.messages', { replay: KEPT }, message => this.add(message)),
      client.subscribe('vehicle.messages', { replay: 0 }, message => this.arrived(message)),
    )
    // A subscription the backend refuses leaves the list empty; there is nothing more to do about it here.
    this.subscriptions.forEach(subscription => void refused(subscription))
  }

  markRead(): void {
    this.unread.value = 0
  }

  dismissFailsafe(): void {
    this.failsafe.value = null
  }

  /**
   * Adds a message to the list, unless it is there already (ids go up, so an older or equal one is a repeat).
   *
   * @param message the message
   */
  private add(message: VehicleMessage): void {
    const last = this.list.value.at(-1)
    if (last && message.id <= last.id) {
      return
    }
    this.list.value = [...this.list.value, message].slice(-KEPT)
  }

  /**
   * A message that is new: told for a toast if it is a warning or worse, counted as unread until the list is looked at, and the
   * banner when it is a failsafe.
   *
   * @param message the message
   */
  private arrived(message: VehicleMessage): void {
    if (isWarning(message)) {
      this.deps.announce(message)
      this.unread.value += 1
    }
    if (isFailsafe(message)) {
      this.failsafe.value = message
    }
  }
}

/**
 * Makes the messages.
 *
 * @param deps the client and what a new message is told to
 * @returns the list, the unread count and the failsafe
 */
export function useMessages(deps: MessagesDeps): MessagesModel {
  return new Messages(deps)
}
