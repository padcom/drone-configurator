// Go here, as a command (the map's button; the palette lists it too). It is offered to a connected, armed vehicle whose state
// is known, in the
// air, with the complete list of its parameters (the backend reads its fence by it), with a place picked on the map that is
// within the
// distance the user allows from home. How it is confirmed is the user's setting (Settings): not at all, a plain confirmation
// (the default)
// that says how far, how high and how fast, or a hold. The flow after the confirmation is goHereFlow.ts.
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { connectionBlocker, namedVehicle, no, workBlocker } from './arming'
import { goHere } from './goHereFlow'
import { VEHICLE_GROUP } from './vehicle'
import { type GuidedPreferences, type Place, altitudeToKeep, distanceM, goHereBlock, speedOf } from '@/lib/fly/guided'
import type { SafetyOptions } from '@/lib/app/safety'

/**
 * Whether the vehicle's state is known and it is armed.
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function armedBlocker(ctx: CommandContext): string | null {
  const armed = ctx.vehicle.armed()
  if (armed === undefined) {
    return 'palette.reason.stateUnknown'
  }

  return armed ? null : 'palette.reason.notArmed'
}

/**
 * How far a place is from a position that may not be known: whole metres, 0 when it is not.
 *
 * @param from where the distance is measured from
 * @param to the place
 * @returns metres
 */
function metresFrom(from: Place | undefined, to: Place): number {
  return from === undefined ? 0 : Math.round(distanceM(from, to))
}

/**
 * What the words of the confirmation say: how far the place is from the vehicle and from home, how high it goes and how fast.
 *
 * @param ctx the context
 * @param target the place
 * @param prefs what the user chose
 * @returns what to put in the message
 */
function facts(ctx: CommandContext, target: Place, prefs: GuidedPreferences): Record<string, number> {
  const telemetry = ctx.vehicle.telemetry()

  return {
    distance: metresFrom(telemetry?.position, target),
    fromHome: metresFrom(telemetry?.home, target),
    altitude: altitudeToKeep(telemetry, prefs),
    speed: speedOf(prefs),
  }
}

/**
 * What the rules of guided control say is missing.
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function guidedBlocker(ctx: CommandContext): string | null {
  const why = goHereBlock({
    telemetry: ctx.vehicle.telemetry(),
    listComplete: ctx.params.listComplete(),
    target: ctx.guided.target(),
    prefs: ctx.preferences.guided(),
  })

  return why === null ? null : `guided.reason.${why}`
}

// What stands in the way of a Go here, in the order the user should see it.
const BLOCKERS: readonly ((ctx: CommandContext) => string | null)[] = [
  ctx => connectionBlocker(ctx.vehicle),
  armedBlocker,
  ctx => workBlocker(ctx.vehicle),
  guidedBlocker,
]

/** Flies to the place that was picked on the map. */
export class GoHere implements Command {
  readonly id = 'vehicle.goHere'

  readonly labelKey = 'guided.command.label'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'navigation'

  // The vehicle moves: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  readonly keywordKeys = ['guided.command.keywords']

  /**
   * May it run now?
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const key = BLOCKERS.map(blocker => blocker(ctx)).find(reason => reason !== null)

    return key === undefined || key === null ? { enabled: true } : no(key)
  }

  /**
   * The question before it runs, as the user's setting says (none: nothing is asked).
   *
   * @param ctx the context
   * @returns what to ask, or null
   */
  confirmation(ctx: CommandContext): SafetyOptions | null {
    const prefs = ctx.preferences.guided()
    const target = ctx.guided.target()
    if (prefs.confirmation === 'none' || target === null) {
      return null
    }
    const mode = ctx.vehicle.mode() === 'GUIDED' ? '' : ` ${ctx.say('guided.command.mode')}`

    return {
      title: ctx.say('guided.command.title'),
      what: `${ctx.say('guided.command.what', facts(ctx, target, prefs))}${mode}`,
      vehicle: namedVehicle(ctx),
      level: prefs.confirmation,
      tone: 'warn',
      confirmLabel: ctx.say('guided.command.button'),
    }
  }

  /**
   * Flies there.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await goHere(ctx)

    return { focus: 'restore' }
  }
}
