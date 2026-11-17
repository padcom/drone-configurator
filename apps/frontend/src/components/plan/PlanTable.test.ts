// The Table tool of the Plan page: the tabs that show it, its rows (only those in view are drawn, for a plan of a thousand), the
// cells that are the form's own fields in the same history, the keys of a spreadsheet, one tab stop, the cells the plan says are
// wrong said in words, and the selected item that is the row that has the focus. Nothing here is sent to a vehicle.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createConfigurator } from '@/composables/useConfigurator'
import { resetPlanForTests, usePlan } from '@/composables/usePlan'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { seedPlan } from '@/testing/plan'
import Plan from '@/screens/Plan.vue'

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
 * The Plan page, shown, with the Table tool when asked.
 *
 * @param table whether the table is the tool
 * @returns the wrapper
 */
async function page(table = true): Promise<VueWrapper> {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/plan', component: { template: '<div />' } }] })
  await router.push('/plan')
  await router.isReady()

  if (table) {
    usePlan().setTool('table')
  }
  mounted = mount(Plan, { global: { plugins: [i18n, router] }, attachTo: document.body })
  await flushPromises()

  return mounted
}

/**
 * The rows that are drawn.
 *
 * @param wrapper the page
 * @returns their numbers, as the table says them
 */
function rowNumbers(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.plan-tr .plan-td-no span:first-child').map(cell => cell.text())
}

/**
 * The field in a cell.
 *
 * @param wrapper the page
 * @param row the item's number (from 1)
 * @param column the column
 * @returns the element
 */
function fieldIn(wrapper: VueWrapper, row: number, column: string): HTMLInputElement {
  const { id } = usePlan().plan.value.items[row - 1]!

  const cell = `[data-row="${id}"] [data-col="${column}"]`

  return wrapper.get(`${cell} input, ${cell} select`).element as HTMLInputElement
}

it('shows the mission on the map first, and the table when its tab is pressed, with the map kept for coming back', async () => {
  const wrapper = await page(false)
  const tabs = wrapper.findAll('[role="tab"]')

  expect(tabs.map(tab => [tab.text(), tab.attributes('aria-selected')])).toEqual([['Mission', 'true'], ['Table', 'false']])
  expect(wrapper.find('[role="grid"]').exists()).toBe(false)
  await tabs[1]!.trigger('click')

  expect(wrapper.find('[role="grid"]').exists()).toBe(true)
  expect(tabs[1]!.attributes('aria-selected')).toBe('true')
  expect(wrapper.get('#plan-panel-mission').attributes('style')).toContain('display: none')
  expect(wrapper.find('.plan-map').exists()).toBe(true)
  await tabs[0]!.trigger('click')

  expect(wrapper.find('[role="grid"]').exists()).toBe(false)
  expect(wrapper.get('#plan-panel-mission').attributes('style') ?? '').not.toContain('display: none')
})

it('has the tabs as one tab stop, moved with the arrow keys, and the mode of the map ends with leaving the map', async () => {
  const wrapper = await page(false)
  const plan = usePlan()
  plan.setAdding(true)
  const [mission, table] = wrapper.findAll('[role="tab"]')
  await mission!.trigger('keydown', { key: 'ArrowRight' })

  expect(plan.tool.value).toBe('table')
  expect([mission!.attributes('tabindex'), table!.attributes('tabindex')]).toEqual(['-1', '0'])
  expect(plan.adding.value).toBe(false)
  await table!.trigger('keydown', { key: 'Home' })

  expect(plan.tool.value).toBe('mission')
})

it('has a row for each item and a cell for each of its fields, the same ones as the form', async () => {
  seedPlan(3)
  const wrapper = await page()

  expect(rowNumbers(wrapper)).toEqual(['1', '2', '3'])
  expect(wrapper.findAll('[role="columnheader"]').map(head => head.text())).toEqual([
    'No.', 'Command', 'Latitude', 'Longitude', 'Altitude', 'Altitude from', 'Setting 1', 'Setting 2', 'Setting 3', 'Setting 4',
  ])
  expect(fieldIn(wrapper, 1, 'lat').value).toBe('52')
  expect(fieldIn(wrapper, 1, 'alt').value).toBe('20')
  expect(wrapper.get('[data-row] [data-col="s1"]').text()).toContain('Hold')
})

it('writes what is typed in a cell as the form does, one edit that Undo takes back, and the form says it too', async () => {
  seedPlan(2)
  const wrapper = await page()
  const plan = usePlan()
  const item = plan.plan.value.items[1]!
  await wrapper.get(`[data-row="${item.id}"] [data-col="alt"] input`).setValue('35')

  expect(item.alt).toBe(35)
  expect(plan.selected.value).toBe(item.id)
  expect((wrapper.get('#plan-alt').element as HTMLInputElement).value).toBe('35')
  plan.undo()
  await flushPromises()

  expect(item.alt).toBe(20)
  expect(fieldIn(wrapper, 2, 'alt').value).toBe('20')
})

