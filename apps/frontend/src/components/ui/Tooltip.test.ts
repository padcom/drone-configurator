import { afterEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { h } from 'vue'
import Tooltip from './Tooltip.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * A tooltip on a button.
 *
 * @returns the wrapper
 */
function tip(): VueWrapper {
  return mount(Tooltip, {
    props: { text: 'Written to the vehicle and read back' },
    slots: { default: ({ describedby }: { describedby?: string }) => h('button', { 'aria-describedby': describedby }, 'Write') },
    attachTo: document.body,
  })
}

describe('a tooltip', () => {
  it('is not there until the pointer is on the control, and goes when it leaves', async () => {
    const wrapper = tip()
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)

    await wrapper.trigger('mouseenter')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Written to the vehicle and read back')
    await wrapper.trigger('mouseleave')

    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('is there while the focus is in the control, and goes when it leaves', async () => {
    const wrapper = tip()

    await wrapper.get('button').trigger('focusin')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true)
    await wrapper.get('button').trigger('focusout')

    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('describes the control while it is there, so that a screen reader reads it with the control', async () => {
    const wrapper = tip()
    expect(wrapper.get('button').attributes('aria-describedby')).toBeUndefined()

    await wrapper.trigger('mouseenter')

    expect(wrapper.get('button').attributes('aria-describedby')).toBe(wrapper.get('[role="tooltip"]').attributes('id'))
  })
})

describe('a tooltip and Escape', () => {
  it('hides with Escape, and stays with the tooltip while it does (a dialog would close too)', async () => {
    const wrapper = tip()
    await wrapper.trigger('mouseenter')
    const outside = vi.fn()
    document.body.addEventListener('keydown', outside)

    await wrapper.get('button').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
    expect(outside).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    expect(outside).toHaveBeenCalledOnce()
    document.body.removeEventListener('keydown', outside)
  })
})
