// The top-bar mark of the RC control says, in one short word of its own, when the sticks may arm and disarm (the option is on and
// the control began with it): the person is never unaware, on any screen. It says nothing of it otherwise.
import { shallowRef } from 'vue'
import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n/i18n'
import RcIndicator from './RcIndicator.vue'

const control = {
  active: shallowRef(true),
  gateOpen: shallowRef(true),
  rudderLifted: shallowRef(false),
  disable: vi.fn(),
}

vi.mock('@/composables/useConfigurator', () => ({ useConfigurator: () => ({ rcControl: control }) }))

it('says the control is on, and says nothing of the sticks arming while the hold of the rudder is on', () => {
  control.rudderLifted.value = false
  const wrapper = mount(RcIndicator, { global: { plugins: [i18n] } })

  expect(wrapper.get('#rc-indicator').text()).toBe('RC control on')
  expect(wrapper.find('#rc-indicator-rudder').exists()).toBe(false)
  expect(wrapper.get('#rc-indicator').attributes('title')).toBe('RC control on. Press to turn it off.')
})

it('adds one short word, and says so in its name, while the sticks may arm and disarm', async () => {
  control.rudderLifted.value = true
  const wrapper = mount(RcIndicator, { global: { plugins: [i18n] } })

  expect(wrapper.get('#rc-indicator-rudder').text()).toBe('stick arm')
  expect(wrapper.get('#rc-indicator').attributes('aria-label'))
    .toBe('RC control on, and the sticks can arm and disarm. Press to turn it off.')
  control.rudderLifted.value = false
  await wrapper.vm.$nextTick()
  expect(wrapper.find('#rc-indicator-rudder').exists()).toBe(false)
})

it('is not there while the control is off, whatever the option says', () => {
  control.active.value = false
  control.rudderLifted.value = true

  expect(mount(RcIndicator, { global: { plugins: [i18n] } }).find('#rc-indicator').exists()).toBe(false)
})
