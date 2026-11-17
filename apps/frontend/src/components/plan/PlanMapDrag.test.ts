// The Plan page's map as a way to edit the plan, part two: a pin dragged (ONE step of the history, the plan untouched until the
// release), a line of the route dragged to put a waypoint on it, a pin nudged with the keyboard, the pins that have a problem
// marked, and, through all of it, a map that is fitted once and does not move because of an edit.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { Point } from '@/lib/map/geo'
import { createConfigurator } from '@/composables/useConfigurator'
import { resetPlanForTests, usePlan } from '@/composables/usePlan'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { seedPlan } from '@/testing/plan'
import FlightMap from '@/components/map/FlightMap.vue'
import PlanMap from './PlanMap.vue'

let mounted: VueWrapper | undefined

beforeEach(() => {
  resetPlanForTests()
  createConfigurator(mockBackend({ telemetryMs: 600_000 }))
  // (a map that has a size: jsdom lays nothing out, and a map with no size is not fitted to anything)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

/**
 * Some waypoints, a long way from each other (so that the map is fitted to them, and their pins are apart).
 *
 * @param count how many
 */
function spread(count = 3): void {
  seedPlan(count)
  const plan = usePlan()
  plan.plan.value.items.forEach((item, index) => plan.update(item.id, { lat: 52 + index * 0.01, lon: 21 + index * 0.01 }))
}

/**
 * The map, shown with a plan in it.
 *
 * @param count how many waypoints
 * @returns the wrapper
 */
async function shown(count = 3): Promise<VueWrapper> {
  spread(count)
  mounted = mount(PlanMap, { global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()

  return mounted
}

/**
 * What the map shows: where it is and how close, as the map says it.
 *
 * @param wrapper the map
 * @returns the centre and the zoom, as text
 */
function viewOf(wrapper: VueWrapper): string {
  const map = wrapper.get('.map')

  return [map.attributes('data-lat'), map.attributes('data-lon'), map.attributes('data-zoom')].join(' ')
}

/**
 * The pins, in the order of the route.
 *
 * @param wrapper the map
 * @returns them
 */
function pinsOf(wrapper: VueWrapper): DOMWrapper<Element>[] {
  return wrapper.findAll('.plan-pin[data-pin]')
}

/**
 * Where a pin is drawn on the map (px).
 *
 * @param thing the pin
 * @returns the point
 */
function at(thing: DOMWrapper<Element>): Point {
  const found = /translate\((?<x>[-\d.]+) (?<y>[-\d.]+)\)/u.exec(thing.attributes('transform') ?? '')?.groups ?? {}

  return { x: Number(found.x), y: Number(found.y) }
}

/**
 * A pointer event on an element, as a browser sends it (jsdom has no PointerEvent: a mouse event of that name has the fields).
 *
 * @param target the element
 * @param type the event's name
 * @param point where on the map
 */
async function fire(target: Element, type: string, point: Point): Promise<void> {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y })
  Object.defineProperty(event, 'isPrimary', { value: true })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  target.dispatchEvent(event)
  await nextTick()
}

/**
 * Takes hold of a thing, goes some pixels from where it was, and lets go.
 *
 * @param target the pin or the line
 * @param from where it is taken
 * @param by how far it goes
 */
async function drag(target: Element, from: Point, by: Point): Promise<void> {
  await fire(target, 'pointerdown', from)
  await fire(target, 'pointermove', { x: from.x + by.x, y: from.y + by.y })
  await fire(target, 'pointerup', { x: from.x + by.x, y: from.y + by.y })
  await flushPromises()
}

it('is fitted to the plan once the map has a size (so that the tests below say something about not moving)', async () => {
  const wrapper = await shown()
  const zoom = Number(viewOf(wrapper).split(' ')[2])

  // (three places 0.01 degrees apart in the 800 x 600 map: a close view, not the world)
  expect(zoom).toBeGreaterThanOrEqual(12)
  expect(wrapper.getComponent(FlightMap).props('fit')).toHaveLength(3)
})

it('moves a pin that is dragged, in ONE step, and not the plan until the pointer is let go', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [, pin] = pinsOf(wrapper)
  const item = plan.plan.value.items[1]!
  const before = { lat: item.lat!, lon: item.lon! }
  const from = at(pin!)
  const steps = (): string | null => plan.undoLabelKey.value

  await fire(pin!.element, 'pointerdown', from)
  await fire(pin!.element, 'pointermove', { x: from.x + 40, y: from.y - 30 })

  // (the picture follows the pointer; the plan has not changed)
  expect(at(pinsOf(wrapper)[1]!)).toEqual({ x: from.x + 40, y: from.y - 30 })
  expect({ lat: item.lat, lon: item.lon }).toEqual(before)
  await fire(pin!.element, 'pointerup', { x: from.x + 40, y: from.y - 30 })
  await flushPromises()

  // (up on the screen is north, right is east)
  expect(item.lat!).toBeGreaterThan(before.lat)
  expect(item.lon!).toBeGreaterThan(before.lon)
  expect(steps()).toBe('plan.edit.change')
  plan.undo()

  expect({ lat: item.lat, lon: item.lon }).toEqual(before)
  expect(plan.plan.value.items).toHaveLength(3)
})

it('is not a step of its own with the typing before it: a drag right after a typed place is still one more step', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const item = plan.plan.value.items[1]!
  plan.update(item.id, { lat: 52.5, lon: 21.5 })
  await flushPromises()
  const [, pin] = pinsOf(wrapper)
  await drag(pin!.element, at(pin!), { x: 25, y: 25 })
  plan.undo()

  // (Undo took back the drag only: the typed place is still there)
  expect([item.lat, item.lon]).toEqual([52.5, 21.5])
})

