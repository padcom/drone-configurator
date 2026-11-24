// MAVLink signing in the mock backend (#33): what the real one (apps/backend/signing.pi) says to the page, with a vehicle that
// is not there. The mock's vehicle keeps its key across connections, as a real one keeps it in its storage, and the mock keeps
// "this computer's" key; neither is a real key, only a fingerprint (the page is never told more). `signing.provision` and
// `signing.disable` are refused as the backend refuses them (no vehicle, armed or not known to be disarmed, a passphrase that
// is empty or too long), and a test can reset the vehicle's signing (over USB), give it a key of another station, or make it
// ignore SETUP_SIGNING.
import type { Envelope } from '@pico-desktop/protocol'
import type { SigningProvision, SigningStatus } from '@/generated/app'

type Outgoing = Omit<Envelope, 'v'>
type Fail = (code: string, message: string) => void
/** A refusal: its code and its words. */
type Refusal = [string, string]

/** The longest passphrase taken, as the backend. */
const MAX_PASSPHRASE = 256

/** What a test reads and does of the mock's signing. */
export interface MockSigningControl {
  /** The fingerprint of the key the vehicle holds, or null. */
  vehicleKey: () => string | null
  /** The vehicle's signing is reset over USB (it forgets its key); the link says so at the next connection. */
  resetVehicle: () => void
  /** Another ground station gives the vehicle a key this computer does not have. */
  foreignKey: () => void
  /** The vehicle ignores SETUP_SIGNING (one without signing): a provisioning is not confirmed. */
  ignoreSetup: (ignore: boolean) => void
  /** How many SETUP_SIGNING the vehicle was sent. */
  setups: () => number
}

/** What the mock's signing needs of the rest of the mock. */
export interface MockSigningHost {
  /** Whether a vehicle is connected. */
  connected: () => boolean
  /** Whether it is armed: undefined or null when it is not known. */
  armed: () => boolean | null | undefined
}

/** A key: its fingerprint and when it was set. */
interface Key {
  fingerprint: string
  setAt: number
}

/**
 * Eight hex digits of a text (FNV-1a): the mock's stand-in for the SHA-256 the backend takes of a key.
 *
 * @param text the text
 * @returns the digits
 */
function digits(text: string): string {
  let h = 0x811c9dc5
  for (const c of text) {
    h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193) >>> 0
  }

  return h.toString(16).padStart(8, '0')
}

/**
 * Why a request is refused, or null.
 *
 * @param host the rest of the mock
 * @returns the code and the words
 */
function refusal(host: MockSigningHost): Refusal | null {
  const armed = host.armed()
  if (!host.connected()) {
    return ['NOT_CONNECTED', 'no vehicle is connected']
  }
  if (typeof armed !== 'boolean') {
    return ['STATE_UNKNOWN', 'the vehicle\'s state is unknown (no heartbeat for 3 s)']
  }

  return armed ? ['ARMED', 'the vehicle is armed: signing is changed only on the ground, disarmed'] : null
}

/**
 * Why a passphrase is refused, or null.
 *
 * @param passphrase the passphrase, or undefined for a random key
 * @returns the code and the words
 */
function invalid(passphrase: string | undefined): Refusal | null {
  const bad = passphrase !== undefined && (passphrase.length === 0 || passphrase.length > MAX_PASSPHRASE)

  return bad ? ['INVALID_VALUE', `a passphrase is 1 to ${MAX_PASSPHRASE} characters`] : null
}

/**
 * Whether two keys are the same one.
 *
 * @param a a key, or null
 * @param b another, or null
 * @returns true when both are the same key
 */
function sameKey(a: Key | null, b: Key | null): boolean {
  return a?.fingerprint === b?.fingerprint
}

/** The signing of the mock. */
export class MockSigning {
  private readonly subscribers = new Set<number>()
  private vehicle: Key | null = null
  private kept: Key | null = null
  private status: SigningStatus = { state: 'off' }
  private ignoring = false
  private sent = 0

  /**
   * Makes it.
   *
   * @param send how the mock sends to the page
   * @param host the rest of the mock
   */
  constructor(private readonly send: (e: Outgoing) => void, private readonly host: MockSigningHost) {}

