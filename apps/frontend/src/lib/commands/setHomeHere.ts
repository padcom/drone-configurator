// Set home here, as a command: home moves to where the vehicle is now, and Return home (RTL) flies there from now on. That is
// a change of where
// the vehicle goes when something goes wrong, so it is a HOLD (the leader's decision) and the question says so: RTL now flies
// to this point, and
// home's altitude moves with it (every altitude above home changes its reference). It is offered to a connected vehicle whose
// state is known,
// armed or not, with a fresh position, that stands still (not in the middle of a climb: the altitude of home moves). Sent
// once; the backend
// refuses before it sends what the vehicle must not be asked (`NOT_HOVERING`, `STALE_POSITION`, ...).
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { connectionBlocker, namedVehicle, no, rcBlocker, workBlocker } from './arming'
import { armingRefusalKeyOf, tellArming, tellArmingRefusal } from './armingReport'
import { VEHICLE_GROUP } from './vehicle'
import { homeHereBlock } from '@/lib/fly/guided'
import type { SafetyOptions } from '@/lib/app/safety'

/**
 * Whether the vehicle's state is known (armed or not: both may set home).
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function stateBlocker(ctx: CommandContext): string | null {
  return ctx.vehicle.armed() === undefined ? 'palette.reason.stateUnknown' : null
}

/**
 * What the rules of guided control say is missing.
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function homeBlocker(ctx: CommandContext): string | null {
  const why = homeHereBlock(ctx.vehicle.telemetry())

  return why === null ? null : `guided.reason.${why}`
}

/**
 * Where the vehicle is, as text for the question (its position, in degrees).
 *
 * @param ctx the context
 * @returns the latitude and the longitude
 */
function whereIs(ctx: CommandContext): { lat: string, lon: string } {
  const position = ctx.vehicle.telemetry()?.position

  return position === undefined ? { lat: '', lon: '' } : { lat: position.lat.toFixed(5), lon: position.lon.toFixed(5) }
}

// What stands in the way of a set of home here, in the order the user should see it.
const BLOCKERS: readonly ((ctx: CommandContext) => string | null)[] = [
  ctx => connectionBlocker(ctx.vehicle),
  stateBlocker,
  ctx => workBlocker(ctx.vehicle),
  rcBlocker,
  homeBlocker,
]

/**
 * Sets home to where the vehicle is, and says what the vehicle answered (and, once it accepted, what RTL does now).
 *
 * @param ctx the context
 * @returns whether the vehicle accepted
 */
export async function setHomeHere(ctx: CommandContext): Promise<boolean> {
  try {
    const result = await ctx.vehicle.setHomeHere()
    tellArming(ctx, 'home', result)

    if (result.result === 'accepted') {
      ctx.toast({ id: 'home-set', severity: 'warning', long: true, text: ctx.say('guided.home.done') })
    }

    return result.result === 'accepted'
  } catch (error) {
    const key = armingRefusalKeyOf('home', error)
    if (key === undefined) {
      throw error
    }
    tellArmingRefusal(ctx, 'home', key)

    return false
  }
}

/** Sets home to where the vehicle is. */
export class SetHomeHere implements Command {
  readonly id = 'vehicle.setHomeHere'

  readonly labelKey = 'guided.command.homeLabel'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'warning'

  // Where the vehicle goes when something goes wrong: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  readonly keywordKeys = ['guided.command.homeKeywords']

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
   * The question before it runs: a HOLD, and it says what changes (where RTL goes, and home's altitude).
   *
   * @param ctx the context
   * @returns what to ask
   */
  confirmation(ctx: CommandContext): SafetyOptions {
    return {
      title: ctx.say('guided.home.title'),
      what: ctx.say('guided.home.what', whereIs(ctx)),
      vehicle: namedVehicle(ctx),
      level: 'hold',
      tone: 'warn',
      dismissal: 'cross',
      confirmLabel: ctx.say('guided.home.button'),
    }
  }

  /**
   * Sets it.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await setHomeHere(ctx)

    return { focus: 'restore' }
  }
}
