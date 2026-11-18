// The page layout of the columns: a top that stays, a body that scrolls and a bottom that stays, in a row that stacks.
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import PageSplit from './PageSplit.vue'
import Pane from './Pane.vue'

it('has a top, a body and a bottom, in that order, and the body is what is between', () => {
  const wrapper = mount(Pane, {
    slots: {
      top: () => h('p', { id: 'up' }, 'top'),
      default: () => h('p', { id: 'middle' }, 'body'),
      bottom: () => h('p', { id: 'down' }, 'bottom'),
    },
  })
  const parts = wrapper.get('.pane').element.children

  expect([...parts].map(part => part.className)).toEqual(['pane-top', 'pane-body', 'pane-bottom'])
  expect(wrapper.get('.pane-top #up').text()).toBe('top')
  expect(wrapper.get('.pane-body #middle').text()).toBe('body')
  expect(wrapper.get('.pane-bottom #down').text()).toBe('bottom')
})

it('has no top and no bottom where nothing is given for them (no empty box with a padding of its own)', () => {
  const wrapper = mount(Pane, { slots: { default: () => h('p', 'body') } })

  expect(wrapper.find('.pane-top').exists()).toBe(false)
  expect(wrapper.find('.pane-bottom').exists()).toBe(false)
  expect(wrapper.get('.pane-body').text()).toBe('body')
})

it('is the element that is asked for, and says when what is in its body scrolls by itself', () => {
  const wrapper = mount(Pane, { props: { tag: 'aside', contain: true }, slots: { default: () => h('p', 'body') } })

  expect(wrapper.element.tagName).toBe('ASIDE')
  expect(wrapper.classes()).toEqual(['pane', 'contain'])
})

it('is a row for the columns of a page', () => {
  const wrapper = mount(PageSplit, { slots: { default: () => [h(Pane), h(Pane, { tag: 'aside' })] } })

  expect(wrapper.classes()).toEqual(['page-split'])
  expect(wrapper.findAll('.pane')).toHaveLength(2)
})