it('does nothing for a press that did not go anywhere, and drops a drag that Escape ended', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [, pin] = pinsOf(wrapper)
  const item = plan.plan.value.items[1]!
  const before = { lat: item.lat, lon: item.lon }
  const from = at(pin!)
  await drag(pin!.element, from, { x: 1, y: 1 })

  expect({ lat: item.lat, lon: item.lon }).toEqual(before)
  await fire(pin!.element, 'pointerdown', from)
  await fire(pin!.element, 'pointermove', { x: from.x + 60, y: from.y })
  const overlay = wrapper.get('.plan-route').element.closest('svg')!
  overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await nextTick()
  await fire(pin!.element, 'pointerup', { x: from.x + 60, y: from.y })
  await flushPromises()

  expect({ lat: item.lat, lon: item.lon }).toEqual(before)
  expect(at(pinsOf(wrapper)[1]!)).toEqual(from)
})

it('puts a waypoint where a line of the route is let go, after the item the line leaves from, in one step', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [first, second, third] = plan.plan.value.items.map(item => item.id)
  const [line] = wrapper.findAll('.plan-segment')
  const from = at(pinsOf(wrapper)[0]!)
  await drag(line!.element, from, { x: 30, y: 60 })

  const ids = plan.plan.value.items.map(item => item.id)
  expect(ids).toHaveLength(4)
  expect([ids[0], ids[2], ids[3]]).toEqual([first, second, third])
  expect(plan.selected.value).toBe(ids[1])
  expect(plan.plan.value.items[1]).toMatchObject({ command: 16, alt: 20, frame: 3 })
  expect(wrapper.findAll('.plan-pin[data-pin]')).toHaveLength(4)
  plan.undo()

  expect(plan.plan.value.items.map(item => item.id)).toEqual([first, second, third])
})

it('shows the waypoint a dragged line would put in, and puts none in for a press that did not go anywhere', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [line] = wrapper.findAll('.plan-segment')
  const from = at(pinsOf(wrapper)[0]!)
  await drag(line!.element, from, { x: 1, y: 0 })

  expect(plan.plan.value.items).toHaveLength(3)
  await fire(line!.element, 'pointerdown', from)
  await fire(line!.element, 'pointermove', { x: from.x + 50, y: from.y + 50 })

  expect(wrapper.find('.plan-pin.ghost').text()).toBe('2')
  await fire(line!.element, 'pointerup', { x: from.x + 50, y: from.y + 50 })
  await flushPromises()

  expect(wrapper.find('.plan-pin.ghost').exists()).toBe(false)
})

