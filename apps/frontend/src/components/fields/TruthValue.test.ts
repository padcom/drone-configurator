import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TruthValue from './TruthValue.vue'
import { withI18n } from '@/testing/testing'

type Props = InstanceType<typeof TruthValue>['$props']

/**
 * A truth value in one of its states.
 *
 * @param props the props besides the label
 * @returns the wrapper
 */
function truth(props: Omit<Props, 'label'>) {
  return mount(TruthValue, { ...withI18n, props: { label: 'Battery', ...props } })
}

describe('a value in each of the five states', () => {
  it('live: the value, nothing to say about it, no pattern', () => {
    const live = truth({ state: 'live', value: '12.54 V' })

    expect(live.get('.value').text()).toBe('12.54 V')
    expect(live.find('.note').exists()).toBe(false)
    expect(live.classes()).not.toContain('hatched')
  })

  it('stale: says how old it is in words, and is hatched', () => {
    const stale = truth({ state: 'stale', value: '12.54 V', ageMs: 6200 })

    expect(stale.get('.note').text()).toBe('stale, 6 s old')
    expect(stale.get('.value').text()).toBe('12.54 V')
    expect(stale.classes()).toContain('hatched')
  })

  it('last heard: says so in words, keeps the value, and is hatched', () => {
    const last = truth({ state: 'last-heard', value: '12.54 V' })

    expect(last.get('.note').text()).toBe('last heard')
    expect(last.get('.value').text()).toBe('12.54 V')
    expect(last.classes()).toContain('hatched')
  })
})

describe('a value that was never reported, and one that was written', () => {
  it('never reported: a dash, never a made-up zero, whatever value it is given', () => {
    const never = truth({ state: 'never', value: '0 V' })

    expect(never.get('.value [aria-hidden="true"]').text()).toBe('—')
    expect(never.text()).not.toContain('0 V')
    expect(never.find('.note').exists()).toBe(false)
    expect(never.classes()).not.toContain('hatched')
  })

  it('never reported: says so in words for a screen reader, which can skip a lone dash', () => {
    const never = truth({ state: 'never' })
    const hidden = never.get('.value .visually-hidden')

    expect(hidden.text()).toBe('not reported')
    expect(truth({ state: 'live' }).get('.value .visually-hidden').text()).toBe('not reported')
  })

  it('verified write: says it was read back', () => {
    const verified = truth({ state: 'verified', value: '✓ 300' })

    expect(verified.get('.note').text()).toBe('read back')
    expect(verified.get('.value').text()).toBe('✓ 300')
  })
})

describe('a value without a value', () => {
  it('shows a dash in any state that has no value to show', () => {
    expect(truth({ state: 'live' }).get('.value [aria-hidden="true"]').text()).toBe('—')
    expect(truth({ state: 'stale', ageMs: 4000 }).get('.value [aria-hidden="true"]').text()).toBe('—')
  })

  it('says only "stale" for a stale value whose age is not known, not "0 s old"', () => {
    expect(truth({ state: 'stale', value: '1' }).get('.note').text()).toBe('stale')
  })

  it('says its state in an attribute and its label and help as written', () => {
    const value = truth({ state: 'stale', value: '1', ageMs: 3500, help: 'Marked with text and pattern' })

    expect(value.attributes('data-state')).toBe('stale')
    expect(value.get('.label').text()).toBe('Battery')
    expect(value.get('.help').text()).toBe('Marked with text and pattern')
  })
})
