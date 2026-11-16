// What the RC control knows of a gamepad and of how it is mapped to the vehicle's channels. Nothing here talks to the gamepad
// or to the vehicle: the page reads a pad into a `PadSample`, and the functions of this folder make the pulses of the 16
// channels of an override out of it (the plan `drone-configurator-rc-control.md`, section 4).

/** The most channels an override has (and so a profile). */
export const CHANNELS = 16

/** The pulse of a channel that is not overridden: the radio's own (what `rc.input` calls 0). */
export const NOT_MINE = 0

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

/** What an axis said when it was at one end, at rest and at the other (raw values, -1 to 1): the calibration. */
export interface AxisCalibration {
  /** What the axis said at its low end. */
  min: number
  /** What it said at rest. */
  center: number
  /** What it said at its high end. */
  max: number
}

/** What an uncalibrated axis is taken to be: -1 to 1 with the middle at 0. */
export const DEFAULT_CALIBRATION: AxisCalibration = { min: -1, center: 0, max: 1 }

/** A stick: an axis, scaled to the channel's range, with a dead zone around the middle and an expo curve. */
export interface StickRow {
  /** The kind of row. */
  kind: 'stick'
  /** The channel it drives, 1 to 16. */
  channel: number
  /** The axis of the gamepad (its index). */
  axis: number
  /** Whether the axis is turned the other way. */
  invert: boolean
  /** What the axis says at its ends and at rest. */
  calibration: AxisCalibration
  /** The part of the travel around the middle that is the middle, 0 to 0.5 (0.08 by default). */
  deadZone: number
  /** How much the curve is cubic, 0 (a line) to 1. */
  expo: number
}

/** A switch that comes as an axis (-1, 0, 1 for a 3-position one): its third of travel gives the low, middle or high pulse. */
export interface SwitchRow {
  /** The kind of row. */
  kind: 'switch'
  /** The channel it drives, 1 to 16. */
  channel: number
  /** The axis of the gamepad. */
  axis: number
  /** Whether the axis is turned the other way. */
  invert: boolean
  /** The pulses of the low, middle and high position (µs). */
  pulses: readonly [number, number, number]
}

/** A button: one pulse while it is up, another while it is pressed. */
export interface ButtonRow {
  /** The kind of row. */
  kind: 'button'
  /** The channel it drives, 1 to 16. */
  channel: number
  /** The button of the gamepad (its index). */
  button: number
  /** The pulse while it is up (µs). */
  off: number
  /** The pulse while it is pressed (µs). */
  on: number
}

/** What drives a channel. */
export type Row = StickRow | SwitchRow | ButtonRow

/** The mapping of one device: at most one row for a channel. */
export interface Profile {
  /** The gamepad's `id` string (vendor and product). */
  device: string
  /** The rows. */
  rows: readonly Row[]
}

/** What one read of a gamepad said. */
export interface PadSample {
  /** The axes, -1 to 1. */
  axes: readonly number[]
  /** The buttons, 0 to 1. */
  buttons: readonly number[]
}

/** Which channels of the vehicle are the throttle and the yaw (`RCMAP_THROTTLE`, `RCMAP_YAW`), and the ranges of the channels. */
export interface VehicleChannels {
  /** The throttle's channel, 1 to 16. */
  throttle: number
  /** The yaw's channel, 1 to 16. */
  yaw: number
  /** The range of a channel (1 to 16): the vehicle's RCn_MIN/TRIM/MAX for the control channels, the default for the others. */
  range: (channel: number) => PulseRange
}
