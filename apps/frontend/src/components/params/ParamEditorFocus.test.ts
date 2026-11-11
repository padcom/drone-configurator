// The focus a command asks for in the value editor of a parameter (the palette's parameter row): taken when the editor shows
// that parameter, with the field's text selected, from its row in the list when there is no editor, and never when it is stale or
// for another parameter.
import { afterEach, expect, it, vi } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import ParamEditor from './ParamEditor.vue'
import { mockBackend } from '@/mock/mock-backend'
import { feed, withI18n } from '@/testing/testing'
import { createConfigurator } from '@/composables/useConfigurator'
import { INTENT_MS, askForFocus, takeFocus } from '@/composables/useFocusIntent'
import { PARAMS, VEHICLE } from '@/mock/fixtures'

const mounted: VueWrapper[] = []

afterEach(() => {
  // Editors left alive would take an asking meant for the next test's.
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  takeFocus('params.value')
  document.body.innerHTML = ''
})

/**
 * Mounts an editor in the document.
 *
 * @returns the wrapper
 */
function mountEditor(): VueWrapper {
  const wrapper = mount(ParamEditor, { ...withI18n, attachTo: document.body })
  mounted.push(wrapper)

  return wrapper
}

/**
 * The editor on a Configurator that has the parameters, with a stand-in for the list (the row has the focus when there is no
 * editor).
 *
 * @param connected whether the vehicle is connected (else the editor's form is hidden)
 * @returns the editor and the Configurator
 */
async function editor(connected = true) {
  const list = document.createElement('div')
  list.id = 'param-list'
  list.tabIndex = 0
  document.body.append(list)
  const handle = createConfigurator(mockBackend())
  const wrapper = mountEditor()
  await flushPromises()
  const connection = connected ? { state: 'connected' as const, vehicle: { ...VEHICLE } } : { state: 'disconnected' as const }
  feed(handle, { params: PARAMS, connection })
  await wrapper.vm.$nextTick()

  return { wrapper, handle }
}

it('puts the focus in the value field, with its text selected, when the parameter that was asked for is selected', async () => {
  const { handle } = await editor()

  askForFocus('params.value', Date.now(), 'RTL_ALT')
  handle.parameters.select('RTL_ALT')

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('draft'))
})

it('does it when the parameter was selected already (the asking alone is enough), and only once', async () => {
  const { handle } = await editor()
  handle.parameters.select('RTL_ALT')
  await flushPromises()

  askForFocus('params.value', Date.now(), 'RTL_ALT')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('draft'))
  const list = document.getElementById('param-list') as HTMLElement
  list.focus()
  handle.parameters.select('FENCE_RADIUS')
  await flushPromises()
  handle.parameters.select('RTL_ALT')
  await flushPromises()

  expect(document.activeElement?.id).toBe('param-list')
})

it('waits for the parameter that was asked for: another one that is selected on the way does not take it', async () => {
  const { handle } = await editor()

  askForFocus('params.value', Date.now(), 'FENCE_RADIUS')
  handle.parameters.select('ARMING_CHECK')
  await flushPromises()
  expect(document.activeElement?.id).not.toBe('draft')
  handle.parameters.select('FENCE_RADIUS')

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('draft'))
})

it('is there when the editor is mounted after the asking (the Parameters screen was not shown yet)', async () => {
  const handle = createConfigurator(mockBackend())
  // The mock backend's first events (disconnected) arrive before the state is changed here.
  await flushPromises()
  feed(handle, { params: PARAMS, connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  handle.parameters.select('RTL_ALT')
  askForFocus('params.value', Date.now(), 'RTL_ALT')

  mountEditor()

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('draft'))
})

it('puts the focus on the parameter\'s row in the list when there is no editor (the vehicle is not connected)', async () => {
  const { handle } = await editor(false)

  askForFocus('params.value', Date.now(), 'RTL_ALT')
  handle.parameters.select('RTL_ALT')

  await vi.waitFor(() => expect(document.activeElement?.id).toBe('param-list'))
})

it('ignores an asking that has gone stale: it never takes the focus when the user comes to the screen on their own', async () => {
  const { handle } = await editor()

  askForFocus('params.value', Date.now() - INTENT_MS - 1000, 'RTL_ALT')
  handle.parameters.select('RTL_ALT')
  await flushPromises()

  expect(document.activeElement?.id).not.toBe('draft')
})
