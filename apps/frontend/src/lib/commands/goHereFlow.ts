// What a Go here does after the user picked a place and (if the setting asks) confirmed it, one step after the other; it STOPS
// at the first that
// does not go. The PLAN is made ONCE, when the command starts: the place, the altitude, the speed, the limits and the failsafe
// policy are what
// the user confirmed, and exactly those are sent, whatever is picked or changes while the steps wait. Then:
//  1. the vehicle is put in GUIDED (the backend never changes the mode itself) and the heartbeat is waited for to say so (up
// to 5 s);
//  2. the page's own gates are looked at again (the vehicle may have changed while it waited), with the plan's place;
//  3. the speed of the guided mode is set to the plan's speed (it STAYS so if the reposition is then refused: it is not put
// back);
//  4. the reposition is sent, ONCE, to the plan's place at the plan's altitude.
// Nothing is retried. What the backend refuses (the vehicle is not in the air, the place is outside the limits or the fence,
// the failsafe is
// off and the setting blocks ...) is told in words, and nothing is sent; what the vehicle answers is told as it answered. That
// the vehicle
// ARRIVES is what its position says, not this answer.
import type { FailsafePolicy, GuidedLimits } from '@/generated/app'
import type { ArmingResult } from '@/generated/app'
import type { CommandContext } from './command'
import { armingRefusalKeyOf, tellArming, tellArmingRefusal, tellArmingWith } from './armingReport'
import { WAITS, type Waits, guided } from './takeoffFlow'
import { type Place, altitudeToKeep, goHereBlock, limitsOf, speedOf } from '@/lib/fly/guided'

/** What the user confirmed. */
export interface GoPlan {
  /** The place. */
  target: Place
  /** Metres above home. */
  altitude: number
  /** Metres a second. */
  speed: number
  /** What the backend is told the limits are. */
  limits: GuidedLimits
  /** What to do when the vehicle's GCS failsafe is off. */
  failsafe: FailsafePolicy
}

/**
 * Whether two places are the same.
 *
 * @param a one
 * @param b the other
 * @returns true when they are
 */
export function samePlace(a: Place | null, b: Place | null): boolean {
  return a !== null && b !== null && a.lat === b.lat && a.lon === b.lon
}

/**
 * The plan of a Go here, from what is picked and what the vehicle reports NOW: made once, and kept.
 *
 * @param ctx the context
 * @returns the plan, or null when no place is picked
 */
export function planOf(ctx: CommandContext): GoPlan | null {
  const target = ctx.guided.target()
  if (target === null) {
    return null
  }
  const prefs = ctx.preferences.guided()

  return {
    target: { lat: target.lat, lon: target.lon },
    altitude: altitudeToKeep(ctx.vehicle.telemetry()),
    speed: speedOf(prefs),
    limits: limitsOf(prefs),
    failsafe: prefs.failsafe,
  }
}

/**
 * Tells a refusal of the backend (nothing was sent), or throws what is not one.
 *
 * @param ctx the context
 * @param kind what was asked
 * @param error what the call threw
 * @returns false: the flow stops
 */
function refused(ctx: CommandContext, kind: 'reposition' | 'speed', error: unknown): boolean {
  const key = armingRefusalKeyOf(kind, error)
  if (key === undefined) {
    throw error
  }
  tellArmingRefusal(ctx, kind, key)

  return false
}

/**
 * Looks at the page's own gates again with the plan's place (the vehicle may have changed while the mode was waited for), and
 * says what is
 * wrong.
 *
 * @param ctx the context
 * @param plan what was confirmed
 * @returns whether the vehicle is still ready
 */
function stillReady(ctx: CommandContext, plan: GoPlan): boolean {
  const why = goHereBlock({
    telemetry: ctx.vehicle.telemetry(),
    listComplete: ctx.params.listComplete(),
    target: plan.target,
    prefs: ctx.preferences.guided(),
  })
  if (why !== null) {
    ctx.toast({ id: 'goHere-stopped', severity: 'warning', long: true, text: ctx.say(`guided.reason.${why}`) })
  }

  return why === null
}

/**
 * Sets the speed of the guided mode.
 *
 * @param ctx the context
 * @param plan what was confirmed
 * @returns whether the vehicle accepted
 */
async function setSpeed(ctx: CommandContext, plan: GoPlan): Promise<boolean> {
  try {
    const result = await ctx.vehicle.setSpeed({ speed: plan.speed, limits: plan.limits })
    if (result.result !== 'accepted') {
      tellArming(ctx, 'speed', result)
    }

    return result.result === 'accepted'
  } catch (error) {
    return refused(ctx, 'speed', error)
  }
}

/**
 * Says what the vehicle answered, and the warning that went with it (the failsafe is off and the user chose to be warned).
 *
 * @param ctx the context
 * @param result what the vehicle said
 * @param plan what was confirmed
 */
function tellReposition(ctx: CommandContext, result: ArmingResult, plan: GoPlan): void {
  tellArmingWith(ctx, 'reposition', result, { altitude: plan.altitude, speed: plan.speed })

  if (result.result === 'accepted' && result.messages.length > 0) {
    ctx.toast({ id: 'goHere-warning', severity: 'warning', long: true, text: result.messages.join(' ') })
  }
}

/**
 * Sends the reposition to the planned place.
 *
 * @param ctx the context
 * @param plan what was confirmed
 * @returns whether the vehicle accepted
 */
async function reposition(ctx: CommandContext, plan: GoPlan): Promise<boolean> {
  try {
    const result = await ctx.vehicle.reposition({
      latitude: plan.target.lat,
      longitude: plan.target.lon,
      altitude: plan.altitude,
      limits: plan.limits,
      failsafe: plan.failsafe,
    })
    tellReposition(ctx, result, plan)

    return result.result === 'accepted'
  } catch (error) {
    return refused(ctx, 'reposition', error)
  }
}

/**
 * Whether the vehicle is in GUIDED, ready again, and has its speed.
 *
 * @param ctx the context
 * @param plan what was confirmed
 * @param waits how long the mode change may take to show
 * @returns whether the reposition may be sent
 */
async function prepared(ctx: CommandContext, plan: GoPlan, waits: Waits): Promise<boolean> {
  if (!await guided(ctx, waits) || !stillReady(ctx, plan)) {
    return false
  }

  return setSpeed(ctx, plan)
}

/**
 * Drops the picked place when it is still the planned one (another picked meanwhile is nobody's confirmed place: it stays).
 *
 * @param ctx the context
 * @param plan what was confirmed
 */
function dropIfStillPicked(ctx: CommandContext, plan: GoPlan): void {
  if (samePlace(ctx.guided.target(), plan.target)) {
    ctx.guided.clearTarget()
  }
}

/**
 * Flies to the place that was confirmed: GUIDED, the speed, the reposition. The picked place is dropped once the vehicle has
 * it, if it is
 * still that place (a click while the steps waited picked another, which nobody confirmed: it stays picked and is not sent).
 *
 * @param ctx the context
 * @param plan what was confirmed
 * @param waits how long the mode change may take to show
 * @returns whether the vehicle took it
 */
export async function goHere(ctx: CommandContext, plan: GoPlan, waits: Waits = WAITS): Promise<boolean> {
  const accepted = await prepared(ctx, plan, waits) && await reposition(ctx, plan)
  if (accepted) {
    dropIfStillPicked(ctx, plan)
  }

  return accepted
}
