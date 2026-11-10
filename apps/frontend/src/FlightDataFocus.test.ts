import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { i18n } from './i18n'
import { mockBackend } from './mock-backend'
import { createAppRouter } from './router'
import Shell from './Shell.vue'
import { createConfigurator } from './useConfigurator'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  const active = document.activeElement as HTMLElement | null
  active?.blur()
})

/**
 * The whole application on the Fly screen.
 *
 * @returns the mounted shell
 */
async function fly(): Promise<VueWrapper> {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  mounted = mount(Shell, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await router.isReady()
  await flushPromises()

  return mounted
}

/**
 * Presses a key in the window, as the keyboard does (the shell listens to the window, so F6 works from anywhere).
 *
 * @param key the key
 * @param modifiers Shift, Alt and the like
 * @returns whether nobody called preventDefault (true: the key was not taken)
 */
function press(key: string, modifiers: KeyboardEventInit = {}): boolean {
  return window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }))
}

/**
 * Which region has the focus.
 *
 * @returns `rail`, `screen` or `aside`; or the tag of what else has it
 */
function focused(): string {
  const active = document.activeElement as Element
  const names: [string, string][] = [['rail', 'nav.rail'], ['screen', 'main.app-main'], ['aside', 'aside.fly-aside']]

  return names.find(([, selector]) => active.matches(selector))?.[0] ?? active.tagName
}

it('has the regions F6 goes through, in page order, out of the tab order', async () => {
  const wrapper = await fly()
  const regions = wrapper.findAll('nav.rail, main.app-main, aside.fly-aside')

  expect(regions.map(region => region.element.tagName)).toEqual(['NAV', 'MAIN', 'ASIDE'])
  expect(regions.map(region => region.attributes('tabindex'))).toEqual(['-1', '-1', '-1'])
})

it('moves the focus rail, screen, aside with F6, and round to the rail', async () => {
  await fly()

  const taken = [press('F6'), press('F6'), press('F6'), press('F6')]

  expect(taken).toEqual([false, false, false, false])
  expect(focused()).toBe('rail')
  press('F6')
  expect(focused()).toBe('screen')
})

it('goes on from where the focus is: from a link in the rail (where a click on a screen leaves it) to the screen', async () => {
  const wrapper = await fly();
  (wrapper.get('nav.rail a').element as HTMLElement).focus()

  press('F6')
  expect(focused()).toBe('screen')
  press('F6', { shiftKey: true })
  press('F6', { shiftKey: true })
  expect(focused()).toBe('aside')
})

it('starts at the rail going forwards and at the aside going backwards when nothing has the focus', async () => {
  await fly()
  press('F6')
  expect(focused()).toBe('rail');
  (document.activeElement as HTMLElement).blur()

  press('F6', { shiftKey: true })

  expect(focused()).toBe('aside')
})

it('goes through the aside to the rail, not back to the screen that holds it', async () => {
  await fly()
  press('F6')
  press('F6')
  press('F6')
  expect(focused()).toBe('aside')

  press('F6')

  expect(focused()).toBe('rail')
})

it('goes the other way with Shift+F6, starting at the aside', async () => {
  await fly()

  press('F6', { shiftKey: true })
  expect(focused()).toBe('aside')
  press('F6', { shiftKey: true })
  expect(focused()).toBe('screen')
  press('F6', { shiftKey: true })
  expect(focused()).toBe('rail')
})

it('leaves the keys with Alt, Ctrl or Meta to the system, and the other function keys alone', async () => {
  await fly()

  const taken = [press('F6', { altKey: true }), press('F6', { ctrlKey: true }), press('F6', { metaKey: true }), press('F5')]

  expect(taken).toEqual([true, true, true, true])
  expect(focused()).toBe('BODY')
})

it('stops taking the key when the application is gone', async () => {
  await fly()
  mounted?.unmount()
  mounted = undefined

  expect(press('F6')).toBe(true)
  expect(focused()).toBe('BODY')
})
