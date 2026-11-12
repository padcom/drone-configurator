import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n/i18n'
import { type ChartPoint, decimate } from '@/lib/charts/chart'
import LineChart, { type LineSeries } from './LineChart.vue'

/**
 * A chart of the series given.
 *
 * @param series the lines
 * @param props the other props
 * @returns the component
 */
function chart(series: LineSeries[], props: Record<string, unknown> = {}) {
  return mount(LineChart, { global: { plugins: [i18n] }, props: { title: 'Altitude, m', series, ...props } })
}

const RAMP: ChartPoint[] = [0, 1, 2, 3, 4].map(x => ({ x, y: x * 10 }))

it('is an image with a name and a summary of its range, and a figure with a title', () => {
  const wrapper = chart([{ id: 'a', label: 'Alt', points: RAMP }])

  expect(wrapper.element.tagName).toBe('FIGURE')
  expect(wrapper.get('.chart-title').text()).toBe('Altitude, m')
  expect(wrapper.get('svg').attributes('role')).toBe('img')
  expect(wrapper.get('svg').attributes('aria-label')).toBe('Altitude, m. From 0 to 40, over 0 to 4')
})

it('draws a line for a series, and a gap where a value is absent, not a line down to zero', () => {
  const gapped: ChartPoint[] = [{ x: 0, y: 5 }, { x: 1, y: 6 }, { x: 2, y: null }, { x: 3, y: 7 }, { x: 4, y: 8 }]
  const wrapper = chart([{ id: 'a', label: 'Alt', points: gapped }])
  const path = wrapper.get('path.line').attributes('d') ?? ''

  expect(path.match(/M/gu)).toHaveLength(2)
  expect(wrapper.find('.chart-empty').exists()).toBe(false)
})

it('keeps a spike one sample wide in a thinned series: its envelope reaches it', () => {
  const samples = Array.from({ length: 20_000 }, (_unused, x) => ({ x, y: x === 12_345 ? 100 : 1 }))
  const wrapper = chart([{ id: 'a', label: 'Alt', points: decimate(samples, 100) }])

  expect(wrapper.find('path.envelope').exists()).toBe(true)
  // The highest value of the chart is the spike's: the tick marks reach it.
  expect(Number(wrapper.findAll('.chart-yaxis li').at(-1)?.text())).toBeGreaterThanOrEqual(100)
})

it('says there is no data when no series has a value, and has no cursor to move', () => {
  const wrapper = chart([{ id: 'a', label: 'Alt', points: [{ x: 0, y: null }] }])

  expect(wrapper.get('.chart-empty').text()).toBe('No data')
  expect(wrapper.classes()).toContain('absent')
  expect(wrapper.find('[role="slider"]').exists()).toBe(false)
  expect(wrapper.get('svg').attributes('aria-label')).toBe('Altitude, m. No data')
  expect(chart([]).get('.chart-empty').text()).toBe('No data')
})

it('treats NaN and infinities as absent: a gap in the line, nothing "NaN" drawn, "No data" when nothing is left', () => {
  const dirty: ChartPoint[] = [
    { x: 0, y: 1 },
    { x: 1, y: Number.NaN },
    { x: 2, y: 3 },
    { x: 3, y: Number.POSITIVE_INFINITY },
    { x: 4, y: 5 },
  ]
  const wrapper = chart([{ id: 'a', label: 'Alt', points: dirty }])

  expect(wrapper.html()).not.toContain('NaN')
  expect(wrapper.html()).not.toContain('Infinity')
  expect(wrapper.findAll('circle.dot')).toHaveLength(3)
  expect(wrapper.get('svg').attributes('aria-label')).toBe('Altitude, m. From 1 to 5, over 0 to 4')
  const none = chart([{ id: 'a', label: 'Alt', points: [{ x: 0, y: Number.NaN }, { x: 1, y: Number.NEGATIVE_INFINITY }] }])
  expect(none.get('.chart-empty').text()).toBe('No data')
})

it('says the data is old, with words, and marks the chart (muted and dashed by its stylesheet)', () => {
  const wrapper = chart([{ id: 'a', label: 'Alt', points: RAMP }], { stale: true })

  expect(wrapper.get('.chart-stale').text()).toBe('Old data')
  expect(wrapper.classes()).toContain('stale')
  expect(chart([{ id: 'a', label: 'Alt', points: RAMP }]).find('.chart-stale').exists()).toBe(false)
})

it('takes the words for no data and old data from its user', () => {
  const none = chart([], { emptyText: 'No flight yet' })
  const old = chart([{ id: 'a', label: 'Alt', points: RAMP }], { stale: true, staleText: 'Last flight' })

  expect(none.get('.chart-empty').text()).toBe('No flight yet')
  expect(old.get('.chart-stale').text()).toBe('Last flight')
})

