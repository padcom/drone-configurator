import { describe, expect, it } from 'vitest'
import type { SpectrumPeak } from '@/generated/app'
import { familyOfLog, harmonicsMask, notchBands, sameKind, shadeOf, suggestNotch } from './spectrum'

/**
 * A peak at a frequency, with harmonics.
 *
 * @param hz its frequency
 * @param harmonics the harmonics found
 * @returns the peak
 */
function peak(hz: number, harmonics: SpectrumPeak['harmonics'] = []): SpectrumPeak {
  return { hz, amplitude: 2, axis: 'x', harmonics }
}

describe('the bands of a notch', () => {
  it('has a band for each harmonic that is set, n times the base frequency, as wide as n times the bandwidth', () => {
    const bands = notchBands({ freq: 80, bandwidth: 40, attenuation: 40, harmonics: 0b101 }, 500)

    expect(bands.map(band => [band.n, band.centre, band.from, band.to])).toEqual([[1, 80, 60, 100], [3, 240, 180, 300]])
  })

  it('leaves out harmonics above the limit, and has none for a setting that is not a notch', () => {
    expect(notchBands({ freq: 200, bandwidth: 40, attenuation: 40, harmonics: 0b111 }, 500).map(band => band.n)).toEqual([1, 2])
    expect(notchBands({ freq: 80, bandwidth: 40, attenuation: 40, harmonics: 0 }, 500)).toEqual([])
    expect(notchBands({ freq: Number.NaN, bandwidth: 40, attenuation: 40, harmonics: 1 }, 500)).toEqual([])
    expect(notchBands({ freq: 80, bandwidth: 0, attenuation: 40, harmonics: 1 }, 500)).toEqual([])
    expect(notchBands({ freq: 80, bandwidth: 40, attenuation: 40, harmonics: 1.5 }, 500)).toEqual([])
    expect(notchBands({ freq: 80, bandwidth: 40, attenuation: 40, harmonics: -1 }, 500)).toEqual([])
  })

  it('does not go below zero', () => {
    expect(notchBands({ freq: 20, bandwidth: 100, attenuation: 40, harmonics: 1 }, 500)[0]?.from).toBe(0)
  })
})

describe('the values a peak suggests', () => {
  it('enables the notch, centres it on the peak, half as wide, and filters the base and the harmonics found', () => {
    const found = [{ n: 2, hz: 301, amplitude: 0.5 }, { n: 4, hz: 600, amplitude: 0.2 }]

    expect(suggestNotch(peak(150.4, found))).toEqual([
      { id: 'INS_HNTCH_ENABLE', to: 1, because: 'enable', reboot: true },
      { id: 'INS_HNTCH_FREQ', to: 150, because: 'peak', reboot: false },
      { id: 'INS_HNTCH_BW', to: 75, because: 'bandwidth', reboot: false },
      { id: 'INS_HNTCH_HMNCS', to: 0b1011, because: 'harmonics', reboot: true },
    ])
  })

  it('holds a peak outside the ranges of the parameters to them', () => {
    expect(suggestNotch(peak(3)).map(s => s.to)).toEqual([1, 10, 5, 1])
    expect(suggestNotch(peak(600)).map(s => s.to)).toEqual([1, 495, 248, 1])
    expect(suggestNotch(peak(495)).find(s => s.id === 'INS_HNTCH_BW')?.to).toBe(248)
  })

  it('counts a harmonic from the base frequency (bit 0) and ignores one that cannot be a bit', () => {
    expect(harmonicsMask([])).toBe(1)
    expect(harmonicsMask([{ n: 2, hz: 1, amplitude: 1 }])).toBe(3)
    expect(harmonicsMask([{ n: 17, hz: 1, amplitude: 1 }, { n: 1, hz: 1, amplitude: 1 }])).toBe(1)
  })
})

describe('whether a log is of the kind of vehicle that is connected', () => {
  it('names the family of firmware of a log', () => {
    expect(familyOfLog('ArduCopter V4.7.2 (fb773567)')).toBe('ArduCopter')
    expect(familyOfLog('PX4 something')).toBeNull()
    expect(familyOfLog(undefined)).toBeNull()
  })

  it('is the same only when both are known and agree', () => {
    expect(sameKind('ArduCopter V4.7.2', 'QUADROTOR')).toEqual({ same: true, log: 'ArduCopter', vehicle: 'ArduCopter' })
    expect(sameKind('ArduCopter V4.7.2', 'FIXED_WING')).toEqual({ same: false, log: 'ArduCopter', vehicle: 'ArduPlane' })
    expect(sameKind('ArduCopter V4.7.2', undefined)).toEqual({ same: false, log: 'ArduCopter', vehicle: 'unknown' })
    expect(sameKind(undefined, 'QUADROTOR').same).toBe(false)
    expect(sameKind('ArduCopter V4.7.2', 'GENERIC').same).toBe(false)
  })
})

describe('the shade of a spectrogram cell', () => {
  it('is zero for nothing, full for the largest, and brighter than linear for a weak one', () => {
    expect(shadeOf(0, 10)).toBe(0)
    expect(shadeOf(10, 10)).toBe(255)
    expect(shadeOf(25, 10)).toBe(255)
    expect(shadeOf(2.5, 10)).toBe(128)
    expect(shadeOf(5, 0)).toBe(0)
    expect(shadeOf(-1, 10)).toBe(0)
  })
})
