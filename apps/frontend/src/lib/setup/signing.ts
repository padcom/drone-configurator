// What the Signing page and the status bar say of MAVLink signing (#33): the words and the mark of each state, why a change is
// not possible now, the words of the backend's refusals, and what is wrong with a passphrase. The key itself never reaches the
// page.
import type { IconName } from '@/lib/ui/icons'
import type { SigningStatus } from '@/generated/app'

/** The state of the link's signing. */
export type SigningState = SigningStatus['state']

/** How a state is shown: its icon, its tone and its messages. */
export interface SigningLook {
  /** The icon beside the word. */
  icon: IconName
  /** `ok` signed, `warn` the vehicle does not answer with the key held (or signs with another), `none` not signed. */
  tone: 'ok' | 'warn' | 'none'
  /** The word of the status bar. */
  wordKey: string
  /** The heading of the page's state. */
  titleKey: string
  /** What it means, and what to do. */
  noteKey: string
}

/**
 * A look.
 *
 * @param icon the icon
 * @param tone the tone
 * @param word the status bar's word (under `topBar.signing`)
 * @param id the page's messages (under `setup.signing.state` and `setup.signing.note`)
 * @returns the look
 */
function look(icon: IconName, tone: SigningLook['tone'], word: string, id: string): SigningLook {
  const wordKey = `topBar.signing.${word}`

  return { icon, tone, wordKey, titleKey: `setup.signing.state.${id}`, noteKey: `setup.signing.note.${id}` }
}

const LOOKS: Record<SigningState, SigningLook> = {
  'off': look('unlock', 'none', 'off', 'off'),
  'signed': look('lock', 'ok', 'signed', 'signed'),
  'no-answer': look('warning', 'warn', 'notSigned', 'noAnswer'),
  'unknown-key': look('warning', 'warn', 'notSigned', 'unknownKey'),
}

/**
 * How a state is shown.
 *
 * @param state the state
 * @returns its look
 */
export function signingLook(state: SigningState): SigningLook {
  return LOOKS[state]
}

/**
 * Why the armed state stops a change, or null.
 *
 * @param armed the armed state: undefined when it is not known
 * @returns the message's key, or null
 */
function armedBlock(armed: boolean | undefined): string | null {
  if (armed === undefined) {
    return 'setup.signing.blocked.unknown'
  }

  return armed ? 'setup.signing.blocked.armed' : null
}

/**
 * Why signing may not be changed now, as a message, or null when it may: the vehicle must be connected and known to be
 * disarmed (an unknown state counts as armed), and nothing else may be under way.
 *
 * @param connected whether a vehicle is connected
 * @param armed the armed state: undefined when it is not known
 * @param busy whether a change is under way
 * @returns the message's key, or null
 */
export function signingBlocked(connected: boolean, armed: boolean | undefined, busy: boolean): string | null {
  if (!connected) {
    return 'setup.signing.blocked.offline'
  }

  return armedBlock(armed) ?? (busy ? 'setup.signing.blocked.busy' : null)
}

/** The refusals the page has its own words for. */
const KNOWN_CODES = new Set([
  'NOT_CONNECTED', 'ARMED', 'STATE_UNKNOWN', 'BUSY', 'NO_VEHICLE_ID', 'INVALID_VALUE', 'NOT_SAVED', 'NOT_CONFIRMED', 'ABORTED',
])

/**
 * The message for a refusal of the backend.
 *
 * @param code its code
 * @returns the message's key (a code the page has no words for has the general one)
 */
export function signingErrorKey(code: string): string {
  return `setup.signing.error.${KNOWN_CODES.has(code) ? code : 'other'}`
}

/** The longest passphrase the backend takes (characters). */
export const MAX_PASSPHRASE = 256

/**
 * What is wrong with a passphrase, or null.
 *
 * @param text the passphrase
 * @returns `empty`, `long`, or null
 */
export function passphraseProblem(text: string): 'empty' | 'long' | null {
  if (text.length === 0) {
    return 'empty'
  }

  return text.length > MAX_PASSPHRASE ? 'long' : null
}
