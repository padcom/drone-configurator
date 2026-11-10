import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ParamEditor from './ParamEditor.vue'
import { mockBackend } from './mock-backend'
import { feed, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'
import { PARAMS, VEHICLE } from './fixtures'

/**
 * Mounts the editor on a fresh Configurator that holds the parameters, with RTL_ALT selected while connected.
 *
 * @returns the component, the Configurator and the spies
 */
async function editorWithSpies() {
  const handle = createConfigurator(mockBackend())
  const write = vi.spyOn(handle.parameters, 'write').mockResolvedValue()
  const editDraft = vi.spyOn(handle.parameters, 'editDraft').mockImplementation(() => undefined)
  const wrapper = mount(ParamEditor, withI18n)
  // The mock backend's first events (disconnected) arrive before the state is changed here.
  await flushPromises()
  feed(handle, {
    params: PARAMS,
    selected: 'RTL_ALT',
    draft: '1600',
    connection: { state: 'connected', vehicle: { ...VEHICLE } },
  })
  await wrapper.vm.$nextTick()

  return { wrapper, handle, write, editDraft }
}

it('asks for a parameter to be selected, and hides the form, until one is', async () => {
  createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, withI18n)
  await flushPromises()

  expect(wrapper.get('#detail').text()).toContain('Select a parameter')
  expect(wrapper.get('#edit').attributes('hidden')).toBeDefined()
})

it('shows the selected parameter and the form while connected', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.get('#detail h2').text()).toBe('RTL_ALT')
  expect(wrapper.get('#detail .big').text()).toBe('1500')
  expect(wrapper.get('#detail').text()).toContain('on the vehicle:')
  expect(wrapper.get('#edit').attributes('hidden')).toBeUndefined()
  expect((wrapper.get('#draft').element as HTMLInputElement).value).toBe('1600')
})

it('uses the kit\'s field and primary button for the new value, with the same ids', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.get('#draft').classes()).toContain('kit-input')
  expect(wrapper.get('#write').classes()).toEqual(expect.arrayContaining(['kit-button', 'primary']))
  expect(wrapper.get('#write').attributes('type')).toBe('submit')
})

