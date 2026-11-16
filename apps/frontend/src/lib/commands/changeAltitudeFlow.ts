// What a change of altitude does after the user typed an altitude and pressed the button (the dialog's), one step after the
// other; it STOPS at the
// first that does not go. The altitude, the limits and the failsafe policy are taken ONCE, when the flow starts, and exactly
// those are sent:
//  1. the vehicle is put in GUIDED if it is not in it (the backend never changes the mode itself), and the heartbeat is waited
// for;
//  2. the page's own gates are looked at again (the vehicle may have changed while it waited; the vehicle STAYS in GUIDED if
// they now fail,
//     and the stop says so);
//  3. ONE change of altitude is sent: the backend flies the vehicle to its own fresh position at the new altitude, which holds
// it there and
//     cancels what it was flying to.
// Nothing is retried. What the backend refuses is told in words and nothing is sent; what the vehicle answers is told as it
// answered.
import type { ArmingResult } from '@/generated/app'
import type { CommandContext } from './command'
import { armingRefusalKeyOf, tellArmingRefusal, tellArmingWith } from './armingReport'
import { WAITS, type Waits, guided } from './takeoffFlow'
import { type GuidedPreferences, changeAltitudeBlock, limitsOf } from '@/lib/fly/guided'

/**
 * Looks at the page's own gates again after the wait for GUIDED, and says what is wrong (and that the vehicle stays in GUIDED).
 *
 * @param ctx the context
 * @param switched whether the vehicle was put in GUIDED by this flow
 * @returns whether the vehicle is still ready
 */
function stillReady(ctx: CommandContext, switched: boolean): boolean {
  const why = changeAltitudeBlock({ telemetry: ctx.vehicle.telemetry(), listComplete: ctx.params.listComplete() })
  if (why !== null) {
    const kept = switched ? ` ${ctx.say('guided.reason.keptGuided')}` : ''
    ctx.toast({ id: 'altitude-stopped', severity: 'warning', long: true, text: `${ctx.say(`guided.reason.${why}`)}${kept}` })
  }

  return why === null
}

/**
 * Says what the vehicle answered, and the warning that went with it (the failsafe is off and the user chose to be warned).
 *
 * @param ctx the context
 * @param result what the vehicle said
 * @param altitude the altitude that was asked for
 */
function tellAltitude(ctx: CommandContext, result: ArmingResult, altitude: number): void {
  tellArmingWith(ctx, 'altitude', result, { altitude })

  if (result.result === 'accepted' && result.messages.length > 0) {
    ctx.toast({ id: 'altitude-warning', severity: 'warning', long: true, text: result.messages.join(' ') })
  }
}

/**
 * Tells a refusal of the backend (nothing was sent), or throws what is not one.
 *
 * @param ctx the context
 * @param error what the call threw
 */
function tellRefusal(ctx: CommandContext, error: unknown): void {
  const key = armingRefusalKeyOf('altitude', error)
  if (key === undefined) {
    throw error
  }
  tellArmingRefusal(ctx, 'altitude', key)
}

/**
 * Sends the change of altitude.
 *
 * @param ctx the context
 * @param altitude metres above home
 * @param prefs what the user chose, as it was when the flow started
 * @returns whether the vehicle accepted
 */
async function send(ctx: CommandContext, altitude: number, prefs: GuidedPreferences): Promise<boolean> {
  try {
    const result = await ctx.vehicle.changeAltitude({ altitude, limits: limitsOf(prefs), failsafe: prefs.failsafe })
    tellAltitude(ctx, result, altitude)

    return result.result === 'accepted'
  } catch (error) {
    tellRefusal(ctx, error)

    return false
  }
}

/**
 * Goes to another altitude where the vehicle is: GUIDED first if it is not in it, the gates again, and one change of altitude.
 *
 * @param ctx the context
 * @param altitude metres above home (the dialog has checked it against the user's limits; the backend does again)
 * @param waits how long the mode change may take to show
 * @returns whether the vehicle took it
 */
export async function changeAltitude(ctx: CommandContext, altitude: number, waits: Waits = WAITS): Promise<boolean> {
  const prefs = ctx.preferences.guided()
  const switched = ctx.vehicle.mode() !== 'GUIDED'
  if (!await guided(ctx, waits) || !stillReady(ctx, switched)) {
    return false
  }

  return send(ctx, altitude, prefs)
}
