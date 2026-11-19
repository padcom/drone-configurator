// What the RC control knows of a gamepad and of how it is mapped to the vehicle's channels. Nothing here talks to the gamepad
// or to the vehicle: the page reads a pad into a `PadSample`, and the functions of this folder make the pulses of the 16
// channels of an override out of it (the plans `drone-configurator-rc-control.md`, section 4, and
// `drone-configurator-joystick-backend.md`, sections 9 to 11: every pad is CH1..CH16, all of them proportional, nothing is
// calibrated in the app).

/** The most channels an override has (and so a profile), and the most a pad has (CH1..CH16). */
export const CHANNELS = 16

/** The pulse of a channel that is not overridden: the radio's own (what `rc.input` calls 0). */
export const NOT_MINE = 0

/** The pad channel of a row that has no source yet (the person has not said which): it makes nothing, and it is a problem. */
export const NO_SOURCE = 0

/** The least a pulse of an override may be (µs): the backend refuses anything else. */
export const MIN_PULSE = 800

/** The most a pulse of an override may be (µs). */
export const MAX_PULSE = 2200

/** The pulses of a channel as the vehicle's `RCn_MIN`, `RCn_TRIM` and `RCn_MAX` say (µs). */
export interface PulseRange {
  /** The least pulse. */
  min: number
  /** The middle pulse. */
  trim: number
  /** The most pulse. */
  max: number
}

/** What a radio's output is by default (EdgeTX): 1000 to 2000 µs. */
export const DEFAULT_RANGE: PulseRange = { min: 1000, trim: 1500, max: 2000 }

/**
 * How the throttle stick rests: `centred` (a spring-centred stick: the middle is no climb, up climbs, down descends, which only
 * the modes that read the throttle as a climb rate make of it) or `low` (the stick rests at the bottom: the throttle is thrust).
 */
export type ThrottleStyle = 'centred' | 'low'

/** What a new mapping's throttle is: the leader's stick is spring-centred. */
export const DEFAULT_THROTTLE_STYLE: ThrottleStyle = 'centred'

/**
 * What drives an override's channel: the reading of one channel of the pad (-1 to 1), turned, with a dead zone around the middle
 * and an expo curve, and scaled to the vehicle's range for the channel (or between two pulses the row says). Every row is the
 * same: a stick, a switch's axis and a button are all a proportional pad channel (a button reads -1 up and 1 pressed).
 */
export interface Row {
  /** The channel of the override it drives, 1 to 16. */
  channel: number
  /** The pad's channel it reads, 1 to 16 (`NO_SOURCE` for none yet). */
  source: number
  /** Whether the reading is turned the other way. */
  invert: boolean
  /** The part of the travel around the middle that is the middle, 0 to 0.5. */
  deadZone: number
  /** How much the curve is cubic, 0 (a line) to 1. */
  expo: number
  /** The pulse at -1, when it is not the channel's minimum (a switch that must land on given pulses), µs. */
  pulseMin?: number
  /** The pulse at 1, when it is not the channel's maximum, µs. */
  pulseMax?: number
}

/** The mapping of one device: at most one row for a channel. */
export interface Profile {
  /** The gamepad's id (the backend's `id`, `vvvv:pppp` and what tells two apart; or the browser's id string). */
  device: string
  /** The rows. */
  rows: readonly Row[]
  /** How the throttle stick rests. */
  throttleStyle: ThrottleStyle
  /**
   * What "Confirm this mapping" confirmed: the key of the rows, the throttle style, the device and the pad's channel layout at
   * that moment (`confirm.ts`), or null when it never was. It confirms the mapping only while the key still matches: an edit,
   * another device or another layout is another mapping, and a profile that is not confirmed may not drive a vehicle.
   */
  confirmedKey: string | null
}

/** What one read of a gamepad said. */
export interface PadSample {
  /** CH1..CH16, -1 to 1; null for a channel the pad does not have. */
  channels: readonly (number | null)[]
}

/** What each of CH1..CH16 of a pad is: an `axis`, a `button` (-1 up, 1 pressed), or null when the pad has not got it. */
export type PadLayout = readonly ('axis' | 'button' | null)[]

/** Which channels of the vehicle are the throttle and the yaw (`RCMAP_THROTTLE`, `RCMAP_YAW`), and the ranges of the channels. */
export interface VehicleChannels {
  /** The throttle's channel, 1 to 16. */
  throttle: number
  /** The yaw's channel, 1 to 16. */
  yaw: number
  /** The throttle channel's dead zone (`RCn_DZ`, µs; 0 when it is not known): "low" is at least twice as wide. */
  throttleDeadZone?: number
  /** The range of a channel (1 to 16): the vehicle's RCn_MIN/TRIM/MAX for the control channels, the default for the others. */
  range: (channel: number) => PulseRange
}
