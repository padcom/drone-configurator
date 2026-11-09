import { afterEach, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { MAX, MIN } from './flightLayout'
import FlightData from './screens/FlightData.vue'
import { mockBackend } from './mock-backend'
import { withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

/**
 * The Flight data screen on a fresh Configurator, laid out in a page 1000 by 500 pixels.
 *
 * @returns the mounted screen
 */
async function screen(): Promise<VueWrapper> {
  createConfigurator(mockBackend())
  mounted = mount(FlightData, { ...withI18n, attachTo: document.body })
  await flushPromises()

  for (const split of mounted.findAll('.kit-split')) {
    split.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect
  }

  return mounted
}

/**
 * The bars of the screen: the one between the map and the other panes, and the one between the display and the details.
 *
 * @param wrapper the screen
 * @returns the two bars
 */
function bars(wrapper: VueWrapper) {
  const [main, side] = wrapper.findAll('[role="separator"]')

  return { main: main!, side: side! }
}

/**
 * The button of the pane called `title`.
 *
 * @param wrapper the screen
 * @param title the pane
 * @returns the button that collapses or opens it
 */
function toggleOf(wrapper: VueWrapper, title: string) {
  const pane = wrapper.findAll('.flight-pane').find(p => p.find('h2').text() === title)

  return pane!.find('button.toggle')
}

it('has a map, a display and details, and the telemetry cards are the first tab of the details', async () => {
  const wrapper = await screen()

  expect(wrapper.findAll('.flight-pane h2').map(h => h.text())).toEqual(['Map', 'Display', 'Details'])
  expect(wrapper.text()).toContain('The map is not available yet.')
  expect(wrapper.text()).toContain('The heads-up display is not available yet.')
  expect(wrapper.find('[role="tab"]').text()).toBe('Telemetry')
  expect(wrapper.find('[role="tabpanel"] #telemetry').exists()).toBe(true)
  expect(wrapper.find('#telemetry').text()).toContain('No telemetry')
})

it('can be resized with the keyboard: the arrow keys across a bar move it, and it says how big the pane is', async () => {
  const wrapper = await screen()
  const { main, side } = bars(wrapper)

  await main.trigger('keydown', { key: 'ArrowRight' })
  await main.trigger('keydown', { key: 'ArrowRight' })
  await side.trigger('keydown', { key: 'ArrowDown' })

  expect(main.attributes('aria-valuenow')).toBe('70')
  expect(side.attributes('aria-valuenow')).toBe('45')
})

/**
 * Sends a bar a pointer event at a place.
 *
 * @param bar a separator
 * @param type the event
 * @param clientX across the page
 */
async function point(bar: ReturnType<VueWrapper['find']>, type: string, clientX = 0) {
  bar.element.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }))
  await nextTick()
}

it('can be resized with the pointer: the bar follows it while it is held, within the limits', async () => {
  const wrapper = await screen()
  const { main } = bars(wrapper)

  await point(main, 'pointerdown', 600)
  await point(main, 'pointermove', 300)
  expect(main.attributes('aria-valuenow')).toBe('30')
  await point(main, 'pointermove', 5000)
  expect(main.attributes('aria-valuenow')).toBe(String(MAX))
  await point(main, 'pointermove', -50)
  expect(main.attributes('aria-valuenow')).toBe(String(MIN))
  await point(main, 'pointerup')
})

it('collapses a pane to its header with its button, which stays to open it again at the size it had', async () => {
  const wrapper = await screen()
  const { main } = bars(wrapper)
  await main.trigger('keydown', { key: 'ArrowRight' })

  await toggleOf(wrapper, 'Map').trigger('click')

  const map = wrapper.findAll('.flight-pane')[0]!
  expect(main.attributes('aria-valuenow')).toBe(String(MIN))
  expect(map.classes()).toContain('collapsed')
  expect(map.find('.body').attributes('hidden')).toBeDefined()
  expect(toggleOf(wrapper, 'Map').attributes('aria-expanded')).toBe('false')
  expect(toggleOf(wrapper, 'Map').text()).toBe('Expand Map')

  await toggleOf(wrapper, 'Map').trigger('click')

  expect(main.attributes('aria-valuenow')).toBe('65')
  expect(map.classes()).not.toContain('collapsed')
  expect(map.find('.body').attributes('hidden')).toBeUndefined()
  expect(toggleOf(wrapper, 'Map').attributes('aria-expanded')).toBe('true')
})

it('collapses the display and the details one at a time, as they share a bar', async () => {
  const wrapper = await screen()
  const { side } = bars(wrapper)

  await toggleOf(wrapper, 'Display').trigger('click')
  expect(side.attributes('aria-valuenow')).toBe(String(MIN))
  expect(toggleOf(wrapper, 'Display').attributes('aria-expanded')).toBe('false')
  expect(toggleOf(wrapper, 'Details').attributes('aria-expanded')).toBe('true')

  await toggleOf(wrapper, 'Details').trigger('click')
  expect(side.attributes('aria-valuenow')).toBe(String(MAX))
  expect(toggleOf(wrapper, 'Display').attributes('aria-expanded')).toBe('true')
  expect(toggleOf(wrapper, 'Details').attributes('aria-expanded')).toBe('false')
})

it('collapses a pane that is dragged or keyed shut to the end, and keeps its button to open it', async () => {
  const wrapper = await screen()
  const { main } = bars(wrapper)

  await main.trigger('keydown', { key: 'Home' })

  expect(wrapper.findAll('.flight-pane')[0]!.classes()).toContain('collapsed')
  expect(toggleOf(wrapper, 'Map').isVisible()).toBe(true)
  await toggleOf(wrapper, 'Map').trigger('click')
  expect(main.attributes('aria-valuenow')).toBe('60')
})

it('keeps the content of a collapsed pane, so that what is in it is still there when it is opened', async () => {
  const wrapper = await screen()

  await toggleOf(wrapper, 'Details').trigger('click')

  expect(wrapper.find('#telemetry').exists()).toBe(true)
  expect(wrapper.findAll('.flight-pane')[2]!.find('.body').attributes('hidden')).toBeDefined()
})

it('has a name for each bar and for each button, for a screen reader', async () => {
  const wrapper = await screen()

  expect(wrapper.findAll('[role="separator"]').map(bar => bar.attributes('aria-label')))
    .toEqual(['Resize the map and the other panes', 'Resize the display and the details'])
  expect(wrapper.findAll('button.toggle').map(button => button.text()))
    .toEqual(['Collapse Map', 'Collapse Display', 'Collapse Details'])
})
