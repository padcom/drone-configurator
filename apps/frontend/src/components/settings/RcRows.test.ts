// The rows of the mapping: the channel field when a channel is chosen that the vehicle arms or stops with.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { createConfigurator } from '@/composables/useConfigurator'
import { useGamepad } from '@/composables/useGamepad'
import { useRcMapping } from '@/composables/useRcMapping'
import { forgetRcAllowChoice, useRcSettings } from '@/composables/useRcSettings'
import { i18n } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { type Facts, factsOf } from '@/lib/rc/vehicle'
import { FakePads } from '@/testing/fakeGamepads'
import RcRows from './RcRows.vue'

let mounted: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.useRealTimers()
  forgetRcAllowChoice()
})

/**
 * What a vehicle says when its channel 9 arms (`RCn_OPTION` 153) and the others do nothing.
 *
 * @returns the facts
 */
function vehicle(): Facts {
  const sticks = ['ROLL', 'PITCH', 'THROTTLE', 'YAW']
  const params = sticks.map((name, index) => ({ id: `RCMAP_${name}`, value: index + 1 }))

  for (let channel = 1; channel <= 16; channel += 1) {
    params.push({ id: `RC${channel}_OPTION`, value: channel === 9 ? 153 : 0 })
  }

  return factsOf(params, true)!
}

/**
 * The rows over a pad that is read, with the vehicle saying channel 9 arms.
 *
 * @returns the screen and the first row's channel field
 */
async function rows() {
  const handle = createConfigurator(mockBackend({ settings: { version: 1, ui: [] } }))
  await handle.settings.load()
  const pads = new FakePads()
  const scope = effectScope()
  const mapping = scope.run(() => {
    const pad = useGamepad({ env: pads.env() })

    pad.start()

    return useRcMapping({ pad, settings: useRcSettings(), facts: shallowRef(vehicle()), request: shallowRef(null) })
  })!

  pads.connect()
  pads.advance(20)
  mounted = mount(RcRows, { props: { mapping }, global: { plugins: [i18n] }, attachTo: document.body })
  await flushPromises()
  const select = mounted.get('[data-testid="rc-row-0"] select')

  return { wrapper: mounted, mapping, select, field: select.element as HTMLSelectElement }
}

it('shows the real channel again, and keeps focus, when a channel the vehicle arms with is chosen', async () => {
  const { wrapper, mapping, select, field } = await rows()

  field.focus()
  await select.setValue('9')
  await flushPromises()
  await vi.advanceTimersByTimeAsync(100)
  await flushPromises()

  expect(mapping.draft.value?.rows[0]?.channel).toBe(1)
  expect(field.value).toBe('1')
  expect(wrapper.get('[data-testid="rc-row-0"] select').element).toBe(field)
  expect(document.activeElement).toBe(field)
  expect(wrapper.get('#rc-refusal').text()).toContain('Channel 9')
})

it('shows the real channel again when the same refused channel is chosen a second time', async () => {
  const { mapping, select, field } = await rows()

  await select.setValue('9')
  await select.setValue('1')
  await select.setValue('9')
  await vi.advanceTimersByTimeAsync(100)
  await flushPromises()

  expect(mapping.draft.value?.rows[0]?.channel).toBe(1)
  expect(field.value).toBe('1')
})

it('takes a channel that is allowed, and shows it', async () => {
  const { mapping, select, field } = await rows()

  await select.setValue('10')
  await vi.advanceTimersByTimeAsync(100)
  await flushPromises()

  expect(mapping.draft.value?.rows[0]?.channel).toBe(10)
  expect(field.value).toBe('10')
})
