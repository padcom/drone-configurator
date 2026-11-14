// What the Filters part of the Tune screen knows besides its table (lib/tune/table.ts): the names ArduPilot gives the choices and
// the bits of the harmonic notch (`@Values` and `@Bitmask` of libraries/Filter/HarmonicNotchFilter.cpp, the vehicle's own
// vocabulary, the same in every language), and the one check that rests on a log: whether the notch, as it is chosen, covers the
// peaks that a log's spectrum shows.
import type { SpectrumPeak } from '@/generated/app'
import { type NotchSetting, notchBands } from '@/lib/logs/spectrum'

/** A named choice and the number the vehicle stores for it. */
export interface Choice {
  /** The number the vehicle stores. */
  value: number
  /** ArduPilot's name of it. */
  label: string
}

/** A named bit of a mask. */
export interface NamedBit {
  /** The bit (0 is the lowest). */
  bit: number
  /** ArduPilot's name of it. */
  name: string
}

/** INS_HNTCH_ENABLE. */
export const NOTCH_ENABLE: Choice[] = [{ value: 0, label: 'Disabled' }, { value: 1, label: 'Enabled' }]

/** INS_HNTCH_MODE: how the centre follows what makes the noise. */
export const NOTCH_MODES: Choice[] = [
  { value: 0, label: 'Fixed' },
  { value: 1, label: 'Throttle' },
  { value: 2, label: 'RPM Sensor' },
  { value: 3, label: 'ESC Telemetry' },
  { value: 4, label: 'Dynamic FFT' },
  { value: 5, label: 'Second RPM Sensor' },
]

/** INS_HNTCH_OPTS: the bits ArduPilot names (bit 0 first). */
export const NOTCH_OPTIONS: NamedBit[] = [
  'Double notch',
  'Multi-Source',
  'Update at loop rate',
  'EnableOnAllIMUs',
  'Triple notch',
  'Use min freq on RPM source failure',
  'Quintuple notch',
].map((name, bit) => ({ bit, name }))

/** INS_HNTCH_HMNCS: sixteen harmonics, bit 0 the base frequency. */
export const NOTCH_HARMONICS = 16

/**
 * Whether a bit of a mask is set.
 *
 * @param mask the mask
 * @param bit the bit (0 is the lowest)
 * @returns true if it is set
 */
export function isBitSet(mask: number, bit: number): boolean {
  return Math.floor(mask / 2 ** bit) % 2 === 1
}

/**
 * A mask with a bit set or cleared.
 *
 * @param mask the mask
 * @param bit the bit (0 is the lowest)
 * @param on whether it is to be set
 * @returns the new mask
 */
export function withBit(mask: number, bit: number, on: boolean): number {
  return isBitSet(mask, bit) === on ? mask : mask + (on ? 1 : -1) * 2 ** bit
}

/**
 * The frequencies of a peak that a log's spectrum showed: the peak and each of its harmonics.
 *
 * @param peak the peak
 * @returns the frequencies (Hz), the peak first
 */
export function peakFrequencies(peak: SpectrumPeak): number[] {
  return [peak.hz, ...peak.harmonics.map(harmonic => harmonic.hz)]
}

/**
 * Whether the notch, as it is chosen, takes out none of the frequencies that a log showed as peaks: its centre is outside the
 * range where the noise was logged. A notch that is not a notch (a setting the preview does not draw), or no peak to look at, is
 * nothing to warn about.
 *
 * @param setting the notch as it is chosen
 * @param peaks the frequencies of the peak and its harmonics (Hz)
 * @param limit the highest frequency the spectrum has (its Nyquist frequency)
 * @returns true when there are peaks and the notch takes out none of them
 */
export function notchMissesPeaks(setting: NotchSetting, peaks: readonly number[], limit: number): boolean {
  const bands = notchBands(setting, limit)

  return bands.length > 0 && peaks.length > 0 && !peaks.some(hz => bands.some(band => hz >= band.from && hz <= band.to))
}
