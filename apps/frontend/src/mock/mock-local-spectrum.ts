// The raw IMU batches and the spectrum of the mock's logs (the contract's `logs.local.batches` and `.spectrum`): only the mock flight
// with the track (log 3) has batches, a gyro and an accelerometer. The numbers are made up for the mock (a motor line at 150 Hz and
// its second harmonic on a gentle floor); the rules are the backend's: no batch is an empty list, and a sensor with none is
// `UNAVAILABLE`, never an empty spectrum.
import type { BatchSource, LocalLogBatches, LocalLogSpectrum, LogsLocalSpectrumAsk } from '@/generated/app'

/** The sample rate of the mock batches, and the FFT size. */
const RATE = 1000
const SIZE = 1024
const BINS = SIZE / 2 + 1
const RESOLUTION = RATE / SIZE

/** The mock's flight with batches. */
const WITH_BATCHES = '00000003'

/** The sensors of a log: the gyro and the accelerometer of IMU 0. */
const SOURCES: BatchSource[] = [
  { sensor: 'gyro', instance: 0, batches: 120, rateHz: RATE, samples: SIZE, mixedRates: false },
  { sensor: 'accel', instance: 0, batches: 60, rateHz: RATE, samples: SIZE, mixedRates: false },
]

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
  const columns = 256
  const rows = Array.from({ length: 60 }, (_, row) => ({
    timeUs: 2_000_000 + row * 2_000_000,
    values: Array.from({ length: columns }, (__, column) => 0.02 + line(column * 2, 150, 2) + line(column * 2, 300, 0.5)),
  }))

  return {
    sensor: source.sensor,
    instance: source.instance,
    rateHz: RATE,
    size: SIZE,
    resolutionHz: RESOLUTION,
    unit: source.sensor === 'gyro' ? 'rad/s' : 'm/s/s',
    batches: source.batches,
    skipped: 0,
    axes: [{ name: 'x', amplitude: axisOf(1) }, { name: 'y', amplitude: axisOf(0.25) }, { name: 'z', amplitude: axisOf(0.1) }],
    columns,
    columnHz: (RESOLUTION * BINS) / columns,
    rows,
    silent: false,
    peak: {
      hz: 150,
      amplitude: 2,
      axis: 'x',
      harmonics: [{ n: 2, hz: 300, amplitude: 0.5 }],
    },
  }
}