it('has a slider over the plot that the keyboard reaches, with the readout as its value', async () => {
  const formats = { formatY: (v: number) => `${v} m`, formatX: (v: number) => `${v} s` }
  const wrapper = chart([{ id: 'a', label: 'Alt', points: RAMP }], formats)
  const slider = wrapper.get('[role="slider"]')

  expect(slider.attributes('tabindex')).toBe('0')
  expect(slider.attributes('aria-label')).toBe('Cursor of Altitude, m')
  expect(slider.attributes('aria-valuetext')).toBe('Cursor off the chart')
  await slider.trigger('keydown', { key: 'ArrowRight' })

  expect(slider.attributes('aria-valuetext')).toBe('0 s: Alt 0 m')
  await slider.trigger('keydown', { key: 'ArrowRight' })
  await slider.trigger('keydown', { key: 'ArrowRight' })
  expect(slider.attributes('aria-valuetext')).toBe('2 s: Alt 20 m')
  expect(slider.attributes('aria-valuenow')).toBe('2')
  expect(wrapper.get('.chart-readout').text()).toBe('2 s: Alt 20 m')
  expect(wrapper.find('line.chart-cursor').exists()).toBe(true)
})

it('moves the cursor by a sample, by ten with Shift, to the ends with Home and End, and lets it go with Escape', async () => {
  const points: ChartPoint[] = Array.from({ length: 30 }, (_unused, x) => ({ x, y: x }))
  const wrapper = chart([{ id: 'a', label: 'A', points }])
  const slider = wrapper.get('[role="slider"]')
  const now = () => slider.attributes('aria-valuenow')

  await slider.trigger('keydown', { key: 'End' })
  expect(now()).toBe('29')
  await slider.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
  expect(now()).toBe('19')
  await slider.trigger('keydown', { key: 'Home' })
  expect(now()).toBe('0')
  await slider.trigger('keydown', { key: 'ArrowLeft' })
  expect(now()).toBe('0')
  await slider.trigger('keydown', { key: 'Escape' })

  expect(wrapper.find('line.chart-cursor').exists()).toBe(false)
  expect(wrapper.emitted('update:cursor')?.at(-1)).toEqual([null])
})

it('skips a gap when the cursor is moved, and says "no value" for a series that has none at the place', async () => {
  const lead: ChartPoint[] = [{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }]
  const other: ChartPoint[] = [{ x: 0, y: 5 }, { x: 1, y: 6 }, { x: 2, y: null }]
  const wrapper = chart([{ id: 'a', label: 'A', points: lead }, { id: 'b', label: 'B', points: other }])
  const slider = wrapper.get('[role="slider"]')
  await slider.trigger('keydown', { key: 'ArrowRight' })
  await slider.trigger('keydown', { key: 'ArrowRight' })

  expect(slider.attributes('aria-valuenow')).toBe('2')
  expect(slider.attributes('aria-valuetext')).toBe('2: A 3; B no value')
})

it('follows a cursor that its parent keeps, and tells the parent where the keys put it (a shared cursor)', async () => {
  const series = [{ id: 'a', label: 'A', points: RAMP }]
  const first = chart(series, { cursor: 3 })
  const second = chart(series, { cursor: 3 })

  expect(first.get('[role="slider"]').attributes('aria-valuenow')).toBe('3')
  expect(second.find('line.chart-cursor').exists()).toBe(true)
  await first.get('[role="slider"]').trigger('keydown', { key: 'ArrowRight' })
  expect(first.emitted('update:cursor')?.at(-1)).toEqual([4])
  await first.setProps({ cursor: null })
  expect(first.find('line.chart-cursor').exists()).toBe(false)
})

it('puts the cursor under the pointer, and takes it away when the pointer leaves', async () => {
  const wrapper = chart([{ id: 'a', label: 'A', points: RAMP }])
  const slider = wrapper.get('[role="slider"]')
  const box = { left: 100, width: 400, top: 0, right: 500, bottom: 100, height: 100, x: 100, y: 0 }
  slider.element.getBoundingClientRect = () => box as DOMRect
  slider.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, bubbles: true }))

  // 300 of 400 px along a domain of 0 to 4 is 3.
  expect(wrapper.emitted('update:cursor')?.at(-1)).toEqual([3])
  await slider.trigger('pointerleave')
  expect(wrapper.emitted('update:cursor')?.at(-1)).toEqual([null])
})

it('has the words in another language', () => {
  const wrapper = chart([], {})

  expect(wrapper.get('.chart-empty').text()).toBe('No data')
})
