import { expect, it } from 'vitest'
import { isPlainKey } from './keys'

it('takes a key with no modifier, or only Shift, as the control\'s own', () => {
  expect(isPlainKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(true)
  expect(isPlainKey(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))).toBe(true)
})

it('leaves a key with Alt, Ctrl or Meta to the browser and the system', () => {
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
    expect(isPlainKey(new KeyboardEvent('keydown', { key: 'ArrowLeft', [modifier]: true })), modifier).toBe(false)
  }
})
