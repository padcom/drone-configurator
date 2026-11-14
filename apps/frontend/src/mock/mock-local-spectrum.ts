// The raw IMU batches and the spectrum of the mock's logs (the contract's `logs.local.batches` and `.spectrum`): only the mock
// flight with the track (log 3) has batches, a gyro and an accelerometer. The numbers are made up for the mock (a motor line at
// 150 Hz and its second harmonic on a gentle floor); the rules are the backend's: no batch is an empty list, and a sensor with
// none is `UNAVAILABLE`, never an empty spectrum.
import type { BatchSource, LocalLogBatches, LocalLogSpectrum, LogsLocalSpectrumAsk } from '@/generated/app'

/** The sample rate of the mock batches, and the FFT size. */
const RATE = 1000
const SIZE = 1024
const BINS = SIZE / 2 + 1
const RESOLUTION = RATE / SIZE

/** The mock's flight with batches. */
const WITH_BATCHES = '00000003'

/**
 * The sensors of a log: the gyro and the accelerometer of IMU 0 before the filters, and the gyro of IMU 0 after them (ArduPilot
 * logs it at the instance plus the number of IMUs: 3 here), as a log with the option for before and after has them.
 */
const SOURCES: BatchSource[] = [
  { sensor: 'gyro', instance: 0, batches: 120, rateHz: RATE, samples: SIZE, mixedRates: false, postFilter: false },
  { sensor: 'accel', instance: 0, batches: 60, rateHz: RATE, samples: SIZE, mixedRates: false, postFilter: false },
  { sensor: 'gyro', instance: 3, batches: 120, rateHz: RATE, samples: SIZE, mixedRates: false, postFilter: true },
]

/** What the filters leave of the mock's vibration: a tenth. */
const AFTER = 0.1

/**
 * The batches of a log.
 *
 * @param key the log
 * @returns the sensors it has batches of
 */
export function batchesOf(key: string): LocalLogBatches {
  return { sources: key.includes(WITH_BATCHES) ? SOURCES : [] }
}

/**
 * The amplitude of a line at a frequency: a triangle one bin wide each side, as the Hann window leaves it.
 *
 * @param bin the bin
 * @param hz the line's frequency
 * @param amplitude its amplitude
 * @returns the amplitude at the bin
 */
function line(bin: number, hz: number, amplitude: number): number {
  const distance = Math.abs(bin * RESOLUTION - hz) / RESOLUTION

  return distance < 1.5 ? amplitude * (1 - distance / 1.5) : 0
}

/**
 * The amplitudes of an axis: a floor, a motor line and its second harmonic.
 *
 * @param scale how strong the axis is next to x
 * @returns the bins
 */
function axisOf(scale: number): number[] {
  return Array.from({ length: BINS }, (_, bin) => 0.02 + scale * (line(bin, 150, 2) + line(bin, 300, 0.5)))
}

/** The columns of a row of the spectrogram. */
const COLUMNS = 256

/**
 * The rows of the spectrogram: 60 of them two seconds apart, each with the same lines.
 *
 * @returns the rows
 */
function rowsOf(): LocalLogSpectrum['rows'] {
  return Array.from({ length: 60 }, (_, row) => ({
    timeUs: 2_000_000 + row * 2_000_000,
    values: Array.from({ length: COLUMNS }, (__, column) => 0.02 + line(column * 2, 150, 2) + line(column * 2, 300, 0.5)),
  }))
}

/**
 * The three axes of a source: what the filters leave of the vibration is a tenth of it.
 *
 * @param source the source
 * @returns the axes
 */
function axesOf(source: BatchSource): LocalLogSpectrum['axes'] {
  const left = source.postFilter === true ? AFTER : 1

  return [
    { name: 'x', amplitude: axisOf(left) },
    { name: 'y', amplitude: axisOf(0.25 * left) },
    { name: 'z', amplitude: axisOf(0.1 * left) },
  ]
}

/**
 * The peak of a source: the motor line and its second harmonic, a tenth of it after the filters.
 *
 * @param source the source
 * @returns the peak
 */
function peakOf(source: BatchSource): NonNullable<LocalLogSpectrum['peak']> {
  const left = source.postFilter === true ? AFTER : 1

  return { hz: 150, amplitude: 2 * left, axis: 'x', harmonics: [{ n: 2, hz: 300, amplitude: 0.5 * left }] }
}

/**
 * The spectrum of a sensor of the mock flight, or null for a sensor the log has no batches of.
 *
 * @param ask the request
 * @returns the spectrum, or null
 */
export function spectrumOf(ask: LogsLocalSpectrumAsk): LocalLogSpectrum | null {
  const source = batchesOf(ask.key).sources.find(s => s.sensor === ask.sensor && s.instance === ask.instance)
  if (source === undefined) {
    return null
  }

  return {
    sensor: source.sensor,
    instance: source.instance,
    rateHz: RATE,
    size: SIZE,
    resolutionHz: RESOLUTION,
    unit: source.sensor === 'gyro' ? 'rad/s' : 'm/s/s',
    batches: source.batches,
    skipped: 0,
    axes: axesOf(source),
    columns: COLUMNS,
    columnHz: (RESOLUTION * BINS) / COLUMNS,
    samples: SIZE + 32,
    rowBatches: Math.max(1, Math.round(source.batches / 60)),
    unrowed: 0,
    rows: rowsOf(),
    silent: false,
    peak: peakOf(source),
  }
}
