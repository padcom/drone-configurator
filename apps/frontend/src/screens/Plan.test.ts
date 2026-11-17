// The Plan page: items put in with the buttons of the list (the palette's commands), selected, edited in the form, taken back
// with Undo, the route drawn from their places, what is wrong with the plan said and what the vehicle keeps said where it keeps
// less. Offline: no vehicle is needed, and nothing here sends anything.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createConfigurator } from '@/composables/useConfigurator'
import { resetPlanForTests } from '@/composables/usePlan'
import { i18n, setLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { seedPlan } from '@/testing/plan'
import Plan from './Plan.vue'

let mounted: VueWrapper | undefined

beforeEach(() => {
  resetPlanForTests()
  createConfigurator(mockBackend({ telemetryMs: 600_000 }))
})

afterEach(() => {
  setLanguage('en')
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * The page, shown at the route of the Plan page (its commands are offered there).
 *
 * @returns the wrapper
 */
async function page(): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/plan', component: { template: '<div />' } },
      { path: '/other', component: { template: '<div />' } },
    ],
  })
  await router.push('/plan')
  await router.isReady()
  mounted = mount(Plan, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await flushPromises()

  return mounted
}

/**
 * Presses a button of the list's bar by the command it runs.
 *
 * @param wrapper the page
 * @param command the command's id
 */
async function press(wrapper: VueWrapper, command: string): Promise<void> {
  await wrapper.get(`[data-command-button="${command}"]`).trigger('click')
  await flushPromises()
}

/**
 * Types into a field of the form.
 *
 * @param wrapper the page
 * @param id the field's id
 * @param text what to type
 */
async function typeInto(wrapper: VueWrapper, id: string, text: string): Promise<void> {
  await wrapper.get(`#${id}`).setValue(text)
  await flushPromises()
}

/**
 * The rows of the list: the number, what it is and its value, one string each.
 *
 * @param wrapper the page
 * @returns the rows as text
 */
function rows(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.plan-item').map(row => row.findAll('span').map(part => part.text()).join(' ').trim())
}

it('starts empty: it says so, offers Add a waypoint and nothing that needs an item, and Undo is off', async () => {
  const wrapper = await page()

  expect(wrapper.text()).toContain('No items yet')
  expect(wrapper.get('[data-command-button="plan.addWaypoint"]').attributes('aria-disabled')).toBeUndefined()

  for (const command of ['plan.duplicate', 'plan.delete', 'plan.moveUp', 'plan.moveDown', 'plan.undo', 'plan.redo']) {
    expect(wrapper.get(`[data-command-button="${command}"]`).attributes('aria-disabled')).toBe('true')
  }
  expect(wrapper.text()).toContain('The plan is empty')
  expect(wrapper.text()).toContain('Offline plan: it is not on a vehicle.')
})

it('adds a waypoint, selects it, and shows its form with the place that is not set said to be wrong', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')

  expect(rows(wrapper)).toEqual(['1 Waypoint 20 m'])
  expect(wrapper.get('.plan-item').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('#plan-detail-title').text()).toBe('Item 1: Waypoint')
  expect(wrapper.text()).toContain('Errors: 1')
  expect(wrapper.text()).toContain('Item 1: The place is not set.')
  expect(wrapper.text()).toContain('The first item that flies is not a takeoff')
})

it('draws the route from the places typed, numbered as the items are, and measures it', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-lat', '52.2297')
  await typeInto(wrapper, 'plan-lon', '21.0122')
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-lat', '52.2307')
  await typeInto(wrapper, 'plan-lon', '21.0122')

  expect(wrapper.findAll('.plan-pin')).toHaveLength(2)
  expect(wrapper.findAll('.plan-pin text').map(text => text.text())).toEqual(['1', '2'])
  expect(wrapper.text()).not.toContain('The place is not set')
  // about 111 m north
  expect(wrapper.get('.plan-stats').text()).toMatch(/Distance\s*111 m/u)
  // a pin selects its item
  await wrapper.findAll('.plan-pin')[0]?.trigger('click')

  expect(wrapper.get('#plan-detail-title').text()).toBe('Item 1: Waypoint')
})