it('picks a frame from the choices, and has a dash where the command has nothing', async () => {
  seedPlan(1)
  const plan = usePlan()
  plan.add(178)
  const wrapper = await page()
  const frame = wrapper.get('[data-row] [data-col="frame"] select')
  await frame.setValue('0')

  expect(plan.plan.value.items[0]!.frame).toBe(0)
  const speed = plan.plan.value.items[1]!
  const row = wrapper.get(`[data-row="${speed.id}"]`)

  expect(row.get('[data-col="lat"]').text()).toBe('–')
  expect(row.get('[data-col="lat"]').attributes('aria-label')).toBe('Not used by this command')
  expect(row.findAll('[data-col="s1"] select')).toHaveLength(1)
  expect(row.findAll('[data-col="s4"] input, [data-col="s4"] select')).toHaveLength(0)
})

it('draws only the rows in view for a plan of a thousand, and the rows that scroll into view when it is scrolled', async () => {
  seedPlan(1000)
  const wrapper = await page()
  const grid = wrapper.get('[role="grid"]')

  expect(grid.attributes('aria-rowcount')).toBe('1001')
  expect(wrapper.findAll('.plan-tr').length).toBeLessThan(40)
  expect(wrapper.get('.plan-grid-body').attributes('style')).toContain('height: 52000px')
  const scroller = wrapper.get('.plan-table-scroll')
  scroller.element.scrollTop = 26_000
  await scroller.trigger('scroll')

  expect(wrapper.findAll('.plan-tr').length).toBeLessThan(40)
  expect(rowNumbers(wrapper)).toContain('501')
  expect(rowNumbers(wrapper)).not.toContain('1')
})

it('has ONE tab stop in the grid, however many cells are drawn', async () => {
  seedPlan(30)
  const wrapper = await page()
  const stops = wrapper.findAll('[role="grid"] [tabindex="0"]')

  expect(wrapper.findAll('[role="grid"] input').length).toBeGreaterThan(30)
  expect(stops).toHaveLength(1)
  // (the selected row's: the last one added is the selected)
  expect(stops[0]!.element.closest('[data-row]')).toBe(wrapper.get(`[data-row="${usePlan().selected.value}"]`).element)
})

it('keeps the row that has the focus drawn, with the one tab stop, when the table is scrolled away from it', async () => {
  seedPlan(1000)
  const wrapper = await page()
  const plan = usePlan()
  plan.select(plan.plan.value.items[0]!.id)
  await flushPromises()
  const field = fieldIn(wrapper, 1, 'lat')
  field.focus()
  await flushPromises()
  const scroller = wrapper.get('.plan-table-scroll')
  scroller.element.scrollTop = 26_000
  await scroller.trigger('scroll')

  // (rows 1 and the ones in view: the row of the focus is not given up, and the focused field is the same one)
  expect(rowNumbers(wrapper)).toContain('1')
  expect(rowNumbers(wrapper)).toContain('501')
  expect(wrapper.findAll('.plan-tr').length).toBeLessThan(40)
  expect(wrapper.findAll('[role="grid"] [tabindex="0"]')).toHaveLength(1)
  expect(document.activeElement).toBe(fieldIn(wrapper, 1, 'lat'))
  expect(document.activeElement).toBe(field)
})

it('has its one tab stop in a row that is drawn when the selected item is the stop and the table is scrolled', async () => {
  seedPlan(1000)
  const wrapper = await page()
  const plan = usePlan()
  plan.select(plan.plan.value.items[0]!.id)
  await flushPromises()
  const scroller = wrapper.get('.plan-table-scroll')
  scroller.element.scrollTop = 26_000
  await scroller.trigger('scroll')

  expect(wrapper.findAll('[role="grid"] [tabindex="0"]')).toHaveLength(1)
})

it('leaves a key that is part of an input method\'s composition to the method', async () => {
  seedPlan(3)
  const wrapper = await page()
  const lat = fieldIn(wrapper, 1, 'lat')
  lat.focus()
  const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
  lat.dispatchEvent(event)
  await flushPromises()

  expect(event.defaultPrevented).toBe(false)
  expect(document.activeElement).toBe(lat)
})

it('moves between the cells with the keys of a spreadsheet, and the focus is the selection', async () => {
  seedPlan(5)
  const wrapper = await page()
  const plan = usePlan()
  const first = fieldIn(wrapper, 1, 'lat')
  first.focus()
  await first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  await flushPromises()

  expect(document.activeElement).toBe(fieldIn(wrapper, 2, 'lat'))
  expect(plan.selected.value).toBe(plan.plan.value.items[1]!.id)
  fieldIn(wrapper, 2, 'lat').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await flushPromises()

  expect(document.activeElement).toBe(fieldIn(wrapper, 3, 'lat'))
  fieldIn(wrapper, 3, 'lat').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
  await flushPromises()

  expect(document.activeElement).toBe(fieldIn(wrapper, 2, 'lat'))
})

