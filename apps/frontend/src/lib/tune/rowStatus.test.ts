import { expect, it } from 'vitest'
import type { FieldFacts } from '@/lib/params/fieldState'
import { sayingId } from './rowStatus'

const at = (vehicle: number, draft: number | null = null, basis: number | undefined = undefined): FieldFacts => (
  { vehicle, draft, basis, write: 'idle' }
)

it('says the only parameter of a row', () => {
  expect(sayingId(['ATC_RAT_YAW_P'], () => at(0.18))).toBe('ATC_RAT_YAW_P')
})

it('says the first of a pair when both stand alike', () => {
  expect(sayingId(['ATC_RAT_RLL_P', 'ATC_RAT_PIT_P'], () => at(0.135, 0.2, 0.135))).toBe('ATC_RAT_RLL_P')
})

it('says the one of a pair that most needs saying: a conflict before a draft', () => {
  const facts: Record<string, FieldFacts> = {
    ATC_RAT_RLL_P: at(0.135, 0.2, 0.135),
    ATC_RAT_PIT_P: at(0.15, 0.2, 0.135),
  }

  expect(sayingId(['ATC_RAT_RLL_P', 'ATC_RAT_PIT_P'], id => facts[id]!)).toBe('ATC_RAT_PIT_P')
})

it('says a rejected write before a verified one', () => {
  const facts: Record<string, FieldFacts> = {
    ATC_RAT_RLL_P: { ...at(0.2), write: 'verified' },
    ATC_RAT_PIT_P: { ...at(0.135, 0.2), write: 'rejected' },
  }

  expect(sayingId(['ATC_RAT_RLL_P', 'ATC_RAT_PIT_P'], id => facts[id]!)).toBe('ATC_RAT_PIT_P')
})

it('says none for a row with no parameter', () => {
  expect(sayingId([], () => at(0))).toBe('')
})
