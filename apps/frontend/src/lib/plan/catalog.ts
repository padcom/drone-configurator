// The commands the Plan page edits: the sixteen that the backend knows the rules of (apps/backend/planverify.pi, which says what
// a vehicle keeps of each). For each: what it is called, whether it has a place, and the fields of its form. A parameter that
// the vehicle does not keep (a waypoint's second to fourth, a speed change's place) has no field: it would be a number that
// does nothing. Where the vehicle keeps less than it is given (a hold time as a whole number of seconds, an altitude to the
// centimetre), the field says what it keeps (`keptValue`).
import { FRAME_ABOVE_HOME, FRAME_OWN, type Plan, type PlanItem } from './model'

/** What a field is. */
export type FieldKind = 'number' | 'choice'

/** One field of an item's form. */
export interface Field {
  /** Unique within the command. */
  id: string
  /** The message that names it. */
  labelKey: string
  /** A unit shown beside it (a plain symbol: s, m, m/s, %). */
  unit?: string
  /** A number typed, or one of a few choices. */
  kind: FieldKind
  /** The vehicle keeps a whole number of it (the fraction is cut off). */
  keep?: 'whole'
  /** The least it takes (a number below is a problem). */
  min?: number
  /** The most it takes (a number above is a problem). */
  max?: number
  /** The choices of a `choice` field (their values are what is stored). */
  choices?: readonly { value: number, labelKey: string }[]
  /** What the item says now. */
  read(item: PlanItem): number | null
  /** The change to an item that sets the field. */
  write(item: PlanItem, value: number | null): Partial<PlanItem>
}

/** Whether a command has a place: it needs one, it takes one or does with "here", or it has none. */
export type PlaceUse = 'required' | 'optional' | 'none'

/** One command of the catalog. */
export interface CommandDef {
  /** MAV_CMD. */
  command: number
  /** A short id, unique: the message `plan.cmd.<id>` names it. */
  id: string
  /** Whether it is a navigation command (the vehicle flies to it: it draws on the route and counts in the distance). */
  nav: boolean
  /** Whether it has a place. */
  place: PlaceUse
  /** Whether it has an altitude (m, in `frame`). */
  altitude: boolean
  /** Its form. */
  fields: readonly Field[]
  /** What a new item of it is (the rest is what the plan's defaults say). */
  fresh: Partial<PlanItem>
}

/**
 * A field that is one of the four parameters, as it is.
 *
 * @param id the field's id
 * @param slot which parameter
 * @param extra the rest of the field
 * @returns the field
 */
function param(id: string, slot: 'p1' | 'p2' | 'p3' | 'p4', extra: Partial<Field> = {}): Field {
  return {
    id,
    labelKey: `plan.field.${id}`,
    kind: 'number',
    read: item => item[slot],
    write: (_item, value) => ({ [slot]: value }),
    ...extra,
  }
}

/**
 * A field of a few choices, one of the four parameters.
 *
 * @param id the field's id
 * @param slot which parameter
 * @param choices the values and the messages that name them
 * @returns the field
 */
function pick(id: string, slot: 'p1' | 'p2' | 'p3' | 'p4', choices: readonly [number, string][]): Field {
  const named = choices.map(([value, name]) => ({ value, labelKey: `plan.choice.${name}` }))

  return param(id, slot, { kind: 'choice', choices: named })
}

/**
 * A loiter's radius: the size of the third parameter, whose sign is the direction (a negative one turns counter-clockwise).
 *
 * @returns the field
 */
function radius(): Field {
  return {
    id: 'radius',
    labelKey: 'plan.field.radius',
    unit: 'm',
    kind: 'number',
    keep: 'whole',
    min: 0,
    read: item => (item.p3 === null ? null : Math.abs(item.p3)),
    write: (item, value) => ({ p3: value === null ? null : value * ((item.p3 ?? 1) < 0 ? -1 : 1) }),
  }
}

/**
 * A loiter's direction: the sign of the third parameter.
 *
 * @returns the field
 */
function direction(): Field {
  return {
    id: 'direction',
    labelKey: 'plan.field.direction',
    kind: 'choice',
    choices: [{ value: 1, labelKey: 'plan.choice.clockwise' }, { value: -1, labelKey: 'plan.choice.counterClockwise' }],
    read: item => ((item.p3 ?? 1) < 0 ? -1 : 1),
    write: (item, value) => {
      const size = Math.abs(item.p3 ?? 0)

      return { p3: value === -1 ? -size : size }
    },
  }
}

