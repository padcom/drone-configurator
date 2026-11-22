// Arming, disarming and the flight mode, as commands (the palette; the buttons of the next change run the same ones).
//  - ARM asks for a HOLD, and is offered only to a vehicle that is known to be disarmed. There is no forced arm: the vehicle runs
//    its pre-arm checks, and what it refuses with ("PreArm: ...") is shown. DISARM asks for a hold too, and is offered only to a
//    vehicle that is known to be armed (the vehicle itself refuses a disarm in flight: the emergency stop is another thing).
//  - A change of the flight mode asks nothing of a disarmed vehicle, and nothing of RTL, Land, Loiter and Brake (one deliberate
//    press: delay is the hazard); of an armed vehicle (or one whose state is not known: that counts as armed) it asks a plain
//    confirmation naming the mode, unless the user chose in Settings that it asks nothing.
//  - Every answer is TOLD, never assumed: what the vehicle is now is what its next heartbeat says. A command that nothing
//    answered is not sent again.
// The backend checks everything again before it sends: this page's view of the vehicle may be late.
import type { ArmAnswer, Availability, Command, CommandContext, CommandOutcome, VehicleFacts } from './command'
import type { SafetyOptions } from '@/lib/app/safety'
import { type ArmingKind, armingRefusalKeyOf, tellArming, tellArmingRefusal } from './armingReport'
import { VEHICLE_GROUP } from './vehicle'

/**
 * A reason a command may not run, as the palette shows it.
 *
 * @param reasonKey the message that says it
 * @param reasonParams what the message names
 * @returns the availability
 */
export const no = (reasonKey: string, reasonParams?: Record<string, unknown>): Availability => (
  { enabled: false, reasonKey, reasonParams }
)

/**
 * Whether there is a connected vehicle.
 *
 * @param vehicle the vehicle's facts
 * @returns the reason it may not be commanded, or null
 */
export function connectionBlocker(vehicle: VehicleFacts): string | null {
  return vehicle.connection().state === 'connected' ? null : 'palette.reason.notConnected'
}

/**
 * Whether the vehicle is in the state a command needs: known, and armed or disarmed as it says.
 *
 * @param armed what the vehicle's state is (undefined when it is not known)
 * @param needsArmed whether the command needs an armed vehicle
 * @returns the reason it may not run, or null
 */
function armedBlocker(armed: boolean | undefined, needsArmed: boolean): string | null {
  if (armed === undefined) {
    return 'palette.reason.stateUnknown'
  }
  if (armed === needsArmed) {
    return null
  }

  return needsArmed ? 'palette.reason.notArmed' : 'palette.reason.alreadyArmed'
}

/**
 * Whether parameter work stands in the way.
 *
 * @param vehicle the vehicle's facts
 * @returns the reason, or null
 */
export function workBlocker(vehicle: VehicleFacts): string | null {
  const busy = vehicle.busy()

  return busy === null ? null : `palette.reason.${busy}`
}

/**
 * The vehicle as a question names it.
 *
 * @param ctx the context
 * @returns its name, or an empty string when none is connected
 */
export function namedVehicle(ctx: CommandContext): string {
  const info = ctx.vehicle.connection().vehicle

  return info === undefined ? '' : ctx.say('topBar.vehicleValue', { ...info })
}

/** What sends a command to the vehicle. */
type Sender = () => ReturnType<VehicleFacts['arm']>

/**
 * Sends a command to the vehicle once, and tells what came of it.
 *
 * @param ctx the context
 * @param kind what is asked
 * @param send sends it (the backend's call)
 * @returns what a command leaves behind
 */
async function sendAndTell(ctx: CommandContext, kind: ArmingKind, send: Sender): Promise<CommandOutcome> {
  let answer: ArmAnswer = 'not-sent'
  try {
    const result = await send()
    answer = result.result
    tellArming(ctx, kind, result)
  } catch (error) {
    const refusedBy = armingRefusalKeyOf(kind, error)
    if (refusedBy === undefined) {
      throw error
    }
    // The backend looked again, and would not send it (the page's view was late): told, and nothing was sent.
    tellArmingRefusal(ctx, kind, refusedBy)
  }

  return { focus: 'restore', answer }
}

/** Arms the vehicle: a hold; the vehicle runs its own pre-arm checks. */
export class ArmVehicle implements Command {
  readonly id = 'vehicle.arm'

  readonly labelKey = 'palette.vehicle.arm.label'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'warning'

  // The motors can spin after it: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  readonly keywordKeys = ['palette.vehicle.arm.keywords']

  /**
   * May it run now? Only for a connected vehicle that is known to be disarmed, with no parameter work under way.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const { vehicle } = ctx
    const key = connectionBlocker(vehicle) ?? armedBlocker(vehicle.armed(), false) ?? workBlocker(vehicle)

    return key === null ? { enabled: true } : no(key)
  }

  /**
   * The question before it runs: a hold, never a single press.
   *
   * @param ctx the context
   * @returns what to ask
   */
  confirmation(ctx: CommandContext): SafetyOptions {
    return {
      title: ctx.say('palette.vehicle.arm.title'),
      what: ctx.say('palette.vehicle.arm.what'),
      vehicle: namedVehicle(ctx),
      level: 'hold',
      tone: 'warn',
      dismissal: 'cross',
      confirmLabel: ctx.say('palette.vehicle.arm.button'),
    }
  }

