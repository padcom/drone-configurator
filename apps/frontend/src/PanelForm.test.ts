import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PanelForm from './PanelForm.vue'
import type { FormRow } from './panelForm'
import { withI18n } from './testing'

const ROWS: FormRow[] = [
  { kind: 'head', id: 'h', text: 'Failsafe' },
  { kind: 'note', id: 'n', text: 'Used when the link is lost.' },
  { kind: 'warn', id: 'w', text: 'Test with the propellers off.' },
  { kind: 'info', id: 'i', label: 'Firmware', value: '4.5.7' },
  { kind: 'slider', id: 's', label: 'Return altitude', value: 20, min: 5, max: 100, step: 1, text: '20 m' },
  { kind: 'check', id: 'c', label: 'Return on low battery', value: true },
  { kind: 'text', id: 't', label: 'Name', value: 'Quad 1', placeholder: 'A name' },
  {
    kind: 'enum',
    id: 'e',
    label: 'Failsafe action',
    value: 1,
    options: [{ value: 0, label: 'Report only' }, { value: 1, label: 'Land' }],
  },
  { kind: 'button', id: 'b', label: 'Save', tone: 'primary' },
]

/**
 * The form with its rows.
 *
 * @param rows what to show
 * @returns the wrapper
 */
const form = (rows: FormRow[] = ROWS) => mount(PanelForm, { ...withI18n, props: { rows } })

describe('the rows of a form', () => {
  it('has a heading, a note, a warning that is read out as an alert, and a value that cannot be changed', () => {
    const wrapper = form()

    expect(wrapper.get('h3').text()).toBe('Failsafe')
    expect(wrapper.get('.form-note').text()).toBe('Used when the link is lost.')
    expect(wrapper.get('.form-warn').attributes('role')).toBe('alert')
    expect(wrapper.get('.form-info').text()).toContain('Firmware')
    expect(wrapper.get('.form-info .value').text()).toBe('4.5.7')
  })

  it('has a slider with its value in words, a tick, a text field in the mono face and an enum field', () => {
    const wrapper = form()

    expect(wrapper.get('.form-slider .value').text()).toBe('20 m')
    expect((wrapper.get('.form-slider input').element as HTMLInputElement).value).toBe('20')
    expect(wrapper.get('.kit-check').text()).toBe('Return on low battery')
    expect(wrapper.get('.kit-input.mono').attributes('placeholder')).toBe('A name')
    const combobox = wrapper.get('[role="combobox"]')

    expect(wrapper.get(`label[for="${combobox.attributes('id')}"]`).text()).toBe('Failsafe action')
  })

  it('has a button, drawn as it is asked to be', () => {
    expect(form().get('button.form-button').classes()).toContain('primary')
  })

  it('has nothing for no rows', () => {
    expect(form([]).get('.panel-form').element.children).toHaveLength(0)
  })
})

describe('what the user does', () => {
  it('is said with the id of the row and the new value', async () => {
    const wrapper = form()

    await wrapper.get('.form-slider input').setValue('35')
    await wrapper.get('.kit-check input').setValue(false)
    await wrapper.get('.kit-input.mono').setValue('Quad 2')
    await wrapper.get('button.form-button').trigger('click')

    expect(wrapper.emitted('change')).toEqual([['s', 35], ['c', false], ['t', 'Quad 2']])
    expect(wrapper.emitted('press')).toEqual([['b']])
  })

  it('includes an enum field picking a value', async () => {
    const wrapper = form()
    await wrapper.get('[role="combobox"]').trigger('focus')

    await wrapper.findAll('[role="option"]')[0]?.trigger('click')

    expect(wrapper.emitted('change')).toEqual([['e', 0]])
  })

  it('does not change the rows itself: the caller owns the values', async () => {
    const wrapper = form()

    await wrapper.get('.kit-check input').setValue(false)

    expect(ROWS.find(row => row.id === 'c')).toMatchObject({ value: true })
    expect(wrapper.emitted('change')).toEqual([['c', false]])
  })
})