it('goes right only when the caret is at the end of the field, and left only when it is at the start', async () => {
  seedPlan(2)
  const wrapper = await page()
  const lat = fieldIn(wrapper, 1, 'lat')
  lat.focus()
  lat.setSelectionRange(1, 1)
  lat.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
  await flushPromises()

  expect(document.activeElement).toBe(lat)
  lat.setSelectionRange(lat.value.length, lat.value.length)
  lat.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
  await flushPromises()

  const lon = fieldIn(wrapper, 1, 'lon')
  expect(document.activeElement).toBe(lon)
  lon.setSelectionRange(0, 0)
  lon.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
  await flushPromises()

  expect(document.activeElement).toBe(lat)
})

it('goes down on the arrow in a choice, as in any cell, and does not change it', async () => {
  seedPlan(2)
  const wrapper = await page()
  const frame = fieldIn(wrapper, 1, 'frame')
  frame.focus()
  const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
  frame.dispatchEvent(event)
  await flushPromises()

  expect(event.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(fieldIn(wrapper, 2, 'frame'))
  expect(usePlan().plan.value.items[0]!.frame).toBe(3)
})

it('goes to a row that is not drawn, and draws it', async () => {
  seedPlan(1000)
  const wrapper = await page()
  const plan = usePlan()
  plan.select(plan.plan.value.items[0]!.id)
  await flushPromises()
  const first = fieldIn(wrapper, 1, 'lat')
  first.focus()
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }))
  await flushPromises()

  expect(rowNumbers(wrapper)).toContain('1000')
  expect(document.activeElement).toBe(fieldIn(wrapper, 1000, 'lat'))
  expect(plan.selected.value).toBe(plan.plan.value.items[999]!.id)
})

it('shows the row of an item that is selected elsewhere, without taking the focus', async () => {
  seedPlan(1000)
  const wrapper = await page()
  const plan = usePlan()
  plan.select(plan.plan.value.items[0]!.id)
  await flushPromises()
  plan.select(plan.plan.value.items[600]!.id)
  await flushPromises()

  expect(rowNumbers(wrapper)).toContain('601')
  expect(wrapper.get('[role="row"].selected .plan-td-no span').text()).toBe('601')
  expect(document.activeElement?.closest('[role="grid"]')).toBeNull()
})

it('says in words which cell is wrong, with the field and the error colour, and nothing of the cells that are not', async () => {
  seedPlan(2)
  const plan = usePlan()
  const [first, second] = plan.plan.value.items
  plan.update(second!.id, { lat: null, alt: 20000 })
  const wrapper = await page()
  const lat = fieldIn(wrapper, 2, 'lat')
  const alt = fieldIn(wrapper, 2, 'alt')

  expect([lat.getAttribute('aria-invalid'), alt.getAttribute('aria-invalid')]).toEqual(['true', 'true'])
  expect(wrapper.get(`#${lat.getAttribute('aria-describedby')}`).text()).toContain('place')
  expect(wrapper.get(`#${alt.getAttribute('aria-describedby')}`).text()).toContain('10000')
  expect(wrapper.get(`[data-row="${second!.id}"] [data-col="lat"]`).classes()).toContain('wrong')
  // (a place that is not set is the place's two cells, not the altitude's frame, and not another row)
  expect(fieldIn(wrapper, 2, 'lon').getAttribute('aria-invalid')).toBe('true')
  expect(fieldIn(wrapper, 2, 'frame').hasAttribute('aria-invalid')).toBe(false)
  expect(fieldIn(wrapper, 1, 'lat').hasAttribute('aria-invalid')).toBe(false)
  expect(wrapper.get(`[data-row="${first!.id}"]`).findAll('.wrong')).toHaveLength(0)
})

it('says it of a choice that is wrong too: aria-invalid and the words, as a number has', async () => {
  const plan = usePlan()
  plan.add(178)
  plan.update(plan.plan.value.items[0]!.id, { p1: null })
  const wrapper = await page()
  const choice = fieldIn(wrapper, 1, 's1')

  expect(choice.tagName).toBe('SELECT')
  expect(choice.getAttribute('aria-invalid')).toBe('true')
  expect(wrapper.get(`#${choice.getAttribute('aria-describedby')}`).text().length).toBeGreaterThan(0)
})

it('marks a row that has a problem no cell has, in words (a loiter with no yaw)', async () => {
  const plan = usePlan()
  plan.add(18)
  plan.update(plan.plan.value.items[0]!.id, { lat: 52, lon: 21, p4: null })
  const wrapper = await page()
  const row = wrapper.get('[role="row"][data-row]')

  expect(row.classes()).toContain('bad')
  expect(row.get('.plan-td-mark').attributes('title')).not.toBe('')
  expect(row.get('.plan-td-no').attributes('aria-describedby')).toBeDefined()
})

it('says the same in another language, and has no message left over', async () => {
  seedPlan(1)
  const wrapper = await page()
  i18n.global.locale.value = 'de'
  await flushPromises()

  expect(wrapper.findAll('[role="columnheader"]').map(head => head.text()).slice(0, 3)).toEqual(['Nr.', 'Befehl', 'Breitengrad'])
  expect(wrapper.get('[role="grid"]').attributes('aria-label')).toBe('Elemente des Plans als Tabelle')
  i18n.global.locale.value = 'en'
})