  /**
   * Asks the vehicle to arm, once, with its pre-arm checks on.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  execute(ctx: CommandContext): Promise<CommandOutcome> {
    return sendAndTell(ctx, 'arm', async () => {
      const result = await ctx.vehicle.arm()
      // Refused: the review shows what the vehicle said (its recent texts) and runs its checks again; the toast only says it.
      if (result.result === 'refused') {
        ctx.dialogs.showArmReview()
      }

      return result
    })
  }
}

/** Disarms the vehicle: a hold. A vehicle in flight refuses (the vehicle does); the emergency stop is another thing. */
export class DisarmVehicle implements Command {
  readonly id = 'vehicle.disarm'

  readonly labelKey = 'palette.vehicle.disarm.label'

  readonly buttonLabelKey = 'palette.vehicle.disarm.short'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'warning'

  readonly dangerous = true

  readonly keywordKeys = ['palette.vehicle.disarm.keywords']

  /**
   * May it run now? Only for a connected vehicle that is known to be armed (parameter work does not stand in its way).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const { vehicle } = ctx
    const key = connectionBlocker(vehicle) ?? armedBlocker(vehicle.armed(), true)

    return key === null ? { enabled: true } : no(key)
  }

  /**
   * The question before it runs: a hold.
   *
   * @param ctx the context
   * @returns what to ask
   */
  confirmation(ctx: CommandContext): SafetyOptions {
    return {
      title: ctx.say('palette.vehicle.disarm.title'),
      what: ctx.say('palette.vehicle.disarm.what'),
      vehicle: namedVehicle(ctx),
      level: 'hold',
      tone: 'warn',
      confirmLabel: ctx.say('palette.vehicle.disarm.button'),
    }
  }

  /**
   * Asks the vehicle to disarm, once.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  execute(ctx: CommandContext): Promise<CommandOutcome> {
    return sendAndTell(ctx, 'disarm', () => ctx.vehicle.disarm())
  }
}

/**
 * The emergency stop: a forced disarm that works in flight: the motors stop WHERE THE VEHICLE IS, and it falls. A hold in the
 * error tone, offered to a connected vehicle that is armed or may be (a state that is not known counts as armed: the armed flag
 * lags the vehicle), and it is NOT in the palette and has no key: the only way to it is the "More" menu of the flight controls,
 * which shows it while the vehicle is armed. The backend refuses it only without a connection, and sends it again until the
 * vehicle answers; that the vehicle stopped is what its heartbeat says, never the answer.
 */
export class EmergencyStop implements Command {
  readonly id = 'vehicle.emergencyStop'

  readonly labelKey = 'palette.vehicle.stop.label'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'warning'

  readonly dangerous = true

  // Never from the palette: the way to it is a deliberate one, from the controls of a flight.
  readonly listed = false

  /**
   * May it run now? For a connected vehicle that is not known to be disarmed.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const key = connectionBlocker(ctx.vehicle) ?? (ctx.vehicle.armed() === false ? 'palette.reason.notArmed' : null)

    return key === null ? { enabled: true } : no(key)
  }

  /**
   * The question before it runs: a hold in the error tone, with what it does in plain words.
   *
   * @param ctx the context
   * @returns what to ask
   */
  confirmation(ctx: CommandContext): SafetyOptions {
    return {
      title: ctx.say('palette.vehicle.stop.title'),
      what: ctx.say('palette.vehicle.stop.what'),
      vehicle: namedVehicle(ctx),
      level: 'hold',
      tone: 'error',
      confirmLabel: ctx.say('palette.vehicle.stop.button'),
    }
  }

  /**
   * Sends the stop.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  execute(ctx: CommandContext): Promise<CommandOutcome> {
    return sendAndTell(ctx, 'stop', () => ctx.vehicle.emergencyStop())
  }
}

/** Opens the review before arming: what the vehicle says of its checks, and the way to the hold. It sends nothing itself. */
export class ReviewBeforeArming implements Command {
  readonly id = 'vehicle.review'

  readonly labelKey = 'palette.vehicle.review.label'

  readonly buttonLabelKey = 'palette.vehicle.review.button'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'info'

  readonly keywordKeys = ['palette.vehicle.review.keywords']

