// What the Spectrum screen makes of the backend's spectrum: where a harmonic notch would sit and how wide it is (the preview),
// the
// values of `INS_HNTCH_*` that a peak suggests, whether the log is from the kind of vehicle that is connected, and the colour of
// a spectrogram cell. Pure functions; a value that is not known is not made up.
//
// Checked in the ArduPilot source (shared/tools/ardupilot, commit 2a54162), libraries/Filter/HarmonicNotchFilter.cpp:61-129:
//   INS_HNTCH_ENABLE 0/1; _FREQ base centre frequency, 10 to 495 Hz (default 80); _BW bandwidth, 5 to 250 Hz, "typically set to
//   half the base frequency" (default 40); _ATT attenuation, 5 to 50 dB (default 40); _HMNCS bitmask of harmonics, bit 0 the
//   first (the base frequency), 16 bits (default 3); _MODE 0 fixed, 1 throttle, 2 RPM sensor, 3 ESC telemetry, 4 dynamic FFT;
//   _REF the reference for tracking (0 disables it). The page suggests ENABLE, FREQ, BW and HMNCS only: the tracking mode and
//   its reference depend on the vehicle, and the attenuation has a good default.
//   What takes effect only after a reboot: _HMNCS ("takes effect on the next reboot", @RebootRequired, :92-112), and so
//   _ENABLE: the filters are allocated, for the harmonics that are set, only when the inertial sensor starts and the notch is
//   enabled (AP_InertialSensor.cpp:1098-1104, `notch.params.enabled()` then `allocate_filters(..., harmonics(), ...)`). _FREQ and
//   _BW are read as the filter runs.
import type { SpectrumHarmonic, SpectrumPeak } from '@/generated/app'

/** The harmonic notch parameters, by what the page needs of them. */
export const NOTCH = {
  enable: 'INS_HNTCH_ENABLE',
  freq: 'INS_HNTCH_FREQ',
  bandwidth: 'INS_HNTCH_BW',
  attenuation: 'INS_HNTCH_ATT',
  harmonics: 'INS_HNTCH_HMNCS',
} as const

/** The range of the base frequency and of the bandwidth (HarmonicNotchFilter.cpp:71, :79), in hertz. */
const FREQ_RANGE = { min: 10, max: 495 } as const
const BANDWIDTH_RANGE = { min: 5, max: 250 } as const

/** The notch the preview draws, as entered. */
export interface NotchSetting {
  /** The base centre frequency (Hz). */
  freq: number
  /** The bandwidth (Hz). */
  bandwidth: number
  /** The attenuation (dB). */
  attenuation: number
  /** The harmonics that are filtered: bit 0 is the base frequency. */
  harmonics: number
}

/** A band of frequencies a notch takes out. */
export interface NotchBand {
  /** Which harmonic it is: 1 is the base frequency. */
  n: number
  /** Its centre (Hz). */
  centre: number
  /** Its lower edge (Hz). */
  from: number
  /** Its upper edge (Hz). */
  to: number
}

/**
 * Whether a number is a whole number from 0 to 65535.
 *
 * @param value the number
 * @returns true if it is
 */
function isMask16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xFFFF
}

/**
 * Whether a number is a size above zero that is not infinite.
 *
 * @param value the number
 * @returns true if it is
 */
