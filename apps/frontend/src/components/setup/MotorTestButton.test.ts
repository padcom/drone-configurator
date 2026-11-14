// The hold button of the motor test: it says `press` once and `release` once, and lets go by EVERY way a hold can end (the
// pointer going up, being cancelled, leaving or losing its capture; a key going up; the focus going; the button being disabled or
// removed).
// A key that repeats is one press, and a click is not a press.
import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MotorTestButton from './MotorTestButton.vue'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * The button, mounted.
 *
 * @param disabled whether it is disabled
 * @returns the wrapper
 */
function button(disabled = false) {
  mounted = mount(MotorTestButton, { props: { disabled }, slots: { default: 'A' }, attachTo: document.body })

  return mounted
}

/**
 * What the button said, in order.
 *
 * @param wrapper the button
 * @returns `press` and `release`, as they came
 */
function said(wrapper: VueWrapper): string[] {
  return Object.keys(wrapper.emitted()).filter(name => name === 'press' || name === 'release')
    .flatMap(name => wrapper.emitted(name)!.map(() => name))
}

/**
 * A pointer event, as a browser sends it (jsdom has no PointerEvent: a mouse event of that name has the fields the button reads).
 *
 * @param wrapper the button
 * @param type the event's name
 * @param init its fields
 */
async function fire(wrapper: VueWrapper, type: string, init: MouseEventInit & { isPrimary?: boolean } = {}): Promise<void> {
  const { isPrimary, ...mouse } = init
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...mouse })
  if (isPrimary !== undefined) {
    Object.defineProperty(event, 'isPrimary', { value: isPrimary })
  }
  wrapper.element.dispatchEvent(event)
  await nextTick()
}

it('says press once when the pointer goes down, and release once when it goes up', async () => {
  const wrapper = button()
  await fire(wrapper, 'pointerdown', { button: 0 })
  expect(wrapper.attributes('aria-pressed')).toBe('true')
  await fire(wrapper, 'pointerdown', { button: 0 })
  await fire(wrapper, 'pointerup')
  await fire(wrapper, 'pointerup')

  expect(wrapper.emitted('press')).toHaveLength(1)
  expect(wrapper.emitted('release')).toHaveLength(1)
  expect(wrapper.attributes('aria-pressed')).toBe('false')
})

for (const way of ['pointercancel', 'pointerleave', 'lostpointercapture', 'blur']) {
  it(`lets go when the hold ends with ${way}`, async () => {
    const wrapper = button()
    await fire(wrapper, 'pointerdown', { button: 0 })
    await (way === 'blur' ? wrapper.trigger('blur') : fire(wrapper, way))

    expect(wrapper.emitted('release')).toHaveLength(1)
    // and nothing after it: the other ways of ending do not say it twice
    await fire(wrapper, 'pointerup')
    await wrapper.trigger('blur')
    expect(wrapper.emitted('release')).toHaveLength(1)
  })
}

it('lets go when the pointer moves off the button, and not while it moves on it', async () => {
  const wrapper = button()
  wrapper.element.getBoundingClientRect = () => ({ left: 10, right: 50, top: 10, bottom: 50 }) as DOMRect
  await fire(wrapper, 'pointerdown', { button: 0 })
  await fire(wrapper, 'pointermove', { clientX: 30, clientY: 30 })
  expect(wrapper.emitted('release')).toBeUndefined()
  await fire(wrapper, 'pointermove', { clientX: 51, clientY: 30 })
  expect(wrapper.emitted('release')).toHaveLength(1)
})

for (const key of [' ', 'Enter']) {
  it(`is held by the key "${key}", once however long it repeats, and lets go when it goes up`, async () => {
    const wrapper = button()
    await wrapper.trigger('keydown', { key })
    await wrapper.trigger('keydown', { key, repeat: true })
    await wrapper.trigger('keydown', { key, repeat: true })
    expect(wrapper.emitted('press')).toHaveLength(1)
    expect(wrapper.emitted('release')).toBeUndefined()
    await wrapper.trigger('keyup', { key })
    expect(wrapper.emitted('release')).toHaveLength(1)
  })
}

it('is not held by another key, by the secondary button, or by a click', async () => {
  const wrapper = button()
  await wrapper.trigger('keydown', { key: 'a' })
  await wrapper.trigger('keydown', { key: 'ArrowDown' })
  await fire(wrapper, 'pointerdown', { button: 2 })
  await fire(wrapper, 'pointerdown', { button: 0, isPrimary: false })
  await wrapper.trigger('click')

  expect(said(wrapper)).toEqual([])
})

it('lets go when it is disabled while held, and when it is removed while held', async () => {
  const wrapper = button()
  await fire(wrapper, 'pointerdown', { button: 0 })
  await wrapper.setProps({ disabled: true })
  expect(wrapper.emitted('release')).toHaveLength(1)

  const other = button()
  await fire(other, 'pointerdown', { button: 0 })
  other.unmount()
  expect(other.emitted('release')).toHaveLength(1)
})

it('cannot be pressed while it is disabled', async () => {
  const wrapper = button(true)
  await fire(wrapper, 'pointerdown', { button: 0 })
  await wrapper.trigger('keydown', { key: ' ' })

  expect(said(wrapper)).toEqual([])
})