  /**
   * May it run now? For a connected vehicle that is known to be disarmed (the review is for an arm).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const { vehicle } = ctx
    const key = connectionBlocker(vehicle) ?? armedBlocker(vehicle.armed(), false)

    return key === null ? { enabled: true } : no(key)
  }

  /**
   * Opens the review.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.dialogs.showArmReview()

    return { focus: 'restore' }
  }
}

/** The modes the backend allows when the state of the vehicle is not known: idempotent safety actions, and no others. */
export const ANY_STATE_MODES: readonly string[] = ['RTL', 'LAND']

/** The modes that are one deliberate press: what a person does when something goes wrong, where asking costs time. */
export const QUICK_MODES: readonly string[] = ['RTL', 'LAND', 'LOITER', 'BRAKE']

/** The modes the palette offers a command for, by the names ArduPilot's dialect gives them: a command for each. */
export const PALETTE_MODES: readonly string[]
  = ['STABILIZE', 'ALT_HOLD', 'LOITER', 'POSHOLD', 'AUTO', 'GUIDED', 'RTL', 'LAND', 'BRAKE']

/** Changes the flight mode to one of the vehicle's modes, by its name. */
export class ChangeFlightMode implements Command {
  readonly id: string

  readonly labelKey: string

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'navigation'

  // A change of how the vehicle flies: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  readonly keywordKeys = ['palette.vehicle.mode.keywords']

  /**
   * Makes the command.
   *
   * @param mode the mode's name, as the vehicle's kind names it (`vehicle.modes`)
   */
  constructor(private readonly mode: string) {
    this.id = `vehicle.mode.${mode.toLowerCase()}`
    this.labelKey = `palette.vehicle.mode.${mode.toLowerCase()}`
  }

  /**
   * The vehicle's number for the mode, when its kind has one.
   *
   * @param ctx the context
   * @returns the number, or undefined
   */
  private numberIn(ctx: CommandContext): number | undefined {
    return ctx.vehicle.modes()?.modes.find(known => known.name === this.mode)?.number
  }

  /**
   * Whether this mode is asked of nobody: one deliberate press, or a vehicle that is known to be disarmed, or the user's choice.
   *
   * @param ctx the context
   * @returns true when it needs no question
   */
  private asksNothing(ctx: CommandContext): boolean {
    return QUICK_MODES.includes(this.mode) || ctx.vehicle.armed() === false || ctx.preferences.modeConfirmation() === 'none'
  }

  /**
   * What stands in the way of a change to this mode that is about the modes: they are not read, the kind has no such mode, the
   * vehicle is in it already.
   *
   * @param ctx the context
   * @returns the reason, or null
   */
  private modeBlocker(ctx: CommandContext): Availability | null {
    if (ctx.vehicle.modes() === null) {
      return no('palette.reason.noModes')
    }
    if (this.numberIn(ctx) === undefined) {
      return no('palette.reason.noSuchMode', { mode: this.mode })
    }

    return ctx.vehicle.mode() === this.mode ? no('palette.reason.alreadyInMode', { mode: this.mode }) : null
  }

  /**
   * May it run now? A connected vehicle whose kind has the mode and is not in it; for a mode that is not one of the quick ones, a
   * state that is known.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const key = connectionBlocker(ctx.vehicle) ?? this.stateBlocker(ctx.vehicle)

    return key === null ? this.modeBlocker(ctx) ?? { enabled: true } : no(key)
  }

  /**
   * Whether the vehicle's state, not known, stands in the way: every mode but RTL and Land needs it known (the backend's rule).
   *
   * @param vehicle the vehicle's facts
   * @returns the reason, or null
   */
  private stateBlocker(vehicle: VehicleFacts): string | null {
    return ANY_STATE_MODES.includes(this.mode) || vehicle.armed() !== undefined ? null : 'palette.reason.stateUnknown'
  }

  /**
   * The question before it runs: a plain confirmation naming the mode, for an armed vehicle (or one that may be) and a mode that
   * is not a quick one, unless Settings say it asks nothing.
   *
   * @param ctx the context
   * @returns what to ask, or null for nothing
   */
  confirmation(ctx: CommandContext): SafetyOptions | null {
    if (this.asksNothing(ctx)) {
      return null
    }
    const { mode } = this
    const key = mode === 'AUTO' ? 'palette.vehicle.mode.whatAuto' : 'palette.vehicle.mode.what'

    return {
      title: ctx.say('palette.vehicle.mode.title', { mode }),
      what: ctx.say(key, { mode }),
      vehicle: namedVehicle(ctx),
      level: 'plain',
      confirmLabel: ctx.say('palette.vehicle.mode.button', { mode }),
    }
  }

  /**
   * Asks the vehicle to change its mode, once. What the mode is now is what the next heartbeat says.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  execute(ctx: CommandContext): Promise<CommandOutcome> {
    const number = this.numberIn(ctx)
    if (number === undefined) {
      tellArmingRefusal(ctx, 'mode', 'palette.reason.modeRefused')

      return Promise.resolve({ focus: 'restore' })
    }

    return sendAndTell(ctx, 'mode', () => ctx.vehicle.setMode(number))
  }
}

/**
 * The commands that change the flight mode, one for each mode of `PALETTE_MODES`.
 *
 * @returns the commands
 */
export function flightModeCommands(): Command[] {
  return PALETTE_MODES.map(mode => new ChangeFlightMode(mode))
}