it('drops a drag of a line when Escape is pressed with the focus on the map, where a line cannot have it', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [line] = wrapper.findAll('.plan-segment')
  const from = at(pinsOf(wrapper)[0]!)
  await fire(line!.element, 'pointerdown', from)
  await fire(line!.element, 'pointermove', { x: from.x + 50, y: from.y + 50 })

  expect(wrapper.find('.plan-pin.ghost').exists()).toBe(true)
  // (the key goes to the map, which has the focus: not to a pin, and not to the line)
  wrapper.get('.map').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await nextTick()

  expect(wrapper.find('.plan-pin.ghost').exists()).toBe(false)
  await fire(line!.element, 'pointerup', { x: from.x + 50, y: from.y + 50 })
  await flushPromises()

  expect(plan.plan.value.items).toHaveLength(3)
})

it('drops a drag whose pointer lost its hold, of a pin and of a line, and a normal release is not a loss', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [first, second] = plan.plan.value.items
  const before = [first!.lat, second!.lat]
  const from = at(pinsOf(wrapper)[1]!)
  const [line] = wrapper.findAll('.plan-segment')
  await fire(pinsOf(wrapper)[1]!.element, 'pointerdown', from)
  await fire(pinsOf(wrapper)[1]!.element, 'pointermove', { x: from.x + 40, y: from.y })
  await fire(pinsOf(wrapper)[1]!.element, 'lostpointercapture', from)
  await fire(pinsOf(wrapper)[1]!.element, 'pointerup', { x: from.x + 40, y: from.y })

  expect(at(pinsOf(wrapper)[1]!)).toEqual(from)
  await fire(line!.element, 'pointerdown', from)
  await fire(line!.element, 'pointermove', { x: from.x, y: from.y + 60 })
  await fire(line!.element, 'lostpointercapture', from)
  await fire(line!.element, 'pointerup', { x: from.x, y: from.y + 60 })
  await flushPromises()

  expect([first!.lat, second!.lat]).toEqual(before)
  expect(plan.plan.value.items).toHaveLength(3)
  // (and a release that is let go of by the browser afterwards, as it does, changes nothing more)
  await drag(pinsOf(wrapper)[1]!.element, from, { x: 30, y: 0 })
  await fire(pinsOf(wrapper)[1]!.element, 'lostpointercapture', from)

  expect(plan.plan.value.items).toHaveLength(3)
  // (the drag after them took the pin along: east, to the pixel, and not further north or south)
  expect(second!.lon).toBeGreaterThan(21.01)
  expect(Math.abs(second!.lat! - before[1]!)).toBeLessThan(0.00001)
})

it('does not begin the drag of a line when the plan is full: no ghost, no waypoint', async () => {
  const wrapper = await shown(1000)
  const plan = usePlan()
  const [line] = wrapper.findAll('.plan-segment')
  const from = at(pinsOf(wrapper)[0]!)
  await fire(line!.element, 'pointerdown', from)
  await fire(line!.element, 'pointermove', { x: from.x + 50, y: from.y + 50 })

  expect(wrapper.find('.plan-pin.ghost').exists()).toBe(false)
  await fire(line!.element, 'pointerup', { x: from.x + 50, y: from.y + 50 })
  await flushPromises()

  expect(plan.plan.value.items).toHaveLength(1000)
})

it('nudges the pin with Shift and an arrow (a pixel with Control too), the nudges of one go being ONE step', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [, pin] = pinsOf(wrapper)
  const item = plan.plan.value.items[1]!
  const lon = item.lon!
  await pin!.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
  const ten = item.lon! - lon
  await pin!.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
  await pin!.trigger('keydown', { key: 'ArrowRight', shiftKey: true })

  expect(item.lon! - lon).toBeCloseTo(3 * ten, 5)
  expect(plan.selected.value).toBe(item.id)
  plan.undo()
  await flushPromises()

  expect(item.lon).toBe(lon)
  // (Alt and Shift switch the layout on some systems: not taken)
  await pin!.trigger('keydown', { key: 'ArrowRight', shiftKey: true, altKey: true })

  expect(item.lon).toBe(lon)
  await pin!.trigger('keydown', { key: 'ArrowRight', shiftKey: true, ctrlKey: true })

  expect(item.lon! - lon).toBeGreaterThan(0)
  expect(item.lon! - lon).toBeLessThan(ten / 5)
})

