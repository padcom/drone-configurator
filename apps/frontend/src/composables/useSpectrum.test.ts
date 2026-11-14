// The Spectrum model's two passes: the spectrum of a source before the filters and, when the log holds the same IMU after them, a
// second pass. A second pass that fails does not take the first with it (the page says why the other is missing); stopping it by
// hand stops the whole.
import { describe, expect, it } from 'vitest'
import { BackendError, type BackendClient } from '@/backend/client'
import type { BatchSource, LocalLogSpectrum } from '@/generated/app'
import { useSpectrum } from './useSpectrum'

const SOURCES: BatchSource[] = [
  { sensor: 'gyro', instance: 0, batches: 10, rateHz: 1000, samples: 1024, mixedRates: false, postFilter: false },
  { sensor: 'gyro', instance: 3, batches: 10, rateHz: 1000, samples: 1024, mixedRates: false, postFilter: true },
]

/**
 * A spectrum, as far as the model looks at it.
 *
 * @param instance the instance it is of
 * @returns the spectrum
 */
function spectrumOf(instance: number): LocalLogSpectrum {
  return { sensor: 'gyro', instance } as unknown as LocalLogSpectrum
}

/**
 * A model over a fake backend.
 *
 * @param second what the pass for the instance after the filters does: an answer, or an error to throw
 * @returns the model
 */
function model(second: Error | 'ok') {
  const answers: Record<string, (payload: { instance?: number }) => Promise<unknown>> = {
    'logs.local.read': () => Promise.resolve({}),
    'logs.local.batches': () => Promise.resolve({ sources: SOURCES }),
    'logs.local.spectrum': payload => (
      payload.instance === 3 && second !== 'ok' ? Promise.reject(second) : Promise.resolve(spectrumOf(payload.instance ?? 0))
    ),
  }
  const client = {
    onEvent: () => () => undefined,
    call: (name: string, payload: { instance?: number }) => answers[name]?.(payload) ?? Promise.resolve(null),
  } as unknown as BackendClient

  return useSpectrum({ client })
}

describe('the spectrum after the filters', () => {
  it('is made from the source after the filters that goes with the one shown', async () => {
    const spectrum = model('ok')
    await spectrum.choose('car/1.BIN')

    expect(spectrum.spectrum.value?.instance).toBe(0)
    expect(spectrum.after.value?.instance).toBe(3)
    expect(spectrum.afterError.value).toBeNull()
  })

  it('does not take the first spectrum with it when its pass fails: the first stays, and the reason is kept', async () => {
    const spectrum = model(new Error('the file changed'))
    await spectrum.choose('car/1.BIN')

    expect(spectrum.phase.value).toBe('ready')
    expect(spectrum.spectrum.value?.instance).toBe(0)
    expect(spectrum.after.value).toBeNull()
    expect(spectrum.afterError.value).toContain('the file changed')
    expect(spectrum.error.value).toBeNull()
  })

  it('is a stop of the whole when the user stopped that pass', async () => {
    const spectrum = model(new BackendError('ABORTED', 'stopped'))
    await spectrum.choose('car/1.BIN')

    expect(spectrum.stopped.value).toBe(true)
    expect(spectrum.spectrum.value).toBeNull()
    expect(spectrum.phase.value).toBe('idle')
  })
})