/** The whole seconds a vehicle holds or loiters for. */
const SECONDS = { unit: 's', keep: 'whole', min: 0, max: 65535 } as const
/** What every parameter that a command does not use says. */
const ZEROS = { p1: 0, p2: 0, p3: 0, p4: 0 }
/** The yaw of a waypoint, a loiter, a land and a takeoff may be left out. */
const NO_YAW = { p4: null }
const YES_NO: readonly [number, string][] = [[1, 'yes'], [0, 'no']]
const EXIT: readonly [number, string][] = [[0, 'exitCentre'], [1, 'exitTangent']]

/**
 * A command that flies to a place at an altitude.
 *
 * @param command the MAV_CMD
 * @param id the short id
 * @param fields its form
 * @param fresh what a new one is
 * @returns the command
 */
function flies(command: number, id: string, fields: readonly Field[], fresh: Partial<PlanItem>): CommandDef {
  return { command, id, nav: true, place: 'required', altitude: true, fields, fresh: { ...ZEROS, ...fresh } }
}

/**
 * A command of the mission's own frame, with no place.
 *
 * @param command the MAV_CMD
 * @param id the short id
 * @param fields its form
 * @param fresh what a new one is
 * @returns the command
 */
function does(command: number, id: string, fields: readonly Field[], fresh: Partial<PlanItem>): CommandDef {
  return { command, id, nav: false, place: 'none', altitude: false, fields, fresh: { ...ZEROS, ...fresh } }
}

/** MAV_CMD_DO_SET_HOME and MAV_CMD_DO_SET_ROI. */
const SET_HOME = 179
const ROI = 201
/** The first parameter that says a command takes the place given with it: home "given here" (1), a ROI at "a place" (3). */
const NAMES_A_PLACE: Partial<Record<number, number>> = { [SET_HOME]: 1, [ROI]: 3 }
/** A whole number the vehicle keeps, of at least `min`. */
const WHOLE = { keep: 'whole', min: 0 } as const
const SPEED_TYPE: readonly [number, string][] = [[1, 'groundSpeed'], [0, 'airSpeed']]
const HOME_FROM: readonly [number, string][] = [[1, 'givenPlace'], [0, 'whereItIs']]
// (mode 2, "an item", needs a second parameter that the vehicle does not keep for this command: it is not offered)
const ROI_MODE: readonly [number, string][] = [[0, 'roiNone'], [1, 'roiNext'], [3, 'roiPlace']]

/** The sixteen commands, in the order the add menu lists them. */
export const COMMANDS: readonly CommandDef[] = [
  {
    command: 22,
    id: 'takeoff',
    nav: true,
    place: 'optional',
    altitude: true,
    fields: [],
    fresh: { ...ZEROS, ...NO_YAW, alt: 10 },
  },
  flies(16, 'waypoint', [param('holdTime', 'p1', SECONDS)], NO_YAW),
  flies(17, 'loiterUnlimited', [radius(), direction()], { ...NO_YAW, p3: 20 }),
  flies(
    18,
    'loiterTurns',
    [param('turns', 'p1', { min: 0, max: 255 }), radius(), direction(), pick('exit', 'p4', EXIT)],
    { p1: 1, p3: 20 },
  ),
  flies(19, 'loiterTime', [param('loiterTime', 'p1', SECONDS), direction(), pick('exit', 'p4', EXIT)], { p1: 30, p3: 1 }),
  { command: 20, id: 'returnHome', nav: true, place: 'none', altitude: false, fields: [], fresh: ZEROS },
  {
    command: 21,
    id: 'land',
    nav: true,
    place: 'optional',
    altitude: false,
    fields: [],
    fresh: { ...ZEROS, ...NO_YAW, alt: 0 },
  },
  does(112, 'delay', [param('delay', 'p1', { unit: 's', min: 0 })], { p1: 5 }),
  does(
    177,
    'jump',
    [param('jumpTo', 'p1', { keep: 'whole', min: 1 }), param('jumpTimes', 'p2', WHOLE)],
    { p1: null, p2: 1 },
  ),
  does(
    178,
    'speed',
    [
      pick('speedType', 'p1', SPEED_TYPE),
      param('speed', 'p2', { unit: 'm/s', min: 0 }),
      param('throttle', 'p3', { unit: '%', min: 0, max: 100 }),
    ],
    { p1: 1, p2: 5 },
  ),
  {
    command: 179,
    id: 'setHome',
    nav: false,
    place: 'optional',
    altitude: true,
    fields: [pick('homeFrom', 'p1', HOME_FROM)],
    fresh: { ...ZEROS, p1: 1 },
  },
  does(181, 'relay', [param('relay', 'p1', WHOLE), pick('relayState', 'p2', YES_NO)], { p2: 1 }),
  does(
    183,
    'servo',
    [
      param('channel', 'p1', { keep: 'whole', min: 1, max: 32 }),
      param('pwm', 'p2', { unit: 'µs', keep: 'whole', min: 500, max: 2500 }),
    ],
    { p1: 5, p2: 1500 },
  ),
  {
    command: 201,
    id: 'roi',
    nav: false,
    place: 'optional',
    altitude: true,
    fields: [pick('roiMode', 'p1', ROI_MODE)],
    fresh: { ...ZEROS, p1: 3 },
  },
  does(
    203,
    'camera',
    [
      param('cameraSession', 'p1', WHOLE),
      param('cameraZoom', 'p2', WHOLE),
      param('cameraStep', 'p3', { keep: 'whole' }),
      param('cameraFocus', 'p4', WHOLE),
    ],
    {},
  ),
  does(
    206,
    'cameraDistance',
    [param('cameraEvery', 'p1', { unit: 'm', min: 0 }), pick('cameraNow', 'p3', YES_NO)],
    { p1: 20, p3: 1 },
  ),
]