it('draws the plan over the map: a line from two places, a pin for each, named by its item, the selected marked', async () => {
  seedPlan(1)
  const wrapper = await page()

  expect(wrapper.find('.plan-route').exists()).toBe(false)
  expect(wrapper.findAll('.plan-pin')).toHaveLength(1)
  seedPlan(2)
  await flushPromises()

  const pins = wrapper.findAll('.plan-pin')
  expect(wrapper.find('.plan-route').exists()).toBe(true)
  expect(pins.map(pin => pin.attributes('aria-label'))).toEqual(['Item 1', 'Item 2', 'Item 3'])
  expect(pins.map(pin => pin.classes('selected'))).toEqual([false, false, true])
  expect(pins.map(pin => pin.attributes('aria-pressed'))).toEqual(['false', 'false', 'true'])
})

it('selects an item from its pin with the keyboard too, and leaves an item that has no place off the map', async () => {
  seedPlan(2)
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')

  // (the third item has no place yet: it is in the list, not on the map)
  expect(wrapper.findAll('.plan-item')).toHaveLength(3)
  expect(wrapper.findAll('.plan-pin')).toHaveLength(2)
  await wrapper.findAll('.plan-pin')[0]?.trigger('keydown', { key: 'Enter' })
  expect(wrapper.get('#plan-detail-title').text()).toBe('Item 1: Waypoint')
  await wrapper.findAll('.plan-pin')[1]?.trigger('keydown', { key: ' ' })

  expect(wrapper.get('#plan-detail-title').text()).toBe('Item 2: Waypoint')
})

it('says what the vehicle keeps where it keeps less: a hold as a whole number, an altitude to the centimetre', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-field-holdTime', '1.5')

  expect(wrapper.get('[data-testid="kept"]').text()).toBe('The vehicle keeps 1.')
  await typeInto(wrapper, 'plan-field-holdTime', '2')

  expect(wrapper.find('[data-testid="kept"]').exists()).toBe(false)
  await typeInto(wrapper, 'plan-alt', '25.004')

  expect(wrapper.get('[data-testid="kept-alt"]').text()).toBe('The vehicle keeps 25 m.')
})

it('takes a field that is not a number for wrong, and says what a field takes at most and at least', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-field-holdTime', 'abc')

  expect(wrapper.get('#plan-field-holdTime').attributes('aria-invalid')).toBe('true')
  await typeInto(wrapper, 'plan-field-holdTime', '70000')

  expect(wrapper.text()).toContain('Hold: at most 65535.')
  await typeInto(wrapper, 'plan-field-holdTime', '-1')

  expect(wrapper.text()).toContain('Hold: at least 0.')
})

it('takes Undo and Redo through everything: an item added, a field typed (one edit), an item deleted', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-alt', '3')
  await typeInto(wrapper, 'plan-alt', '35')
  await press(wrapper, 'plan.addWaypoint')
  await press(wrapper, 'plan.delete')

  expect(rows(wrapper)).toEqual(['1 Waypoint 35 m'])
  await press(wrapper, 'plan.undo')

  expect(rows(wrapper)).toEqual(['1 Waypoint 35 m', '2 Waypoint 20 m'])
  await press(wrapper, 'plan.undo')
  await press(wrapper, 'plan.undo')

  // (the two changes of the altitude were one edit)
  expect(rows(wrapper)).toEqual(['1 Waypoint 20 m'])
  await press(wrapper, 'plan.redo')

  expect(rows(wrapper)).toEqual(['1 Waypoint 35 m'])
  expect((wrapper.get('#plan-alt').element as HTMLInputElement).value).toBe('35')
})

it('adds another command from the list, with the fields of that command, and moves and duplicates items', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await wrapper.get('.plan-add-other select').setValue('178')
  await flushPromises()

  expect(rows(wrapper)).toEqual(['1 Waypoint 20 m', '2 Change speed 5 m/s'])
  expect(wrapper.get('#plan-detail-title').text()).toBe('Item 2: Change speed')
  // (a command of the mission's own frame has no place and no altitude)
  expect(wrapper.find('#plan-lat').exists()).toBe(false)
  expect(wrapper.find('#plan-alt').exists()).toBe(false)
  await press(wrapper, 'plan.moveUp')

  expect(rows(wrapper)).toEqual(['1 Change speed 5 m/s', '2 Waypoint 20 m'])
  await press(wrapper, 'plan.duplicate')

  expect(rows(wrapper)).toEqual(['1 Change speed 5 m/s', '2 Change speed 5 m/s', '3 Waypoint 20 m'])
  expect(wrapper.get('[data-command-button="plan.moveUp"]').attributes('aria-disabled')).toBeUndefined()
})

