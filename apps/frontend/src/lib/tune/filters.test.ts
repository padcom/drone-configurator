import { expect, it } from 'vitest'
import { NOTCH_OPTIONS, isBitSet, notchMissesPeaks, peakFrequencies, withBit } from './filters'

const NOTCH = { freq: 80, bandwidth: 40, attenuation: 40, harmonics: 1 }

it('reads and sets the bits of a mask, and leaves a bit that is already as asked', () => {
  expect(isBitSet(5, 0)).toBe(true)
  expect(isBitSet(5, 1)).toBe(false)
  expect(isBitSet(5, 2)).toBe(true)
  expect(withBit(5, 1, true)).toBe(7)
  expect(withBit(7, 0, false)).toBe(6)
  expect(withBit(5, 0, true)).toBe(5)
  expect(withBit(5, 1, false)).toBe(5)
  expect(withBit(0, 15, true)).toBe(32768)
})

it('names the seven bits of the options as ArduPilot does', () => {
  expect(NOTCH_OPTIONS.map(option => option.name)).toEqual([
    'Double notch',
    'Multi-Source',
    'Update at loop rate',
    'EnableOnAllIMUs',
    'Triple notch',
    'Use min freq on RPM source failure',
    'Quintuple notch',
  ])
  expect(NOTCH_OPTIONS.map(option => option.bit)).toEqual([0, 1, 2, 3, 4, 5, 6])
})

it('lists the peak and its harmonics', () => {
  const harmonics = [{ n: 2, hz: 164, amplitude: 1 }, { n: 3, hz: 246, amplitude: 0.5 }]
  const peak = { hz: 82, amplitude: 3, axis: 'x' as const, harmonics }

  expect(peakFrequencies(peak)).toEqual([82, 164, 246])
})

it('warns when no logged peak is inside the notch (its base frequency and the harmonics that are chosen)', () => {
  // 80 Hz +- 20: the peak at 82 Hz is inside
  expect(notchMissesPeaks(NOTCH, [82, 164], 500)).toBe(false)
  // the peak is at 150 Hz: outside the band of the first harmonic
  expect(notchMissesPeaks(NOTCH, [150], 500)).toBe(true)
  // the second harmonic is chosen too: 160 Hz +- 40 holds 164 Hz
  expect(notchMissesPeaks({ ...NOTCH, harmonics: 3 }, [164], 500)).toBe(false)
})

it('has nothing to warn of with no peak, or a notch that is not one, or a band above the spectrum', () => {
  expect(notchMissesPeaks(NOTCH, [], 500)).toBe(false)
  expect(notchMissesPeaks({ ...NOTCH, harmonics: 0 }, [150], 500)).toBe(false)
  expect(notchMissesPeaks({ ...NOTCH, freq: 0 }, [150], 500)).toBe(false)
  expect(notchMissesPeaks({ ...NOTCH, freq: 300 }, [150], 200)).toBe(false)
})
