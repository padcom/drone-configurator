// What a Go here does after the user picked a place and (if the setting asks) confirmed it, one step after the other; it STOPS
// at the first that
// does not go:
//  1. the vehicle is put in GUIDED (the backend never changes the mode itself) and the heartbeat is waited for to say so;
//  2. the speed of the guided mode is set to the user's setting (never above their greatest speed);
//  3. the reposition is sent, ONCE, to the place picked, at the altitude the vehicle has now (within 2 m and the highest the
// user allows).
// Nothing is retried. What the backend refuses (the vehicle is not in the air, the place is outside the limits or the fence, the
// failsafe is off and the setting blocks ...) is told in words, and nothing is sent; what the vehicle answers is told as it
// answered.
// That the vehicle ARRIVES is what its position says, not this answer.
import type { ArmingResult } from '@/generated/app'
import type { CommandContext } from './command'
import { armingRefusalKeyOf, tellArming, tellArmingRefusal, tellArmingWith } from './armingReport'
import { WAITS, type Waits, guided } from './takeoffFlow'
import { altitudeToKeep, limitsOf, speedOf } from '@/lib/fly/guided'

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
 * Sets the speed of the guided mode to the user's setting.
 *
 * @param ctx the context
 * @returns whether the vehicle accepted
 */
async function setSpeed(ctx: CommandContext): Promise<boolean> {
  const prefs = ctx.preferences.guided()
  try {
    const result = await ctx.vehicle.setSpeed({ speed: speedOf(prefs), limits: limitsOf(prefs) })
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
 * @param altitude the altitude that was asked for
 */
function tellReposition(ctx: CommandContext, result: ArmingResult, altitude: number): void {
  tellArmingWith(ctx, 'reposition', result, { altitude, speed: speedOf(ctx.preferences.guided()) })

  if (result.result === 'accepted' && result.messages.length > 0) {
    ctx.toast({ id: 'goHere-warning', severity: 'warning', long: true, text: result.messages.join(' ') })
  }
}

/**
 * Sends the reposition to the picked place.
 *
 * @param ctx the context
 * @returns whether the vehicle accepted
 */
async function reposition(ctx: CommandContext): Promise<boolean> {
  const target = ctx.guided.target()
  const prefs = ctx.preferences.guided()
  if (target === null) {
    return false
  }
  const altitude = altitudeToKeep(ctx.vehicle.telemetry(), prefs)
  try {
    const result = await ctx.vehicle.reposition({
      latitude: target.lat, longitude: target.lon, altitude, limits: limitsOf(prefs), failsafe: prefs.failsafe,
    })
    tellReposition(ctx, result, altitude)

    return result.result === 'accepted'
  } catch (error) {
    return refused(ctx, 'reposition', error)
  }
}

/**
 * Whether the vehicle is ready for the steps: there is a place, it is in GUIDED, and it has its speed.
 *
 * @param ctx the context
 * @param waits how long the mode change may take to show
 * @returns whether the reposition may be sent
 */
async function prepared(ctx: CommandContext, waits: Waits): Promise<boolean> {
  if (ctx.guided.target() === null || !await guided(ctx, waits)) {
    return false
  }

  return setSpeed(ctx)
}

/**
 * Flies to the place that was picked: GUIDED, the speed, the reposition. The place is dropped once the vehicle has it.
 *
 * @param ctx the context
 * @param waits how long the mode change may take to show
 * @returns whether the vehicle took it
 */
export async function goHere(ctx: CommandContext, waits: Waits = WAITS): Promise<boolean> {
  const accepted = await prepared(ctx, waits) && await reposition(ctx)
  if (accepted) {
    ctx.guided.clearTarget()
  }

  return accepted
}
