import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import Badge from './Badge.vue'
import Button from './Button.vue'
import Checkbox from './Checkbox.vue'
import Select from './Select.vue'
import TextInput from './TextInput.vue'
import Toggle from './Toggle.vue'

const mounted: VueWrapper[] = []

/**
 * Mounts a control in the document (focus needs it to be there). Every control a test mounts is removed after it.
 *
 * @param component the control
 * @param options props, attributes and slots
 * @returns the wrapper
 */
function put(component: Parameters<typeof mount>[0], options: Parameters<typeof mount>[1] = {}): VueWrapper {
  const wrapper = mount(component, { ...options, attachTo: document.body })
  mounted.push(wrapper)

  return wrapper
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount()
  }
})

it('has a button that is a native button, of type button unless it says otherwise', () => {
  expect(put(Button, { slots: { default: 'Write' } }).html()).toContain('<button class="kit-button" type="button">Write</button>')
  expect(put(Button, { props: { type: 'submit' } }).attributes('type')).toBe('submit')
  expect(put(Button, { props: { variant: 'primary' } }).classes()).toContain('primary')
})

it('clicks a button, and does nothing when it is disabled', async () => {
  const onClick = vi.fn()
  const enabled = put(Button, { attrs: { onClick } })
  await enabled.trigger('click')
  expect(onClick).toHaveBeenCalledTimes(1)

  const disabled = put(Button, { attrs: { onClick, disabled: true } })
  await disabled.trigger('click')
  expect(disabled.attributes('disabled')).toBeDefined()
  expect(onClick).toHaveBeenCalledTimes(1)
})

it('puts a button in the tab order, and a disabled one out of it', () => {
  const enabled = put(Button)
  enabled.element.focus()
  expect(document.activeElement).toBe(enabled.element)

  const disabled = put(Button, { attrs: { disabled: true } })
  disabled.element.focus()
  expect(document.activeElement).not.toBe(disabled.element)
})

it('has a text field that is a native input, with the value of its model', async () => {
  const field = put(TextInput, { props: { modelValue: 'RTL_ALT' }, attrs: { placeholder: 'name' } })
  const input = field.find<HTMLInputElement>('input')

  expect(input.element.value).toBe('RTL_ALT')
  expect(input.attributes('placeholder')).toBe('name')
  expect(input.attributes('type')).toBe('text')
  await input.setValue('BATT')
  expect(field.emitted('update:modelValue')).toEqual([['BATT']])
})

it('says that a text field is invalid in words for a screen reader, and in colour', () => {
  const valid = put(TextInput)
  expect(valid.attributes('aria-invalid')).toBeUndefined()

  const invalid = put(TextInput, { props: { invalid: true } })
  expect(invalid.attributes('aria-invalid')).toBe('true')
  expect(invalid.classes()).toContain('invalid')
})

it('lets a text field be another type or be disabled, as an input can', () => {
  const field = put(TextInput, { attrs: { type: 'password', disabled: true } })

  expect(field.attributes('type')).toBe('password')
  expect(field.attributes('disabled')).toBeDefined()
})

it('has a select that is a native select with its options, choosing by the model', async () => {
  const options = [{ value: 'udp', label: 'UDP' }, { value: 'tcp', label: 'TCP' }]
  const select = put(Select, { props: { options, modelValue: 'tcp' } })

  expect(select.findAll('option').map(option => option.text())).toEqual(['UDP', 'TCP'])
  expect(select.find<HTMLSelectElement>('select').element.value).toBe('tcp')
  await select.setValue('udp')
  expect(select.emitted('update:modelValue')).toEqual([['udp']])
})

it('has a checkbox with its words in its label, so a click on them counts', async () => {
  const check = put(Checkbox, { props: { modelValue: false }, slots: { default: 'Keep a backup' } })
  const input = check.find<HTMLInputElement>('input')

  expect(check.element.tagName).toBe('LABEL')
  expect(check.text()).toBe('Keep a backup')
  expect(input.attributes('type')).toBe('checkbox')
  await input.setValue(true)
  expect(check.emitted('update:modelValue')).toEqual([[true]])
})

it('gives a checkbox its attributes, not its label', () => {
  const check = put(Checkbox, { attrs: { disabled: true, name: 'backup' } })

  expect(check.find('input').attributes('disabled')).toBeDefined()
  expect(check.find('input').attributes('name')).toBe('backup')
  expect(check.attributes('disabled')).toBeUndefined()
})

it('has a toggle that is a switch, which says whether it is on', async () => {
  const toggle = put(Toggle, { props: { modelValue: false }, slots: { default: 'Dark theme' } })

  expect(toggle.element.tagName).toBe('BUTTON')
  expect(toggle.attributes('role')).toBe('switch')
  expect(toggle.attributes('aria-checked')).toBe('false')
  expect(toggle.text()).toBe('Dark theme')
  await toggle.trigger('click')
  expect(toggle.emitted('update:modelValue')).toEqual([[true]])

  await toggle.setProps({ modelValue: true })
  expect(toggle.attributes('aria-checked')).toBe('true')
  await toggle.trigger('click')
  expect(toggle.emitted('update:modelValue')?.at(-1)).toEqual([false])
})

it('keeps a toggle in the tab order, and a disabled one off and unclickable', async () => {
  const on = put(Toggle)
  on.element.focus()
  expect(document.activeElement).toBe(on.element)

  const off = put(Toggle, { attrs: { disabled: true } })
  await off.trigger('click')
  expect(off.emitted('update:modelValue')).toBeUndefined()
  off.element.focus()
  expect(document.activeElement).not.toBe(off.element)
})

it('has a badge with a tone, neutral unless it says otherwise', () => {
  expect(put(Badge, { slots: { default: 'connected' } }).classes()).toEqual(['kit-badge', 'neutral'])
  expect(put(Badge, { props: { tone: 'ok' } }).classes()).toContain('ok')
  expect(put(Badge, { props: { tone: 'warn' } }).classes()).toContain('warn')
  expect(put(Badge, { props: { tone: 'error' } }).classes()).toContain('error')
  expect(put(Badge, { props: { tone: 'info' } }).classes()).toContain('info')
  expect(put(Badge, { slots: { default: 'lost' } }).text()).toBe('lost')
})

it('has a button for the action on the vehicle in flight, beside the primary one and the outline', () => {
  expect(put(Button, { props: { variant: 'flight' } }).classes()).toEqual(['kit-button', 'flight'])
  expect(put(Button).classes()).toEqual(['kit-button'])
  expect(put(Button, { props: { variant: 'primary' } }).classes()).toEqual(['kit-button', 'primary'])
})

it('has a text field for a value, in the mono face, and a large one for a value being edited', () => {
  expect(put(TextInput).classes()).toEqual(['kit-input'])
  expect(put(TextInput, { props: { mono: true } }).classes()).toContain('mono')
  expect(put(TextInput, { props: { mono: true, large: true } }).classes()).toEqual(['kit-input', 'mono', 'large'])
})
