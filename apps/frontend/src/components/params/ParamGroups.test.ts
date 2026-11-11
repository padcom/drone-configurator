import { afterEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { PARAMS } from '@/mock/fixtures'
import ParamGroups from './ParamGroups.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { useParamGroup } from '@/composables/useParamGroup'

afterEach(() => {
  useParamGroup().choose('')
})

/**
 * The group list on a fresh Configurator that holds the fixture parameters.
 *
 * @returns the component and the Configurator
 */
function groups() {
  const handle = createConfigurator(mockBackend())
  feed(handle, { params: PARAMS, list: 'complete' })

  return { wrapper: mount(ParamGroups, withI18n), handle }
}

it('is a named navigation with All first and the count of every group', () => {
  const { wrapper } = groups()

  expect(wrapper.get('nav').attributes('aria-label')).toBe('Parameter groups')
  const labels = wrapper.findAll('button').map(button => button.text())
  expect(labels[0]).toBe(`All${PARAMS.length}`)
  expect(labels).toContain('BATT2')
})

it('marks the chosen group, All at first, and chooses with a click', async () => {
  const { wrapper } = groups()
  expect(wrapper.get('button[data-group=""]').attributes('aria-pressed')).toBe('true')

  await wrapper.get('button[data-group="BATT"]').trigger('click')

  expect(useParamGroup().chosen.value).toBe('BATT')
  expect(wrapper.get('button[data-group="BATT"]').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('button[data-group=""]').attributes('aria-pressed')).toBe('false')
})

it('is one stop of the Tab key: the chosen group, All at first', async () => {
  const { wrapper } = groups()
  const stops = () => wrapper.findAll('button').filter(button => button.attributes('tabindex') === '0')

  expect(stops().map(button => button.attributes('data-group'))).toEqual([''])
  await wrapper.get('button[data-group="BATT"]').trigger('click')

  expect(stops().map(button => button.attributes('data-group'))).toEqual(['BATT'])
})

it('moves the focus with Down, Up, Home and End, and the Tab stop goes with it', async () => {
  const { wrapper } = groups()
  const wrapperOnPage = mount(ParamGroups, { ...withI18n, attachTo: document.body })
  const buttons = () => wrapperOnPage.findAll('button')
  const key = async (name: string) => {
    await wrapperOnPage.get('nav').find(':focus').trigger('keydown', { key: name })
  }
  wrapper.unmount()
  const first = buttons()[0]!
  first.element.focus()

  await key('ArrowDown')
  expect(document.activeElement).toBe(buttons()[1]!.element)
  expect(buttons()[1]!.attributes('tabindex')).toBe('0')
  expect(first.attributes('tabindex')).toBe('-1')
  await key('End')
  expect(document.activeElement).toBe(buttons().at(-1)!.element)
  await key('ArrowDown')
  expect(document.activeElement).toBe(first.element)
  await key('ArrowUp')
  expect(document.activeElement).toBe(buttons().at(-1)!.element)
  await key('Home')
  expect(document.activeElement).toBe(first.element)
  wrapperOnPage.unmount()
})

it('clears the search when a group is chosen (a search for another group would leave nothing), by click or by key', async () => {
  const { wrapper, handle } = groups()
  feed(handle, { filter: 'rtl' })

  await wrapper.get('button[data-group="BATT"]').trigger('click')

  expect(handle.fields.filter.value).toBe('')
  expect(useParamGroup().chosen.value).toBe('BATT')

  // Enter or Space on a button is a click: the same function answers it. What is typed after the choice is kept.
  handle.parameters.setFilter('low')
  expect(handle.fields.filter.value).toBe('low')
  await wrapper.get('button[data-group=""]').trigger('click')
  expect(handle.fields.filter.value).toBe('')
})

it('goes back to All when the chosen group is not in the list any more', async () => {
  const { wrapper, handle } = groups()
  await wrapper.get('button[data-group="BATT"]').trigger('click')

  feed(handle, { params: PARAMS.filter(param => !param.id.startsWith('BATT_')) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('button[data-group=""]').attributes('aria-pressed')).toBe('true')
})
