import { afterEach, expect, it, vi } from 'vitest'
import { SCRIPTED_MESSAGES } from './fixtures'
import { type MockControl, mockBackend } from './mock-backend'
import { useToasts } from './toasts'
import { createConfigurator } from './useConfigurator'

afterEach(() => {
  const toasts = useToasts()
  toasts.visible.value.forEach(toast => toasts.dismiss(toast.key))
})

/**
 * A fresh Configurator with the simulated vehicle connected and its messages replayed into the list.
 *
 * @returns the handle and the mock's controls
 */
async function connected() {
  const control: MockControl = {}
  const handle = createConfigurator(mockBackend({ control }))
  await handle.vehicle.connect({ transport: 'simulator' })
  await vi.waitFor(() => expect(handle.messages.list.value).toHaveLength(SCRIPTED_MESSAGES.length))

  return { handle, control }
}

/**
 * The texts of the toasts that are shown.
 *
 * @returns the texts
 */
const toastTexts = () => useToasts().visible.value.map(toast => toast.text)

it('fills the list with what the vehicle said before, oldest first, and makes no toast of it', async () => {
  const { handle } = await connected()

  expect(handle.messages.list.value.map(message => message.text)).toEqual(SCRIPTED_MESSAGES.map(([, text]) => text))
  expect(toastTexts()).toEqual([])
  expect(handle.messages.unread.value).toBe(0)
})

it('adds each new message once to the list, although two subscriptions hear it', async () => {
  const { handle, control } = await connected()

  control.say?.(6, 'Mission started')
  await vi.waitFor(() => expect(handle.messages.list.value).toHaveLength(SCRIPTED_MESSAGES.length + 1))

  expect(handle.messages.list.value.map(message => message.text).filter(text => text === 'Mission started')).toHaveLength(1)
  expect(toastTexts()).toEqual([])
})

it('makes a toast of a new warning, an error toast of a new error, and counts both as unread', async () => {
  const { handle, control } = await connected()

  control.say?.(4, 'PreArm: Battery low')
  control.say?.(3, 'Compass error')
  await vi.waitFor(() => expect(toastTexts()).toEqual(['PreArm: Battery low', 'Compass error']))

  expect(useToasts().visible.value.map(toast => toast.severity)).toEqual(['warning', 'error'])
  expect(handle.messages.unread.value).toBe(2)
})

it('makes no toast and no count of a message below a warning', async () => {
  const { handle, control } = await connected()

  control.say?.(5, 'Notice')
  control.say?.(6, 'Info')
  await vi.waitFor(() => expect(handle.messages.list.value).toHaveLength(SCRIPTED_MESSAGES.length + 2))

  expect(toastTexts()).toEqual([])
  expect(handle.messages.unread.value).toBe(0)
})

it('counts as read once the list has been looked at', async () => {
  const { handle, control } = await connected()
  control.say?.(4, 'GPS: low accuracy')
  await vi.waitFor(() => expect(handle.messages.unread.value).toBe(1))

  handle.messages.markRead()

  expect(handle.messages.unread.value).toBe(0)
})

it('tells a failsafe over the map until it is dismissed', async () => {
  const { handle, control } = await connected()
  expect(handle.messages.failsafe.value).toBeNull()

  control.say?.(2, 'Battery failsafe: returning home')
  await vi.waitFor(() => expect(handle.messages.failsafe.value?.text).toBe('Battery failsafe: returning home'))
  handle.messages.dismissFailsafe()

  expect(handle.messages.failsafe.value).toBeNull()
})

it('keeps the failsafe across a new session on the same link, and does not tell a dismissed one again', async () => {
  const { handle, control } = await connected()
  control.say?.(2, 'Battery failsafe: returning home')
  await vi.waitFor(() => expect(handle.messages.failsafe.value).not.toBeNull())
  const told = handle.messages.failsafe.value

  handle.messages.start()
  await vi.waitFor(() => expect(handle.messages.list.value.length).toBeGreaterThan(SCRIPTED_MESSAGES.length))
  expect(handle.messages.failsafe.value).toBe(told)

  handle.messages.dismissFailsafe()
  handle.messages.start()
  await vi.waitFor(() => expect(handle.messages.list.value.length).toBeGreaterThan(SCRIPTED_MESSAGES.length))
  expect(handle.messages.failsafe.value).toBeNull()
})

it('tells a failsafe that was said a moment ago when the vehicle is connected (it replays it)', async () => {
  const { handle, control } = await connected()
  control.say?.(2, 'Radio failsafe: returning home')
  await vi.waitFor(() => expect(handle.messages.failsafe.value).not.toBeNull())
  handle.messages.stop()
  expect(handle.messages.failsafe.value).toBeNull()

  handle.messages.start()

  await vi.waitFor(() => expect(handle.messages.failsafe.value?.text).toBe('Radio failsafe: returning home'))
})

it('does not take a pre-arm check that says failsafe for a failsafe', async () => {
  const { handle, control } = await connected()

  control.say?.(2, 'PreArm: Radio failsafe on')
  await vi.waitFor(() => expect(handle.messages.list.value.at(-1)?.text).toBe('PreArm: Radio failsafe on'))

  expect(handle.messages.failsafe.value).toBeNull()
})

it('drops the failsafe, and stops listening, when the vehicle is disconnected', async () => {
  const { handle, control } = await connected()
  control.say?.(2, 'Battery failsafe: returning home')
  await vi.waitFor(() => expect(handle.messages.failsafe.value).not.toBeNull())

  await handle.vehicle.disconnect()

  await vi.waitFor(() => expect(handle.messages.failsafe.value).toBeNull())
  control.say?.(4, 'GPS: low accuracy')
  expect(toastTexts()).not.toContain('GPS: low accuracy')
})

it('replays the list again on a new session without making toasts of it', async () => {
  const { handle, control } = await connected()
  control.say?.(6, 'Armed')
  await vi.waitFor(() => expect(handle.messages.list.value).toHaveLength(SCRIPTED_MESSAGES.length + 1))

  handle.messages.start()

  await vi.waitFor(() => expect(handle.messages.list.value.map(message => message.text)).toContain('Armed'))
  expect(toastTexts()).toEqual([])
})