function isSize(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/**
 * The band of one harmonic: n times the base frequency, and the bandwidth around it, n times as wide (ArduPilot keeps the
 * quality factor, base frequency over bandwidth, across harmonics).
 *
 * @param setting the notch as entered
 * @param n which harmonic (1 is the base frequency)
 * @returns the band
 */
function bandOf(setting: NotchSetting, n: number): NotchBand {
  const centre = setting.freq * n
  const half = (setting.bandwidth * n) / 2

  return { n, centre, from: Math.max(0, centre - half), to: centre + half }
}

/**
 * The bands a harmonic notch takes out, below a frequency: for each harmonic that is set (bit n-1).
 *
 * @param setting the notch as entered
 * @param limit the highest frequency worth drawing (the Nyquist frequency of the spectrum)
 * @returns the bands, lowest first; none for a setting that is not a notch
 */
export function notchBands(setting: NotchSetting, limit: number): NotchBand[] {
  if (!isSize(setting.freq) || !isSize(setting.bandwidth) || !isMask16(setting.harmonics)) {
    return []
  }

  return Array.from({ length: 16 }, (_, bit) => bit + 1)
    .filter(n => Math.floor(setting.harmonics / 2 ** (n - 1)) % 2 === 1 && setting.freq * n <= limit)
    .map(n => bandOf(setting, n))
}

/** A change the page suggests, with what it rests on. */
export interface Suggestion {
  /** The parameter. */
  id: string
  /** The value suggested. */
  to: number
  /** What the value comes from, as a key of the page's words. */
  because: 'enable' | 'peak' | 'bandwidth' | 'harmonics'
  /** Whether it takes effect only after the vehicle is restarted. */
  reboot: boolean
}

/**
 * The harmonics bitmask for a peak: the base frequency, and each harmonic that was found in the spectrum.
 *
 * @param harmonics the harmonics found (2 and up)
 * @returns the bitmask
 */
export function harmonicsMask(harmonics: readonly SpectrumHarmonic[]): number {
  return harmonics.reduce((mask, h) => (h.n >= 2 && h.n <= 16 ? mask | (1 << (h.n - 1)) : mask), 1)
}

/**
 * Keeps a number in a range, as a whole number.
 *
 * @param value the number
 * @param range the range
 * @param range.min the least
 * @param range.max the most
 * @returns the nearest whole number inside the range
 */
function within(value: number, range: { min: number, max: number }): number {
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

/**
 * The values of the harmonic notch that a peak suggests: enabled, centred on the peak, as wide as half of it (the source says
 * that is typical), filtering the base frequency and the harmonics that were found. A peak outside the range of the parameter
 * is held to it, and the page says so by showing the value.
 *
 * @param peak the peak found in the log
 * @returns the suggestions, in the order they are written
 */
export function suggestNotch(peak: SpectrumPeak): Suggestion[] {
  const freq = within(peak.hz, FREQ_RANGE)

  return [
    { id: NOTCH.enable, to: 1, because: 'enable', reboot: true },
    { id: NOTCH.freq, to: freq, because: 'peak', reboot: false },
    { id: NOTCH.bandwidth, to: within(freq / 2, BANDWIDTH_RANGE), because: 'bandwidth', reboot: false },
    { id: NOTCH.harmonics, to: harmonicsMask(peak.harmonics), because: 'harmonics', reboot: true },
  ]
}

/** The family of firmware a vehicle type belongs to, by the names of the MAVLink types the app shows. */
const FAMILIES: Readonly<Record<string, string>> = {
  QUADROTOR: 'ArduCopter',
  HEXAROTOR: 'ArduCopter',
  OCTOROTOR: 'ArduCopter',
  TRICOPTER: 'ArduCopter',
  COAXIAL: 'ArduCopter',
  DODECAROTOR: 'ArduCopter',
  DECAROTOR: 'ArduCopter',
  HELICOPTER: 'ArduCopter',
  FIXED_WING: 'ArduPlane',
  GROUND_ROVER: 'Rover',
  SURFACE_BOAT: 'Rover',
  SUBMARINE: 'ArduSub',
}

/**
 * The family of firmware named by a log's firmware text ("ArduCopter V4.7.2 (...)").
 *
 * @param firmware the text, if the log names one
 * @returns the first word, or null
 */
export function familyOfLog(firmware: string | undefined): string | null {
  const word = firmware?.split(/\s+/u)[0] ?? ''

  return word.startsWith('Ardu') ? word : null
}

/** Whether a log is of the kind of vehicle that is connected, and the two kinds by name ('unknown' when not known). */
export interface Kinds {
  /** Whether both are known and the same. */
  same: boolean
  /** The log's family of firmware. */
  log: string
  /** The connected vehicle's. */
  vehicle: string
}

/**
 * Whether two families are the same and known.
 *
 * @param log the log's family
 * @param vehicle the vehicle's
 * @returns true if they are
 */
function agree(log: string, vehicle: string): boolean {
  return log === vehicle && log !== 'unknown'
}

/**
 * Whether values taken from a log are for the vehicle that is connected: the log's firmware family is the family of the
 * vehicle's type. Not knowing either is not a yes.
 *
 * @param firmware the firmware text of the log
 * @param vehicleType the connected vehicle's type, if one is connected
 * @returns whether they are the same, and both names
 */
export function sameKind(firmware: string | undefined, vehicleType: string | undefined): Kinds {
  const log = familyOfLog(firmware) ?? 'unknown'
  const vehicle = FAMILIES[vehicleType ?? ''] ?? 'unknown'

  return { same: agree(log, vehicle), log, vehicle }
}

/**
 * The shade of a spectrogram cell, 0 to 255: the amplitude against the largest in the picture, on a square-root scale so that
 * the weaker lines are seen. Zero amplitude is zero.
 *
 * @param value the amplitude
 * @param largest the largest amplitude in the picture
 * @returns the shade
 */
export function shadeOf(value: number, largest: number): number {
  return largest > 0 && value > 0 ? Math.round(255 * Math.sqrt(Math.min(1, value / largest))) : 0
}

/** ArduPilot's defaults of the harmonic notch (HarmonicNotchFilter.cpp:74, :82, :90, :113): what the preview starts from. */
export const DEFAULT_NOTCH: NotchSetting = { freq: 80, bandwidth: 40, attenuation: 40, harmonics: 3 }

/**
 * The notch the vehicle has, from its parameters: each one it has, else ArduPilot's default for it.
 *
 * @param params the parameters of the vehicle
 * @returns the notch, and whether the vehicle's own values were used (false when it has none of the parameters)
 */
export function notchOf(params: readonly { id: string, value: number }[]): { setting: NotchSetting, fromVehicle: boolean } {
  const value = (id: string, fallback: number) => params.find(param => param.id === id)?.value ?? fallback
  const fromVehicle = params.some(param => param.id === NOTCH.freq)

  return {
    fromVehicle,
    setting: {
      freq: value(NOTCH.freq, DEFAULT_NOTCH.freq),
      bandwidth: value(NOTCH.bandwidth, DEFAULT_NOTCH.bandwidth),
      attenuation: value(NOTCH.attenuation, DEFAULT_NOTCH.attenuation),
      harmonics: value(NOTCH.harmonics, DEFAULT_NOTCH.harmonics),
    },
  }
}

/**
 * A number typed in a field: empty or not a number is not a value.
 *
 * @param text what was typed
 * @returns the number, or NaN
 */
export function numberOf(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}