it('marks the field invalid and points it to the reason, written out, when the draft is not a value', async () => {
  const { wrapper, handle } = await editorWithSpies()
  expect(wrapper.get('#draft').attributes('aria-invalid')).toBeUndefined()
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBeUndefined()

  feed(handle, { draft: 'abc', draftError: 'Not a number' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#draft').classes()).toContain('invalid')
  expect(wrapper.get('#draft').attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBe('draft-error')
  expect(wrapper.get('#draft-error').text()).toBe('Not a number')
})

it('hides the form when the connection is lost, and keeps the parameter on screen', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, { connection: { state: 'lost', vehicle: { ...VEHICLE } } })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#edit').attributes('hidden')).toBeDefined()
  expect(wrapper.get('#detail h2').text()).toBe('RTL_ALT')
})

it('passes on what is typed, and writes on submit', async () => {
  const { wrapper, write, editDraft } = await editorWithSpies()

  await wrapper.get('#draft').setValue('1700')
  await wrapper.get('#edit').trigger('submit')

  expect(editDraft).toHaveBeenCalledWith('1700')
  expect(write).toHaveBeenCalledTimes(1)
})

it('enables Write only for a changed, valid draft, and not while writing', async () => {
  const { wrapper, handle } = await editorWithSpies()
  expect(wrapper.get('#write').attributes('disabled')).toBeUndefined()

  feed(handle, { draft: '1500' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#write').attributes('disabled')).toBeDefined()

  feed(handle, { draft: '1600', writing: true })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#write').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#detail').text()).toContain('Writing…')
})

it('shows the outcome of the write, a draft error and the metadata as text', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, {
    lastWrite: { kind: 'failed', id: 'RTL_ALT', message: '<b>TIMEOUT</b>' },
    draftError: 'a number, please',
    metadata: new Map([['RTL_ALT', { description: 'Return <i>altitude</i>', units: 'cm', min: 200 }]]),
  })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#detail').text()
  expect(text).toContain('Not confirmed: <b>TIMEOUT</b>')
  expect(text).toContain('The value on the vehicle is unknown')
  expect(text).toContain('a number, please')
  expect(text).toContain('Return <i>altitude</i>')
  expect(text).toContain('1500 cm')
  expect(text).toContain('Range: 200 to … cm')
  expect(wrapper.find('#detail b, #detail i').exists()).toBe(false)
  expect(wrapper.find('#detail .error').exists()).toBe(true)
})

it('shows a verified write with a mark and its words, and an unconfirmed one as a problem, never as done', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, { lastWrite: { kind: 'verified', id: 'RTL_ALT', value: 1600 } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#detail .notice.ok').text()).toBe('Written and read back: 1600.')
  expect(wrapper.find('#detail .notice.ok svg').exists()).toBe(true)

  feed(handle, { lastWrite: { kind: 'failed', id: 'RTL_ALT', message: 'TIMEOUT' } })
  await wrapper.vm.$nextTick()
  expect(wrapper.find('#detail .notice.ok').exists()).toBe(false)
  expect(wrapper.get('#detail .notice.error').text()).toContain('Not confirmed')
})

it('chooses a new value from the names when the metadata has them, in the same field id, any number still allowed', async () => {
  const { wrapper, handle, editDraft } = await editorWithSpies()

  feed(handle, { metadata: new Map([['RTL_ALT', { values: { 0: 'Disabled', 1500: 'Default', 3000: 'High' } }]]), draft: '1500' })
  await wrapper.vm.$nextTick()

  const field = wrapper.get<HTMLInputElement>('#draft')
  expect(field.attributes('role')).toBe('combobox')
  expect(field.element.value).toBe('Default')
  expect(wrapper.get('#detail').text()).not.toContain('Values:')
  await field.trigger('focus')
  await wrapper.findAll('[role="option"]').find(option => option.text().includes('High'))?.trigger('click')
  expect(editDraft).toHaveBeenLastCalledWith('3000')
})

it('names the field of names by a label beside it, so that its open list is not part of the name', async () => {
  const { wrapper, handle } = await editorWithSpies()
  feed(handle, { metadata: new Map([['RTL_ALT', { values: { 0: 'Disabled', 1500: 'Default' } }]]), draft: '1500' })
  await wrapper.vm.$nextTick()

  await wrapper.get('#draft').trigger('focus')
  const label = wrapper.get('label[for="draft"]')

  expect(label.text()).toBe('New value')
  expect(label.find('[role="listbox"]').exists()).toBe(false)
  expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  expect(wrapper.get('#draft').attributes('aria-label')).toBeUndefined()
})

it('marks the field of names invalid and points it to the reason when the draft is not a value', async () => {
  const { wrapper, handle } = await editorWithSpies()
  feed(handle, { metadata: new Map([['RTL_ALT', { values: { 1500: 'Default' } }]]), draftError: 'a number, please' })
  await wrapper.vm.$nextTick()

  const field = wrapper.get('#draft')

  expect(field.attributes('aria-invalid')).toBe('true')
  expect(field.attributes('aria-describedby')).toContain('draft-error')
})

it('shows the current value in the field of names when the draft is not a number', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, { metadata: new Map([['RTL_ALT', { values: { 1500: 'Default' } }]]), draft: 'abc' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get<HTMLInputElement>('#draft').element.value).toBe('Default')
})

it('has a polite and an assertive region for the outcome of a write, there from the start and empty', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.get('.notice[role="status"]').text()).toBe('')
  expect(wrapper.get('.notice[role="alert"]').text()).toBe('')
})

it('says a verified write in the polite region, and one that is not confirmed or was changed in the assertive one', async () => {
  const { wrapper, handle } = await editorWithSpies()
  const polite = () => wrapper.get('.notice[role="status"]').text()
  const assertive = () => wrapper.get('.notice[role="alert"]').text()

  feed(handle, { lastWrite: { kind: 'verified', id: 'RTL_ALT', value: 1600 } })
  await wrapper.vm.$nextTick()
  expect([polite(), assertive()]).toEqual(['Written and read back: 1600.', ''])

  feed(handle, { lastWrite: { kind: 'changed', id: 'RTL_ALT', asked: 1600, reported: 1599 } })
  await wrapper.vm.$nextTick()
  expect(polite()).toBe('')
  expect(assertive()).toContain('The vehicle reports 1599, not 1600')
  expect(wrapper.get('.notice[role="alert"]').classes()).toContain('error')

  feed(handle, { lastWrite: { kind: 'failed', id: 'RTL_ALT', message: 'TIMEOUT' } })
  await wrapper.vm.$nextTick()
  expect(assertive()).toContain('Not confirmed')
})

it('lists the other parameters of the same group as related, and selects one when it is pressed', async () => {
  const { wrapper, handle } = await editorWithSpies()
  const select = vi.spyOn(handle.parameters, 'select').mockImplementation(() => undefined)
  feed(handle, { selected: 'BATT_CAPACITY' })
  await wrapper.vm.$nextTick()

  const related = wrapper.findAll('.related-item')
  expect(related.map(item => item.text())).toEqual(['BATT_LOW_VOLT'])
  await related[0]?.trigger('click')

  expect(select).toHaveBeenCalledWith('BATT_LOW_VOLT')
})

it('lists no related parameters for one that is alone in its group', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.find('.related').exists()).toBe(false)
})
