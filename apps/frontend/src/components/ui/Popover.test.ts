import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import Popover from './Popover.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * A popover with a line of details, in the page (the focus needs it there), next to another button.
 *
 * @returns the wrapper
 */
function popover(): VueWrapper {
  return mount({
    components: { Popover },
    template: `
      <div>
        <Popover label="Link 98%, good: show the details" title="Link quality">
          <template #trigger>98%</template>
          <p>Latency 68 ms</p>
        </Popover>
        <button id="elsewhere" type="button">Elsewhere</button>
      </div>`,
  }, { attachTo: document.body })
}

describe('a popover', () => {
  it('is a button that says what it opens and whether it is open', () => {
    const trigger = popover().get('.trigger')

    expect(trigger.attributes('aria-label')).toBe('Link 98%, good: show the details')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.text()).toBe('98%')
  })

  it('opens a titled panel on a press, takes the focus into it, and closes on the next press', async () => {
    const wrapper = popover()
    await wrapper.get('.trigger').trigger('click')
    const panel = wrapper.get('[role="dialog"]')

    expect(wrapper.get('.trigger').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.trigger').attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(document.getElementById(panel.attributes('aria-labelledby') ?? '')?.textContent).toBe('Link quality')
    expect(panel.text()).toContain('Latency 68 ms')
    expect(document.activeElement).toBe(panel.element)
    await wrapper.get('.trigger').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})

describe('a popover that is open', () => {
  it('closes with Escape and puts the focus back on the button', async () => {
    const wrapper = popover()
    await wrapper.get('.trigger').trigger('click')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.trigger').element)
  })

  it('closes when the focus or a press goes elsewhere', async () => {
    const wrapper = popover()
    await wrapper.get('.trigger').trigger('click')
    const elsewhere = wrapper.get('#elsewhere')
    await wrapper.get('[role="dialog"]').trigger('focusout', { relatedTarget: elsewhere.element })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.get('.trigger').trigger('click')
    elsewhere.element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