  /**
   * What a test reads and does.
   *
   * @returns the control
   */
  control(): MockSigningControl {
    return {
      vehicleKey: () => this.vehicle?.fingerprint ?? null,
      resetVehicle: () => { this.vehicle = null },
      foreignKey: () => { this.vehicle = { fingerprint: digits(String(Math.random())), setAt: Date.now() } },
      ignoreSetup: ignore => { this.ignoring = ignore },
      setups: () => this.sent,
    }
  }

  /**
   * A subscription to `signing.status`.
   *
   * @param id the subscription
   */
  subscribe(id: number): void {
    this.subscribers.add(id)
    this.send({ k: 'response', id, s: id })
    this.send({ k: 'event', n: 'signing.status', s: id, p: this.status })
  }

  /**
   * A subscription ended.
   *
   * @param id the subscription
   */
  unsubscribe(id: number): void {
    this.subscribers.delete(id)
  }

  /** The host restarts the backend: nobody is subscribed. */
  reset(): void {
    this.subscribers.clear()
  }

  /** A vehicle connected: the link signs when the key kept is the vehicle's, as the backend finds from its heartbeats. */
  connected(): void {
    this.tell(this.found())
  }

  /** The vehicle is gone. */
  disconnected(): void {
    this.tell({ state: 'off' })
  }

  /**
   * What a connection finds.
   *
   * @returns the state
   */
  private found(): SigningStatus {
    const { vehicle, kept } = this
    if (!kept) {
      return { state: vehicle ? 'unknown-key' : 'off' }
    }

    return { state: sameKey(vehicle, kept) ? 'signed' : 'no-answer', ...kept }
  }

  /**
   * Says the state to every subscriber.
   *
   * @param status the state
   */
  private tell(status: SigningStatus): void {
    this.status = status

    for (const s of this.subscribers) {
      this.send({ k: 'event', n: 'signing.status', s, p: status })
    }
  }

  /**
   * `signing.provision`.
   *
   * @param ask a passphrase, or none for a random key
   * @param ok sends the answer
   * @param fail sends an error
   */
  provision(ask: SigningProvision | null, ok: (p: SigningStatus) => void, fail: Fail): void {
    const passphrase = ask?.passphrase
    const why = this.provisionRefusal(passphrase)
    if (why) {
      fail(...why)

      return
    }
    const key = { fingerprint: digits(passphrase ?? String(Math.random())), setAt: Date.now() }
    this.vehicle = key
    this.kept = key
    this.tell({ state: 'signed', ...key })
    ok(this.status)
  }

  /**
   * Why a provisioning is refused or not confirmed (a SETUP_SIGNING is sent when it gets that far), or null.
   *
   * @param passphrase the passphrase, or undefined for a random key
   * @returns the refusal
   */
  private provisionRefusal(passphrase: string | undefined): Refusal | null {
    const why = refusal(this.host) ?? invalid(passphrase)
    if (why) {
      return why
    }
    this.sent += 1

    const unanswered: Refusal = ['NOT_CONFIRMED', 'the vehicle did not confirm the key. Check that it supports signing.']

    return this.ignoring ? unanswered : null
  }

  /**
   * `signing.disable`.
   *
   * @param ok sends the answer
   * @param fail sends an error
   */
  disable(ok: (p: SigningStatus) => void, fail: Fail): void {
    const why = this.disableRefusal()
    if (why) {
      fail(...why)

      return
    }
    this.vehicle = null
    this.kept = null
    this.tell({ state: 'off' })
    ok(this.status)
  }

  /**
   * Why turning signing off is refused or not confirmed, or null. Over a radio a vehicle that signs takes it only signed with its
   * own key.
   *
   * @returns the refusal
   */
  private disableRefusal(): Refusal | null {
    const why = refusal(this.host)
    if (why) {
      return why
    }
    this.sent += 1
    const foreign = this.vehicle !== null && !sameKey(this.vehicle, this.kept)

    return foreign ? ['NOT_CONFIRMED', 'the vehicle did not confirm that signing is off.'] : null
  }
}
