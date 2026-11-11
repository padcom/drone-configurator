import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import ToastHost from './ToastHost.vue'
import { withI18n } from '@/testing/testing'
import { SHOW_MS, type Toasts, createToasts } from '@/composables/toasts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/**
 * The host on a queue of its own.
 *
 * @returns the host and the queue
 */
function host(): { wrapper: VueWrapper, toasts: Toasts } {
  const toasts = createToasts()

  return { wrapper: mount(ToastHost, { ...withI18n, props: { queue: toasts }, attachTo: document.body }), toasts }
}

describe('the toast region', () => {
  it('is there from the start, named, so that what comes up in it is read out', () => {
    const { wrapper } = host()

    expect(wrapper.get('[role="region"]').attributes('aria-label')).toBe('Notifications')
    expect(wrapper.findAll('.kit-toast')).toHaveLength(0)
  })
})

describe('the live regions of the toast region', () => {
  it('has its polite and its assertive live region from the start, empty, so that what comes up in them is announced', () => {
    const { wrapper } = host()

    expect(wrapper.findAll('.kit-toast-group').map(g => g.attributes('role'))).toEqual(['status', 'alert'])
    expect(wrapper.findAll('.kit-toast-group').map(g => g.element.children.length)).toEqual([0, 0])
    // Only what is new is read out, not the whole list again each time a toast comes or goes.
    expect(wrapper.findAll('.kit-toast-group').map(g => [g.attributes('aria-atomic'), g.attributes('aria-relevant')]))
      .toEqual([['false', 'additions text'], ['false', 'additions text']])
  })

  it('shows a toast with its glyph and its words, politely for a status and at once for an error', async () => {
    const { wrapper, toasts } = host()

    toasts.push({ severity: 'success', text: 'Mission written and read back' })
    toasts.push({ severity: 'error', text: 'The vehicle reports 2500, not 3000' })
    await wrapper.vm.$nextTick()
    const items = wrapper.findAll('.kit-toast')

    expect(items.map(i => i.element.parentElement?.getAttribute('role'))).toEqual(['status', 'alert'])
    expect(items.map(i => i.attributes('role'))).toEqual([undefined, undefined])
    expect(items.map(i => i.text())).toEqual([
      expect.stringContaining('Mission written and read back'),
      expect.stringContaining('The vehicle reports 2500, not 3000'),
    ])
    expect(items.map(i => i.find('svg.glyph').exists())).toEqual([true, true])
    expect(items.map(i => i.classes().at(-1))).toEqual(['sev-success', 'sev-error'])
    expect(items.every(i => !i.classes().includes('error'))).toBe(true)
  })
})

describe('the toast region, when it is busy', () => {
  it('says how many times an event came, and how many toasts wait', async () => {
    const { wrapper, toasts } = host()

    toasts.push({ severity: 'warning', text: 'GPS: 6 satellites' })
    toasts.push({ severity: 'warning', text: 'GPS: 6 satellites' });
    ['n0', 'n1', 'n2', 'n3', 'n4'].forEach(text => toasts.push({ severity: 'success', text }))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.count').text()).toBe('×2')
    expect(wrapper.get('.more').text()).toBe('2 more waiting')
  })
})

describe('what the user does with a toast', () => {
  it('dismisses it with its button, which has a name', async () => {
    const { wrapper, toasts } = host()
    toasts.push({ severity: 'success', text: 'one' })
    await wrapper.vm.$nextTick()
    const button = wrapper.get('.dismiss')
    expect(button.attributes('aria-label')).toBe('Dismiss')

    await button.trigger('click')

    expect(wrapper.findAll('.kit-toast')).toHaveLength(0)
  })
})

describe('a toast with a bar', () => {
  it('draws the bar and its figure for the eye only, and tells the callback the user closed it', async () => {
    const { wrapper, toasts } = host()
    const reasons: string[] = []
    toasts.push({
      severity: 'success',
      text: 'Downloading',
      sticky: true,
      progress: { value: 3, max: 4, label: '75 %' },
      onDismiss: reason => reasons.push(reason),
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.progress').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.fill').attributes('style')).toContain('width: 75%')
    expect(wrapper.get('.progress .label').text()).toBe('75 %')
    await wrapper.get('.dismiss').trigger('click')

    expect(reasons).toEqual(['manual'])
    expect(wrapper.findAll('.kit-toast')).toHaveLength(0)
  })

  it('has no bar when it has no progress, and a bar with nothing to do is empty', async () => {
    const { wrapper, toasts } = host()
    toasts.push({ severity: 'success', text: 'plain' })
    toasts.push({ severity: 'success', text: 'empty', progress: { value: 0, max: 0 } })
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.progress')).toHaveLength(1)
    expect(wrapper.get('.fill').attributes('style')).toContain('width: 0%')
  })
})

describe('what the pointer and the focus do to a toast', () => {
  it('keeps it while the pointer is on it, and lets it go after', async () => {
    const { wrapper, toasts } = host()
    toasts.push({ severity: 'success', text: 'one' })
    await wrapper.vm.$nextTick()
    const toast = wrapper.get('.kit-toast')

    await toast.trigger('mouseenter')
    vi.advanceTimersByTime(SHOW_MS * 3)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.kit-toast')).toHaveLength(1)
    await toast.trigger('mouseleave')
    vi.advanceTimersByTime(SHOW_MS)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.kit-toast')).toHaveLength(0)
  })
})

describe('what the pointer and the focus do together', () => {
  it('keeps it while the focus is in it after the pointer has left', async () => {
    const { wrapper, toasts } = host()
    toasts.push({ severity: 'success', text: 'one' })
    await wrapper.vm.$nextTick()
    const toast = wrapper.get('.kit-toast')

    await toast.trigger('mouseenter')
    await wrapper.get('.dismiss').trigger('focusin')
    await toast.trigger('mouseleave')
    vi.advanceTimersByTime(SHOW_MS * 3)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.kit-toast')).toHaveLength(1)
  })
})

describe('what the focus does to a toast', () => {
  it('keeps it while the focus moves within it, and lets it go when the focus leaves it', async () => {
    const { wrapper, toasts } = host()
    toasts.push({ severity: 'success', text: 'one' })
    await wrapper.vm.$nextTick()
    const toast = wrapper.get('.kit-toast')

    await wrapper.get('.dismiss').trigger('focusin')
    await toast.trigger('focusout', { relatedTarget: wrapper.get('.dismiss').element })
    vi.advanceTimersByTime(SHOW_MS * 3)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.kit-toast')).toHaveLength(1)
    await toast.trigger('focusout', { relatedTarget: document.body })
    vi.advanceTimersByTime(SHOW_MS)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.kit-toast')).toHaveLength(0)
  })
})
