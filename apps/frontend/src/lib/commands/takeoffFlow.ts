// What the Take off button does after the altitude was chosen, one step after the other; it STOPS at the first that does not go:
//  1. the vehicle is put in GUIDED (the app's own rule: a Copter would take off in LOITER or POSHOLD too, but the guided takeoff
//     is the one this app asks for), and the heartbeat is waited for to say so;
//  2. a disarmed vehicle is armed: when its checks do not pass the review is shown and the flow ends there (arm from the review,
//     then take off again: nothing is skipped); otherwise the hold of "Arm the vehicle" is asked (the same command, the same
//     hold), and the heartbeat is waited for to say armed;
//  3. NAV_TAKEOFF is sent, once. A takeoff that was refused, or that nothing answered, is told and not sent again.
// Nothing is retried and nothing waits for ever: ArduPilot disarms a vehicle that does not take off soon after it armed, so the
// takeoff follows the arm at once. What the vehicle then does is what its position says.
import type { CommandContext } from './command'
import { armingRefusalKeyOf, tellArming, tellArmingRefusal, tellArmingWith } from './armingReport'
import { checksOf, needsReview } from '@/lib/fly/prearm'

/** How long each wait lasts (ms), and how often it looks. */
export interface Waits {
  /** How often the heartbeat is looked at. */
  pollMs: number
  /** How long the mode change may take to show in the heartbeat. */
  modeMs: number
  /** How long the arm may take to show in the heartbeat (the hold itself is not counted: it is the user's). */
  armMs: number
}

/** What the page uses. */
export const WAITS: Waits = { pollMs: 100, modeMs: 5000, armMs: 6000 }

/** The name the vehicle kind gives the mode a takeoff is asked in. */
const GUIDED = 'GUIDED'

/**
 * Waits until something is so, or the time is up.
 *
 * @param test what to look at
 * @param ms for how long at most
 * @param pollMs how often
 * @returns whether it was so
 */
async function until(test: () => boolean, ms: number, pollMs: number): Promise<boolean> {
  for (let waited = 0; waited <= ms; waited += pollMs) {
    if (test()) {
      return true
    }
    // eslint-disable-next-line no-await-in-loop -- a poll, one look after the other
    await new Promise<void>(resolve => {
      setTimeout(resolve, pollMs)
    })
  }

  return test()
}

/**
 * Says why the flow stopped.
 *
 * @param ctx the context
 * @param key the message that says it
 */
function stopped(ctx: CommandContext, key: string): void {
  ctx.toast({ id: 'takeoff', severity: 'warning', long: true, text: ctx.say(key) })
}

/**
 * Tells a refusal of the backend (nothing was sent), or throws what is not one.
 *
 * @param ctx the context
 * @param kind what was asked
 * @param error what the call threw
 * @returns false: the flow stops
 */
function refused(ctx: CommandContext, kind: 'mode' | 'takeoff', error: unknown): boolean {
  const key = armingRefusalKeyOf(kind, error)
  if (key === undefined) {
    throw error
  }
  tellArmingRefusal(ctx, kind, key)

  return false
}

/**
 * Sends the change of mode; what the vehicle answers other than yes is told.
 *
 * @param ctx the context
 * @param number the number of the mode
 * @returns whether the vehicle accepted
 */
async function sendMode(ctx: CommandContext, number: number): Promise<boolean> {
  try {
    const result = await ctx.vehicle.setMode(number)
    if (result.result !== 'accepted') {
      tellArming(ctx, 'mode', result)
    }

    return result.result === 'accepted'
  } catch (error) {
    return refused(ctx, 'mode', error)
  }
}

/**
 * Asks for GUIDED.
 *
 * @param ctx the context
 * @returns whether the vehicle accepted
 */
function askForGuided(ctx: CommandContext): Promise<boolean> {
  const number = ctx.vehicle.modes()?.modes.find(mode => mode.name === GUIDED)?.number
  if (number === undefined) {
    stopped(ctx, 'takeoff.step.noGuided')

    return Promise.resolve(false)
  }

  return sendMode(ctx, number)
}

/**
 * Puts the vehicle in GUIDED and waits for the heartbeat to say so.
 *
 * @param ctx the context
 * @param waits the waits
 * @returns whether the vehicle is in GUIDED now
 */
async function guided(ctx: CommandContext, waits: Waits): Promise<boolean> {
  if (ctx.vehicle.mode() === GUIDED) {
    return true
  }
  if (!await askForGuided(ctx)) {
    return false
  }
  const there = await until(() => ctx.vehicle.mode() === GUIDED, waits.modeMs, waits.pollMs)
  if (!there) {
    stopped(ctx, 'takeoff.step.notGuided')
  }

  return there
}

/**
 * Whether a disarmed vehicle may be armed now: its state is known, and its checks do not say they fail (when they do, the review
 * is shown instead, and the flow ends there).
 *
 * @param ctx the context
 * @returns whether the arm may be asked for
 */
function mayArm(ctx: CommandContext): boolean {
  if (ctx.vehicle.armed() !== false) {
    stopped(ctx, 'takeoff.step.stateUnknown')

    return false
  }
  if (needsReview(checksOf(ctx.vehicle.telemetry()))) {
    ctx.dialogs.showArmReview()
    stopped(ctx, 'takeoff.step.review')

    return false
  }

  return true
}

/**
 * Asks for the arm and waits for the heartbeat to say armed.
 *
 * @param ctx the context
 * @param armIt runs the arm command (its hold, and the answer it tells)
 * @param waits the waits
 * @returns whether the vehicle is armed now
 */
async function armAndWait(ctx: CommandContext, armIt: () => Promise<void>, waits: Waits): Promise<boolean> {
  await armIt()
  const there = await until(() => ctx.vehicle.telemetry()?.armed === true, waits.armMs, waits.pollMs)
  if (!there) {
    stopped(ctx, 'takeoff.step.notArmed')
  }

  return there
}

/**
 * The vehicle armed: it already is (what the heartbeat says, not what was answered), or it is armed now.
 *
 * @param ctx the context
 * @param armIt runs the arm command
 * @param waits the waits
 * @returns whether the vehicle is armed now
 */
function armed(ctx: CommandContext, armIt: () => Promise<void>, waits: Waits): Promise<boolean> {
  if (ctx.vehicle.telemetry()?.armed === true) {
    return Promise.resolve(true)
  }

  return mayArm(ctx) ? armAndWait(ctx, armIt, waits) : Promise.resolve(false)
}

/**
 * Sends the takeoff, once, and tells what came of it.
 *
 * @param ctx the context
 * @param altitude metres above home
 */
async function sendTakeoff(ctx: CommandContext, altitude: number): Promise<void> {
  try {
    tellArmingWith(ctx, 'takeoff', await ctx.vehicle.takeoff(altitude), { altitude })
  } catch (error) {
    refused(ctx, 'takeoff', error)
  }
}

/**
 * Takes off to an altitude: the vehicle in GUIDED, armed, and then the takeoff, each step only if the one before it came out.
 *
 * @param ctx the context
 * @param altitude metres above home (the dialog has checked it against the limits; the backend does again)
 * @param armIt runs the arm command
 * @param waits the waits
 */
export async function takeOff(
  ctx: CommandContext,
  altitude: number,
  armIt: () => Promise<void>,
  waits: Waits = WAITS,
): Promise<void> {
  if (!await guided(ctx, waits)) {
    return
  }
  if (await armed(ctx, armIt, waits)) {
    await sendTakeoff(ctx, altitude)
  }
}