it('keeps a jump on the item it names when an item is put in before it, and says a jump with no target is wrong', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await press(wrapper, 'plan.addWaypoint')
  await wrapper.get('.plan-add-other select').setValue('177')
  await flushPromises()

  expect(wrapper.text()).toContain('The jump needs the number of an item of the plan.')
  await typeInto(wrapper, 'plan-field-jumpTo', '2')

  expect(wrapper.text()).not.toContain('The jump needs the number')
  // an item put in at the top moves the target (item 2 is item 3 now)
  await wrapper.findAll('.plan-item')[0]?.trigger('click')
  await wrapper.get('[data-command-button="plan.moveUp"]').trigger('click')
  await press(wrapper, 'plan.addWaypoint')
  await wrapper.findAll('.plan-item')[3]?.trigger('click')

  expect((wrapper.get('#plan-field-jumpTo').element as HTMLInputElement).value).toBe('3')
})

it('names the plan, and Undo takes the name back', async () => {
  const wrapper = await page()
  await wrapper.get('#plan-name').setValue('North field')
  await flushPromises()

  expect((wrapper.get('#plan-name').element as HTMLInputElement).value).toBe('North field')
  await press(wrapper, 'plan.undo')

  expect((wrapper.get('#plan-name').element as HTMLInputElement).value).toBe('')
})

it('takes text that is no number for nothing: the plan says so, and the field keeps the text', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-field-holdTime', '12')
  await typeInto(wrapper, 'plan-field-holdTime', '12x')

  expect(wrapper.text()).toContain('Hold: type a number.')
  expect(wrapper.text()).toContain('Errors: 2')
  expect((wrapper.get('#plan-field-holdTime').element as HTMLInputElement).value).toBe('12x')
  await typeInto(wrapper, 'plan-alt', 'abc')

  expect(wrapper.text()).toContain('The altitude is not set.')
  expect((wrapper.get('#plan-alt').element as HTMLInputElement).value).toBe('abc')
})

it('says in words what is wrong with an altitude: out of range, below home, and none for a takeoff', async () => {
  const wrapper = await page()
  await press(wrapper, 'plan.addWaypoint')
  await typeInto(wrapper, 'plan-alt', '99999')

  expect(wrapper.get('.plan-detail-problems').text()).toContain('The altitude is more than 10000 m.')
  expect(wrapper.get('#plan-alt').attributes('aria-invalid')).toBe('true')
  await typeInto(wrapper, 'plan-alt', '-5')

  expect(wrapper.get('.plan-detail-problems').text()).toContain('The altitude is below home.')
  await wrapper.get('.plan-add-other select').setValue('22')
  await flushPromises()
  await typeInto(wrapper, 'plan-alt', '0')

  expect(wrapper.get('.plan-detail-problems').text()).toContain('A takeoff needs an altitude above 0.')
})

it('refuses to add beyond 1000 items and says so, and a plan of that size is cheap to make', async () => {
  const wrapper = await page()
  seedPlan(1000)
  await flushPromises()
  const add = wrapper.get('[data-command-button="plan.addWaypoint"]')

  expect(wrapper.findAll('.plan-item')).toHaveLength(1000)
  expect(add.attributes('aria-disabled')).toBe('true')
  expect(wrapper.text()).toContain('The plan has 1000 items, the most the page takes.')
})

it('moves the selection with the arrow keys and has one tab stop in the list', async () => {
  const wrapper = await page()
  seedPlan(3)
  await flushPromises()
  await wrapper.findAll('.plan-item')[0]?.trigger('click')
  await wrapper.get('.plan-items').trigger('keydown', { key: 'ArrowDown' })
  await flushPromises()

  expect(wrapper.findAll('.plan-item').map(row => row.attributes('aria-pressed'))).toEqual(['false', 'true', 'false'])
  expect(wrapper.findAll('.plan-item').filter(row => row.attributes('tabindex') === '0')).toHaveLength(1)
  await wrapper.get('.plan-items').trigger('keydown', { key: 'End' })
  await flushPromises()

  expect(wrapper.findAll('.plan-item')[2]?.attributes('aria-pressed')).toBe('true')
})

it('says the same in another language, with no message left over', async () => {
  const wrapper = await page()
  setLanguage('pl')
  await press(wrapper, 'plan.addWaypoint')

  expect(wrapper.get('#plan-detail-title').text()).toBe('Element 1: Punkt trasy')
  expect(wrapper.text()).toContain('Plan offline')
  expect(wrapper.text()).not.toMatch(/plan\.[a-z]+\./u)
})
