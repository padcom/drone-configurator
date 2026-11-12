import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import SectionNav from './SectionNav.vue'

/**
 * The navigation on a router that knows two addresses.
 *
 * @param at where the router is
 * @returns the component
 */
async function navAt(at: string) {
  const empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/a', name: 'a', component: empty }, { path: '/b', name: 'b', component: empty }],
  })
  await router.push(at)
  await router.isReady()

  return mount(SectionNav, {
    global: { plugins: [router] },
    props: {
      label: 'Parts',
      sections: [{ id: 'a', to: { name: 'a' }, label: 'Alpha' }, { id: 'b', to: { name: 'b' }, label: 'Beta' }],
    },
  })
}

it('is a navigation with a name, a link for each part, in order', async () => {
  const wrapper = await navAt('/a')

  expect(wrapper.element.tagName).toBe('NAV')
  expect(wrapper.attributes('aria-label')).toBe('Parts')
  expect(wrapper.findAll('a').map(link => [link.text(), link.attributes('href')])).toEqual([['Alpha', '/a'], ['Beta', '/b']])
})

it('marks the part that is shown as the current page, and no other', async () => {
  const wrapper = await navAt('/b')

  expect(wrapper.findAll('a[aria-current="page"]').map(link => link.text())).toEqual(['Beta'])
})
