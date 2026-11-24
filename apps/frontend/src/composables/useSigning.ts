// MAVLink signing (#33): whether the link to the vehicle is signed, and the actions that set a key on the vehicle or turn its
// signing off. The backend makes and keeps the key: what comes here is the state, a fingerprint and when the key was set, never
// the key. The passphrase the user types goes to the backend once, with the request, and is not kept here.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, toBackendError } from '@/backend/client'
import type { SigningStatus } from '@/generated/app'

/** What the model needs. */
export interface SigningDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** What an action came to: done, or the backend's code for why not. */
export type SigningOutcome = { ok: true } | { ok: false, code: string }

/** The signing, as refs and actions. */
export interface SigningModel {
  /** What the backend last said (off until it has). */
  readonly status: ShallowRef<SigningStatus>
  /** Whether a change is under way. */
  readonly busy: ShallowRef<boolean>
  /** Sets a key on the connected vehicle: a random one, or the one a passphrase makes. */
  provision: (passphrase?: string) => Promise<SigningOutcome>
  /** Turns the connected vehicle's signing off, and forgets its key. */
  disable: () => Promise<SigningOutcome>
  /** Starts listening to the backend. */
  watch: () => Promise<void>
}

/** The state before the backend has said anything. */
const OFF: SigningStatus = { state: 'off' }

/**
 * Runs a change: its answer is the new state, a refusal its code.
 *
 * @param refs the state and whether a change runs
 * @param refs.status the state
 * @param refs.busy whether a change runs
 * @param change the call
 * @returns what it came to
 */
async function run(
  refs: { status: ShallowRef<SigningStatus>, busy: ShallowRef<boolean> },
  change: () => Promise<SigningStatus>,
): Promise<SigningOutcome> {
  refs.busy.value = true

  try {
    refs.status.value = await change()

    return { ok: true }
  } catch (error) {
    return { ok: false, code: toBackendError(error).code }
  } finally {
    refs.busy.value = false
  }
}

/**
 * The signing.
 *
 * @param deps the client
 * @returns the model
 */
export function useSigning(deps: SigningDeps): SigningModel {
  const refs = { status: shallowRef<SigningStatus>(OFF), busy: shallowRef(false) }
  const { client } = deps

  return {
    ...refs,
    provision: passphrase => run(refs, () => client.call('signing.provision', passphrase === undefined ? {} : { passphrase })),
    disable: () => run(refs, () => client.call('signing.disable', null)),
    async watch() {
      try {
        await client.subscribe('signing.status', null, next => {
          refs.status.value = next
        }).ready
      } catch {
        // A backend without it (an older one): the link is shown as not signed, which is what is known.
      }
    },
  }
}
