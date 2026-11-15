// What the vehicle says of its pre-arm checks, for the flight controls and the review before arming: whether they pass (its
// SYS_STATUS bit), and the reasons, which are ITS OWN WORDS ("PreArm: ..."), read from the messages it has sent lately. ArduPilot
// does not print the same pre-arm text again at once, so the answer to an arm may carry none: the reasons are what it said
// in the last two minutes, whenever. Nothing is made up and nothing is judged here: a text is shown as it came.
import type { Telemetry, VehicleMessage } from '@/generated/app'

/** How the vehicle says its checks are. */
export type ChecksState = 'passing' | 'failing' | 'off' | 'unknown'

/** How long a text counts as lately said (ms). */
export const REASON_WINDOW_MS = 120_000

/**
 * Whether there is something to review before arming: the vehicle says its checks do not pass, or does not say. Checks that pass
 * (and checks that are off: the vehicle will not ask) leave nothing to review.
 *
 * @param checks what the vehicle says of its checks
 * @returns true when the review comes first
 */
export function needsReview(checks: ChecksState): boolean {
  return checks === 'failing' || checks === 'unknown'
}

/** The beginnings of the texts that are a reason an arm is refused ("PreArm: ..." and "Arm: ..."). */
const PREFIXES = ['PreArm', 'Arm:']

/** One reason: the vehicle's words, and how long ago it said them. */
export interface Reason {
  /** The text as the vehicle sent it. */
  text: string
  /** How long ago (ms). */
  ageMs: number
}

/**
 * What the pre-arm group says.
 *
 * @param group the group
 * @returns how the checks are
 */
function stateOfGroup(group: NonNullable<Telemetry['prearm']>): ChecksState {
  if (!group.enabled) {
    return 'off'
  }

  return group.passing ? 'passing' : 'failing'
}

/**
 * How the vehicle says its pre-arm checks are.
 *
 * @param telemetry the latest telemetry, or null
 * @returns `passing`, `failing`, `off` (the vehicle has every arming check off: it arms without looking), or `unknown`
 */
export function checksOf(telemetry: Telemetry | null): ChecksState {
  return telemetry?.prearm === undefined ? 'unknown' : stateOfGroup(telemetry.prearm)
}

/**
 * The reasons the vehicle gave lately: its PreArm and Arm texts of the last two minutes, each once (the latest time it said it),
 * the oldest first.
 *
 * @param messages the messages the vehicle sent, oldest first
 * @param now now (ms since 1970)
 * @returns the reasons
 */
export function reasonsOf(messages: readonly VehicleMessage[], now: number): Reason[] {
  const latest = new Map<string, number>()
  for (const message of messages) {
    const time = Number(message.time)
    if (now - time <= REASON_WINDOW_MS && PREFIXES.some(prefix => message.text.startsWith(prefix))) {
      latest.set(message.text, time)
    }
  }

  return [...latest].sort((a, b) => a[1] - b[1]).map(([text, time]) => ({ text, ageMs: Math.max(0, now - time) }))
}
