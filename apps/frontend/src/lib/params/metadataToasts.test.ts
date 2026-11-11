import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { PARAMS } from '@/mock/fixtures'
import { useMetadataToasts } from './metadataToasts'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { useToasts } from '@/composables/toasts'
import { createConfigurator } from '@/composables/useConfigurator'

afterEach(() => {
  const toasts = useToasts()
  for (const toast of [...toasts.visible.value]) {
    toasts.dismiss(toast.key)
  }
})

/**
 * A screen that tells the results of the metadata, on a Configurator with the fixture parameters.
 *
 * @returns the Configurator
 */
async function screen() {
  const handle = createConfigurator(mockBackend())
  mount(defineComponent({
    setup() {
      useMetadataToasts()

      return () => null
    },
  }), withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, list: 'complete' })

  return handle
}

/**
 * The toasts that are shown.
 *
 * @returns their severity and text
 */
const shown = () => useToasts().visible.value.map(toast => [toast.severity, toast.text])

const fileOf = (params: object) => JSON.stringify({ format: 'drone-configurator/param-metadata', version: 1, params })

it('tells a load that went well in a success toast, with how many of the parameters it describes', async () => {
  const handle = await screen()

  handle.metadata.load(fileOf({ RTL_ALT: { description: 'Return altitude' }, BATT_CAPACITY: { description: 'Capacity' } }))
  await flushPromises()

  expect(shown()).toEqual([['success', 'Loaded descriptions for 2 of 12 parameters']])
})

it('tells a file that matched nothing, and one that could not be read, in an error toast each, the last alone', async () => {
  const handle = await screen()

  handle.metadata.load(fileOf({ NOT_ON_THIS_VEHICLE: { description: 'x' } }))
  await flushPromises()
  const none = /^0 of 12 parameters matched\. Parameters the file describes: 1, none of them/u

  expect(shown()).toEqual([['error', expect.stringMatching(none)]])

  handle.metadata.load('{')
  await flushPromises()
  expect(shown()).toEqual([['error', 'Can\'t load the metadata: not JSON.']])
  // The same failure again is told again, and is still one toast.
  handle.metadata.load('{')
  await flushPromises()
  expect(shown()).toEqual([['error', 'Can\'t load the metadata: not JSON.']])
})

it('leaves one toast, the last result: error, error, then a good file', async () => {
  const handle = await screen()

  handle.metadata.load('{')
  await flushPromises()
  handle.metadata.load('[')
  await flushPromises()
  expect(useToasts().visible.value).toHaveLength(1)
  handle.metadata.load(fileOf({ RTL_ALT: { description: 'Return altitude' } }))
  await flushPromises()

  expect(shown()).toEqual([['success', 'Loaded descriptions for 1 of 12 parameters']])
})

it('says a partial match as a warning', async () => {
  const handle = await screen()

  handle.metadata.load(fileOf({ RTL_ALT: { description: 'Return altitude' }, BATT_CAPACITY: { units: 'mAh' } }))
  await flushPromises()

  expect(shown()).toEqual([['warning', '2 of 12 parameters matched; with a description: 1']])
  // Read for as long as an error is, not the 6 s of a plain warning.
  expect(useToasts().visible.value.map(toast => [toast.long, toast.sticky])).toEqual([[true, false]])
})

it('keeps an error toast until it is dismissed: a file that matched nothing, and one that could not be read', async () => {
  const handle = await screen()

  handle.metadata.load(fileOf({ NOT_ON_THIS_VEHICLE: { description: 'x' } }))
  await flushPromises()
  handle.metadata.load('{')
  await flushPromises()

  expect(useToasts().visible.value.map(toast => toast.sticky)).toEqual([true])
})
