// The Plan page's map as a way to edit the plan: the mode in which a click adds a waypoint (one edit that Undo takes back,
// after the selected item, a place the vehicle can keep), leaving it, and Delete on a pin. Nothing here goes to a vehicle.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import FlightMap from '@/components/map/FlightMap.vue'
import { createConfigurator } from '@/composables/useConfigurator'
import { resetPlanForTests, usePlan } from '@/composables/usePlan'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { seedPlan } from '@/testing/plan'
import Plan from './Plan.vue'

let mounted: VueWrapper | undefined

beforeEach(() => {
  resetPlanForTests()
  createConfigurator(mockBackend({ telemetryMs: 600_000 }))
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * The page, shown at the route of the Plan page.
 *
 * @returns the wrapper
 */
async function page(): Promise<VueWrapper> {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/plan', component: { template: '<div />' } }] })
  await router.push('/plan')
  await router.isReady()
  mounted = mount(Plan, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await flushPromises()

  return mounted
}

/**
 * Turns the adding mode on with the button of the map.
 *
 * @param wrapper the page
 */
async function startAdding(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('#plan-add-on-map').trigger('click')
}

/**
 * A click on the map, as the map tells it: the place under the pointer.
 *
 * @param wrapper the page
 * @param lat the latitude
 * @param lon the longitude
 */
async function clickMap(wrapper: VueWrapper, lat: number, lon: number): Promise<void> {
  wrapper.getComponent(FlightMap).vm.$emit('pick', { lat, lon })
  await flushPromises()
}

it('does not take a click on the map for an item until the mode is on, and then adds a waypoint there', async () => {
  const wrapper = await page()
  const button = wrapper.get('#plan-add-on-map')

  expect([button.attributes('aria-pressed'), wrapper.getComponent(FlightMap).props('pickable')]).toEqual(['false', false])
  await startAdding(wrapper)

  expect([button.attributes('aria-pressed'), wrapper.getComponent(FlightMap).props('pickable')]).toEqual(['true', true])
  await clickMap(wrapper, 52.2297, 21.0122)

  const [item] = usePlan().plan.value.items
  expect(item).toMatchObject({ command: 16, lat: 52.2297, lon: 21.0122, alt: 20, frame: 3 })
  expect(wrapper.findAll('.plan-pin')).toHaveLength(1)
  // (the mode stays on: the next click adds the next one)
  expect(button.attributes('aria-pressed')).toBe('true')
})

it('keeps what the vehicle can keep of a place: seven decimals', async () => {
  const wrapper = await page()
  await startAdding(wrapper)
  await clickMap(wrapper, 52.229712345678, 21.012298765432)

  expect(usePlan().plan.value.items[0]).toMatchObject({ lat: 52.2297123, lon: 21.0122988 })
})

it('puts the new waypoint after the selected item, selects it, and one Undo takes it back', async () => {
  seedPlan(3)
  const wrapper = await page()
  const plan = usePlan()
  const second = plan.plan.value.items[1]!
  plan.select(second.id)
  await startAdding(wrapper)
  await clickMap(wrapper, 52.5, 21.5)

  const ids = plan.plan.value.items.map(item => item.id)
  expect(ids).toHaveLength(4)
  expect(ids[1]).toBe(second.id)
  expect(plan.item.value).toMatchObject({ lat: 52.5, lon: 21.5 })
  expect(plan.plan.value.items[2]).toBe(plan.item.value)
  plan.undo()

  expect(plan.plan.value.items.map(item => item.id)).toEqual([ids[0], ids[1], ids[3]])
  expect(plan.selected.value).toBe(second.id)
})

it('does not take the first waypoint for a plan to fit the map to: the map stays where the person has it', async () => {
  const wrapper = await page()
  await startAdding(wrapper)
  await clickMap(wrapper, 52.2297, 21.0122)

  expect(wrapper.getComponent(FlightMap).props('fit')).toEqual([])
})

it('leaves the mode with Escape and with the button, and Escape does nothing else', async () => {
  const wrapper = await page()
  const button = wrapper.get('#plan-add-on-map')
  await startAdding(wrapper)
  // (wherever the focus is on the page: here, in the aside)
  await wrapper.get('.plan-aside').trigger('keydown', { key: 'Escape' })

  expect(button.attributes('aria-pressed')).toBe('false')
  await startAdding(wrapper)
  await button.trigger('click')

  expect(button.attributes('aria-pressed')).toBe('false')
  await wrapper.get('.plan-map').trigger('keydown', { key: 'Escape' })

  expect(usePlan().adding.value).toBe(false)
})

it('cannot be entered with a full plan, says why to a screen reader, and can be left', async () => {
  const wrapper = await page()
  const plan = usePlan()
  seedPlan(1000)
  await flushPromises()
  const button = wrapper.get('#plan-add-on-map')
  const described = (): string => wrapper.get(`#${button.attributes('aria-describedby')}`).text()

  expect(plan.full.value).toBe(true)
  expect(button.attributes('disabled')).toBeDefined()
  expect(described()).toBe('The plan has 1000 items, the most the page takes.')
  plan.setAdding(true)
  await flushPromises()

  expect(button.attributes('disabled')).toBeUndefined()
  plan.addAt(52, 21)

  expect(plan.plan.value.items).toHaveLength(1000)
})

it('ends the mode with the click that fills the plan, and the button then says why it is off', async () => {
  seedPlan(999)
  const wrapper = await page()
  await startAdding(wrapper)
  await clickMap(wrapper, 52.2, 21.2)

  expect(usePlan().plan.value.items).toHaveLength(1000)
  expect([usePlan().adding.value, wrapper.get('#plan-add-on-map').attributes('disabled')]).toEqual([false, ''])
  expect(wrapper.get('#plan-add-help').text()).toBe('The plan has 1000 items, the most the page takes.')
})

it('says, once, how to add a waypoint without a pointer', async () => {
  const wrapper = await page()

  expect(wrapper.get('#plan-add-help').text()).toContain('Without a pointer, use the list\'s Add button and the latitude and')
})

it('is not still on when the page is shown again', async () => {
  const wrapper = await page()
  await startAdding(wrapper)
  wrapper.unmount()
  mounted = undefined

  expect(usePlan().adding.value).toBe(false)
})

it('takes the item out with Delete on its pin, and Undo gives it back', async () => {
  seedPlan(3)
  const wrapper = await page()
  const plan = usePlan()
  const [first, second, third] = plan.plan.value.items
  await wrapper.findAll('.plan-pin')[1]!.trigger('keydown', { key: 'Delete' })
  await flushPromises()

  expect(plan.plan.value.items.map(item => item.id)).toEqual([first!.id, third!.id])
  expect(wrapper.findAll('.plan-pin')).toHaveLength(2)
  expect(plan.selected.value).not.toBeNull()
  plan.undo()
  await flushPromises()

  expect(plan.plan.value.items.map(item => item.id)).toEqual([first!.id, second!.id, third!.id])
})

it('takes out one item when the key is held down: the repeats of the key do nothing', async () => {
  seedPlan(5)
  const wrapper = await page()
  const plan = usePlan()
  await wrapper.findAll('.plan-pin')[1]!.trigger('keydown', { key: 'Delete' })
  await flushPromises()
  const pin = wrapper.findAll('.plan-pin')[1]!
  await Promise.all([1, 2, 3].map(() => pin.trigger('keydown', { key: 'Delete', repeat: true })))
  await flushPromises()

  expect(plan.plan.value.items).toHaveLength(4)
})
