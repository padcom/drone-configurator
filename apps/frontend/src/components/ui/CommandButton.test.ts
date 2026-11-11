// CommandButton: a button that is a command. Its words, its icon, whether it is current and whether it may be pressed come from
// the command; a press runs it through the registry; how it looks (the look) and where the icon is (the position) are two props
// that change nothing of what it says or does.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { type Ref, ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from '@/router'
import type { Command } from '@/lib/commands/command'
import CommandButton from './CommandButton.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { useCommands } from '@/composables/useCommands'

const mounted: VueWrapper[] = []

/**
 * A command button for a command, on a router at the Flight data screen.
 *
 * @param props what it is given
 * @returns the button and the router
 */
async function buttonFor(props: Record<string, unknown>) {
  createConfigurator(mockBackend())
  const router = createAppRouter(createMemoryHistory())
  await router.push('/flight')
  const options = { props: props as { command: string }, global: { plugins: [i18n, router] }, attachTo: document.body }
  const wrapper = mount(CommandButton, options)
  mounted.push(wrapper)
  await router.isReady()
  await flushPromises()

  return { wrapper, router }
}

afterEach(() => {
  setLanguage('en')
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** A command that may not run, for the disabled button. */
const BLOCKED: Command = {
  id: 'test.blocked',
  labelKey: 'palette.vehicle.reboot.label',
  groupKey: 'palette.group.vehicle',
  icon: 'refresh',
  isEnabled: () => ({ enabled: false, reasonKey: 'palette.reason.notConnected' }),
  execute: () => ({}),
}

/** A command that may run and has no icon. */
const NO_ICON: Command = {
  id: 'test.no-icon',
  labelKey: 'palette.vehicle.reboot.label',
  groupKey: 'palette.group.vehicle',
  isEnabled: () => ({ enabled: true }),
  execute: () => ({}),
}

describe('what a command button says', () => {
  it('is a link with the route, the command\'s button words and its icon, for a command that leads somewhere', async () => {
    const { wrapper } = await buttonFor({ command: 'go.parameters' })

    expect(wrapper.element.tagName).toBe('A')
    expect(wrapper.text()).toBe('Parameters')
    expect(wrapper.attributes('href')).toBe('/parameters')
    expect(wrapper.find('svg[aria-hidden="true"]').exists()).toBe(true)
  })

  it('marks the command that is current with aria-current, and no other', async () => {
    expect((await buttonFor({ command: 'go.flight' })).wrapper.attributes('aria-current')).toBe('page')
    expect((await buttonFor({ command: 'go.plan' })).wrapper.attributes('aria-current')).toBeUndefined()
  })

  it('takes the command itself as well as its id, and draws nothing for an id that is none', async () => {
    expect((await buttonFor({ command: BLOCKED })).wrapper.get('.command-button-label').text()).toBe('Reboot flight controller')
    expect((await buttonFor({ command: 'no.such.command' })).wrapper.html()).toBe('<!--v-if-->')
  })

  it('has the words in the language of the page', async () => {
    setLanguage('pl')

    expect((await buttonFor({ command: 'go.flight' })).wrapper.text()).toBe('Dane lotu')
  })
})

describe('what a press does', () => {
  it('runs the command through the registry, and does not follow the link itself', async () => {
    const invoke = vi.spyOn(useCommands(), 'invoke')
    const { wrapper, router } = await buttonFor({ command: 'go.plan' })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    wrapper.element.dispatchEvent(click)
    await flushPromises()

    expect(click.defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plan'))
  })

  it.each([
    ['a middle click', { button: 1 }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['Cmd', { metaKey: true }],
  ])('leaves %s to the browser: a link opened elsewhere is not the command', async (_name, init) => {
    const invoke = vi.spyOn(useCommands(), 'invoke')
    const { wrapper } = await buttonFor({ command: 'go.plan' })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
    wrapper.element.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('a command that may not run', () => {
  it('is an aria-disabled button, not a native disabled one, with the reason as its description', async () => {
    const { wrapper } = await buttonFor({ command: BLOCKED })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('disabled')).toBeUndefined()
    const described = wrapper.attributes('aria-describedby') as string
    expect(wrapper.get(`#${described}`).text()).toBe('Connect to a vehicle first.')
    // The reason is not drawn: it is not part of what the button shows.
    expect(wrapper.get(`#${described}`).attributes('hidden')).toBeDefined()
  })

  it('can be focused, so its reason can be reached, and keeps the focus when it turns off under it', async () => {
    const { wrapper } = await buttonFor({ command: BLOCKED })
    const button = wrapper.element as HTMLElement
    button.focus()

    expect(document.activeElement).toBe(button)
  })
})

/**
 * A command that leads to the Logs screen and may run while the ref says so.
 *
 * @param enabled whether it may run
 * @returns the command
 */
function linkThatTurns(enabled: Ref<boolean>): Command {
  return {
    id: 'test.link',
    labelKey: 'palette.go.logs',
    groupKey: 'palette.group.navigate',
    icon: 'file',
    href: '/logs',
    isEnabled: () => (enabled.value ? { enabled: true } : { enabled: false, reasonKey: 'palette.reason.notConnected' }),
    execute: () => ({}),
  }
}

describe('a command that leads somewhere and turns off and on', () => {
  it('stays the same element and keeps the focus: an <a> with no href while it may not run', async () => {
    const enabled = ref(true)
    const { wrapper } = await buttonFor({ command: linkThatTurns(enabled) })
    const element = wrapper.element as HTMLElement
    element.focus()
    expect([element.tagName, element.getAttribute('href')]).toEqual(['A', '/logs'])

    enabled.value = false
    await flushPromises()

    expect(wrapper.element).toBe(element)
    expect(document.activeElement).toBe(element)
    expect([element.tagName, element.hasAttribute('href')]).toEqual(['A', false])
    const kept = ['role', 'tabindex', 'aria-disabled'].map(name => element.getAttribute(name))

    expect(kept).toEqual(['link', '0', 'true'])
  })
})

describe('a command that leads somewhere and may run again', () => {
  it('is a real link again when it may run again, still the same element with the focus on it', async () => {
    const enabled = ref(false)
    const { wrapper } = await buttonFor({ command: linkThatTurns(enabled) })
    const element = wrapper.element as HTMLElement
    element.focus()

    enabled.value = true
    await flushPromises()

    expect(wrapper.element).toBe(element)
    expect(document.activeElement).toBe(element)
    expect(element.getAttribute('href')).toBe('/logs')
    expect(element.hasAttribute('aria-disabled')).toBe(false)
  })
})

describe('a press on a command that may not run', () => {
  it.each([
    ['a click', () => new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })],
    ['Enter on the focused button (the browser clicks it)', () => new MouseEvent('click', { bubbles: true, cancelable: true })],
  ])('does nothing for %s: the command is not run', async (_name, make) => {
    const invoke = vi.spyOn(useCommands(), 'invoke')
    const { wrapper } = await buttonFor({ command: BLOCKED })
    const event = make()

    wrapper.element.dispatchEvent(event)
    await flushPromises()

    expect(invoke).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('where the icon is', () => {
  it.each([
    ['top', ['icon', 'label']],
    ['left', ['icon', 'label']],
    ['right', ['label', 'icon']],
    ['bottom', ['label', 'icon']],
  ] as const)('is %s: the parts in the order they are read, a class for it, and the same name', async (position, order) => {
    const { wrapper } = await buttonFor({ command: 'go.logs', iconPosition: position })
    const parts = wrapper.findAll('span').map(span => (span.find('svg').exists() ? 'icon' : 'label'))

    expect(parts).toEqual(order)
    expect(wrapper.classes()).toContain(`icon-${position}`)
    expect(wrapper.text()).toBe('Logs')
  })

  it('is none: the words alone', async () => {
    const { wrapper } = await buttonFor({ command: 'go.logs', iconPosition: 'none' })

    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.classes()).toContain('icon-none')
    expect(wrapper.text()).toBe('Logs')
  })
})

describe('icon-only', () => {
  it('is only the icon, with the words as the accessible name and the tooltip', async () => {
    const { wrapper } = await buttonFor({ command: 'go.logs', iconOnly: true })

    expect(wrapper.attributes('aria-label')).toBe('Logs')
    expect(wrapper.attributes('title')).toBe('Logs')
    expect(wrapper.get('.visually-hidden').text()).toBe('Logs')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('keeps the words for icon-only when the command has no icon: nothing else would be drawn', async () => {
    const { wrapper } = await buttonFor({ command: NO_ICON, iconOnly: true })

    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.find('.visually-hidden').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('icon-only')
    expect(wrapper.text()).toBe('Reboot flight controller')
  })
})

describe('how it looks', () => {
  it.each([
    ['rail', ['rail-item'], ['kit-button']],
    ['default', ['kit-button'], ['primary', 'flight', 'rail-item']],
    ['primary', ['kit-button', 'primary'], ['flight', 'rail-item']],
    ['flight', ['kit-button', 'flight'], ['primary', 'rail-item']],
  ] as const)('is the %s look: the classes of the rail or of the kit button, and no other', async (look, has, hasNot) => {
    const { wrapper } = await buttonFor({ command: 'go.logs', look })

    expect(wrapper.classes()).toEqual(expect.arrayContaining([...has]))
    expect(hasNot.filter(name => wrapper.classes().includes(name))).toEqual([])
  })

  it.each(['rail', 'default', 'primary', 'flight'] as const)('does not change what the %s look says (name, link)', async look => {
    const { wrapper } = await buttonFor({ command: 'go.logs', look })

    expect([wrapper.text(), wrapper.attributes('href')]).toEqual(['Logs', '/logs'])
  })

  it.each(['rail', 'default', 'primary', 'flight'] as const)('does not change what the %s look disables', async look => {
    const { wrapper } = await buttonFor({ command: BLOCKED, look })

    expect(wrapper.attributes('aria-disabled')).toBe('true')
  })

  it('is the kit\'s default look when none is asked for, with the icon over the words', async () => {
    const { wrapper } = await buttonFor({ command: 'go.logs' })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['kit-button', 'icon-top']))
  })
})
