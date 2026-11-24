import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, mount } from '@vue/test-utils'
import { ref } from 'vue'
import DropPanel from './DropPanel.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * A panel with one setting, in the page (the focus needs it there), next to another button.
 *
 * @returns the wrapper
 */
function dropPanel(): VueWrapper {
  return mount({
    components: { DropPanel },
    setup: () => ({ on: ref(false) }),
    template: `
      <div>
        <DropPanel label="Filters" title="Filters" :count="on ? 1 : 0" count-text="1 on">
          <label><input id="setting" v-model="on" type="checkbox"> Modified</label>
        </DropPanel>
        <button id="elsewhere" type="button">Elsewhere</button>
      </div>`,
  }, { attachTo: document.body })
}

it('is a button with its words, that says whether its panel is open', () => {
  const trigger = dropPanel().get('.trigger')

  expect(trigger.text()).toBe('Filters')
  expect(trigger.attributes('aria-expanded')).toBe('false')
})

it('opens a titled panel of controls that stays open while they are used, and counts the settings in force', async () => {
  const wrapper = dropPanel()
  await wrapper.get('.trigger').trigger('click')
  const panel = wrapper.get('[role="dialog"]')
  expect(document.activeElement).toBe(panel.element)
  expect(document.getElementById(panel.attributes('aria-labelledby') ?? '')?.textContent).toBe('Filters')

  await wrapper.get('#setting').setValue(true)

  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  expect(wrapper.get('.trigger .count').text()).toBe('1 on')
  expect(wrapper.get('.trigger').text()).toBe('Filters1 on')
})

it('closes on Escape with the focus back on its button, and on a press elsewhere', async () => {
  const wrapper = dropPanel()
  await wrapper.get('.trigger').trigger('click')

  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.trigger').element)

  await wrapper.get('.trigger').trigger('click')
  document.getElementById('elsewhere')?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})