it('takes the arrows without Shift for the focus, not for the item', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [first] = pinsOf(wrapper)
  const item = plan.plan.value.items[0]!
  const before = { lat: item.lat, lon: item.lon }
  await first!.trigger('keydown', { key: 'ArrowRight' })

  expect({ lat: item.lat, lon: item.lon }).toEqual(before)
  expect(document.activeElement).toBe(pinsOf(wrapper)[1]!.element)
})

it('keeps the map where it is through a drag, a nudge, an insert and an added waypoint: it is fitted once', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const fitted = viewOf(wrapper)
  const fit = wrapper.getComponent(FlightMap).props('fit')
  const [, pin] = pinsOf(wrapper)
  await drag(pin!.element, at(pin!), { x: 120, y: -80 })
  await pinsOf(wrapper)[0]!.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
  await drag(wrapper.findAll('.plan-segment')[0]!.element, at(pinsOf(wrapper)[0]!), { x: 40, y: 40 })
  plan.setAdding(true)
  // (a click is on the map, so inside the view: a place near the middle of the route)
  wrapper.getComponent(FlightMap).vm.$emit('pick', { lat: 52.011, lon: 21.011 })
  await flushPromises()

  expect(plan.plan.value.items).toHaveLength(5)
  expect(viewOf(wrapper)).toBe(fitted)
  expect(wrapper.getComponent(FlightMap).props('fit')).toBe(fit)
})

it('keeps the places of the pins distinct: a drag takes a pin somewhere else, it does not stack it on another', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [, pin] = pinsOf(wrapper)
  const before = plan.plan.value.items.map(item => `${item.lat} ${item.lon}`)
  await drag(pin!.element, at(pin!), { x: 33, y: -21 })
  const after = plan.plan.value.items.map(item => `${item.lat} ${item.lon}`)

  expect(new Set(after).size).toBe(3)
  expect(after[1]).not.toBe(before[1])
  expect([after[0], after[2]]).toEqual([before[0], before[2]])
  expect(new Set(pinsOf(wrapper).map(each => each.attributes('transform'))).size).toBe(3)
})

it('marks a pin that has an error or a warning, with a word for a screen reader, and no other', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [first, second, third] = plan.plan.value.items.map(item => item.id)
  plan.update(second!, { alt: 20000 })
  plan.update(third!, { alt: 0 })
  await flushPromises()
  const pins = pinsOf(wrapper)

  const marks = pins.map(each => each.classes().filter(name => name === 'error' || name === 'warning'))

  expect(marks).toEqual([[], ['error'], ['warning']])
  expect(pins.map(pin => pin.attributes('aria-label'))).toEqual(['Item 1', 'Item 2: has an error', 'Item 3: has a warning'])
  expect(first).toBeDefined()
})

it('shows an item that is selected and is not on the map, and leaves the map alone for one that is', async () => {
  const wrapper = await shown()
  const plan = usePlan()
  const [first, second] = plan.plan.value.items
  const fitted = viewOf(wrapper)
  plan.select(second!.id)
  await flushPromises()

  expect(viewOf(wrapper)).toBe(fitted)
  plan.update(first!.id, { lat: 53, lon: 22 })
  plan.select(first!.id)
  await flushPromises()

  // (an item far from the view: the map goes to it, at the zoom it has)
  expect(viewOf(wrapper)).toBe(`53.00000 22.00000 ${fitted.split(' ')[2]}`)
})

it('says how the pins are used, once, as the description of each', async () => {
  const wrapper = await shown()
  const [pin] = pinsOf(wrapper)
  const help = wrapper.get(`#${pin!.attributes('aria-describedby')}`)

  expect(help.text()).toContain('Drag a pin to move it')
  expect(help.text()).toContain('Putting a waypoint on a line has no keyboard way: use the list\'s Add button')
  expect(wrapper.findAll('#plan-pin-help')).toHaveLength(1)
})