/**
 * Whether an item must have a place. A command with a place of its own does; set home and a point of interest only take one
 * when they say so (home "given here", a ROI "a place"): with none, the vehicle takes "where it is", the opposite of what the
 * item says.
 *
 * @param item the item
 * @param def its command
 * @returns whether a place is needed
 */
export function placeNeeded(item: PlanItem, def: CommandDef): boolean {
  return def.place === 'required' || NAMES_A_PLACE[item.command] === item.p1
}

/**
 * Whether the vehicle keeps the frame of an item's altitude (it does not for set home and a point of interest).
 *
 * @param def the command
 * @returns whether the frame is kept
 */
export function keepsFrame(def: CommandDef): boolean {
  return def.altitude && def.command !== SET_HOME && def.command !== ROI
}

/**
 * The catalog's entry for a command, or undefined for one the page does not edit.
 *
 * @param command the MAV_CMD
 * @returns its entry
 */
export function definitionOf(command: number): CommandDef | undefined {
  return COMMANDS.find(def => def.command === command)
}

/**
 * The altitude a new item of a command has: its own when the catalog gives one, else the plan's default for a command that has an
 * altitude, else none.
 *
 * @param def the command
 * @param plan the plan
 * @returns metres, or null
 */
function altitudeOfNew(def: CommandDef, plan: Plan): number | null {
  if (def.fresh.alt !== undefined) {
    return def.fresh.alt
  }

  return def.altitude ? plan.defaults.alt : null
}

/**
 * A new item of a command, as the plan's defaults and the catalog say.
 *
 * @param def the command
 * @param plan the plan (its default altitude and frame)
 * @param id the id of the item
 * @returns the item
 */
export function freshItem(def: CommandDef, plan: Plan, id: number): PlanItem {
  const own = !def.altitude && def.place === 'none'

  return {
    id,
    command: def.command,
    frame: own ? FRAME_OWN : plan.defaults.frame ?? FRAME_ABOVE_HOME,
    lat: null,
    lon: null,
    alt: altitudeOfNew(def, plan),
    p1: null,
    p2: null,
    p3: null,
    p4: null,
    autocontinue: true,
    ...def.fresh,
  }
}

/**
 * The whole number that is left of a number when its fraction is cut off (null when there is no fraction, or no number).
 *
 * @param value the number
 * @returns the whole number, when that is not the number
 */
function cutOff(value: number | null): number | null {
  const whole = Math.trunc(value ?? NaN)

  return Number.isFinite(whole) && whole !== value ? whole : null
}

/**
 * What the vehicle keeps of a value the user typed into a field (null when it keeps what was typed).
 *
 * @param field the field
 * @param value what was typed
 * @returns what the vehicle holds, when that is not what was typed
 */
export function keptValue(field: Field, value: number | null): number | null {
  return field.keep === 'whole' ? cutOff(value) : null
}

/**
 * What the vehicle keeps of an altitude: the centimetre (null when that is what was typed).
 *
 * @param alt metres
 * @returns metres to the centimetre, when that is not what was typed
 */
export function keptAltitude(alt: number | null): number | null {
  if (alt === null || !Number.isFinite(alt)) {
    return null
  }
  const centimetres = Math.trunc(alt * 100) / 100

  return Math.abs(centimetres - alt) < 1e-9 ? null : centimetres
}
