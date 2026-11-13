// The review of a recording: a finding that rests on the ground station's samples says how often they came ("a spike between two
// samples is not seen"), and the lowest cell of a battery that reports its cells is a finding of its own.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { i18n, setLanguage } from '@/i18n/i18n'
import type { ReviewFinding } from '@/generated/app'
import FlightReview from './FlightReview.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
})

/**
 * The review of some findings, as the page writes them.
 *
 * @param findings the findings
 * @returns the sentence of each
 */
function sentences(findings: ReviewFinding[]): string[] {
  mounted = mount(FlightReview, { global: { plugins: [i18n] }, props: { findings, firstUs: 0 } })

  return mounted.findAll('.flight-text').map(item => item.text())
}

it('says how often the samples a finding rests on came, for a recording', () => {
  const finding: ReviewFinding = {
    id: 'vibration.x', level: 'ok', value: 12, limit: 30, atUs: 47_000_000, rateHz: 9.98, samples: 50,
  }
  const [text] = sentences([finding])

  expect(text).toBe(
    'Vibration on X: peak 12 m/s², at 0:47, limit 30. '
    + 'Rests on samples the ground station took, about 9.98 a second: a spike between two samples is not seen.',
  )
})

it('says nothing of a rate for a log the vehicle wrote', () => {
  const [text] = sentences([{ id: 'vibration.x', level: 'ok', value: 12, limit: 30, atUs: 47_000_000 }])

  expect(text).not.toContain('ground station')
})

it('writes the lowest cell voltage as a finding of its own', () => {
  const [text] = sentences([{ id: 'battery.cell', level: 'info', value: 3.85, limit: 0, samples: 3 }])

  expect(text).toBe('Battery: lowest cell voltage 3.85 V (as the battery reports its cells).')
})
