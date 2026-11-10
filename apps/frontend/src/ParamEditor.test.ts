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
 * @returns the component, the Configurator and the spy on the draft
 */
async function editorWithSpies() {
  const handle = createConfigurator(mockBackend())
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

  return { wrapper, handle, editDraft }
}

/**
 * Types into the Value field the way a keyboard does: an `input` event for the text, and no `change` (that comes when the value
 * is settled).
 *
 * @param wrapper the mounted editor
 * @param text what is typed
 */
async function typeInto(wrapper: Awaited<ReturnType<typeof editorWithSpies>>['wrapper'], text: string): Promise<void> {
  const field = wrapper.get<HTMLInputElement>('#draft')
  field.element.value = text
  await field.trigger('input')
}

it('asks for a parameter to be selected, and hides the form, until one is', async () => {
  createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, withI18n)
  await flushPromises()

  expect(wrapper.get('#detail').text()).toContain('Select a parameter')
  expect(wrapper.get('#edit').attributes('hidden')).toBeDefined()
})

it('shows the name of the selected parameter and the form while connected, with no big value, facts or buttons', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.get('#detail h2.param-name').text()).toBe('RTL_ALT')

  for (const gone of ['.big', '.facts', '.current']) {
    expect(wrapper.find(`#detail ${gone}`).exists(), gone).toBe(false)
  }
  expect(wrapper.get('#detail').text()).not.toContain('on the vehicle:')
  // The one way to write is the changes' button: the single Write and Add to changes are gone.
  expect(wrapper.find('#write').exists()).toBe(false)
  expect(wrapper.find('#stage').exists()).toBe(false)
  expect(wrapper.get('#edit').attributes('hidden')).toBeUndefined()
  expect((wrapper.get('#draft').element as HTMLInputElement).value).toBe('1600')
})

it('says what the parameter is, under its name, when the metadata has a short description (escaped)', async () => {
  const { wrapper, handle } = await editorWithSpies()
  expect(wrapper.find('#detail .description').exists()).toBe(false)

  feed(handle, { metadata: new Map([['RTL_ALT', { description: 'Return <i>altitude</i>', longDescription: 'The long text' }]]) })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#detail .description').text()).toBe('Return <i>altitude</i>')
  expect(wrapper.find('#detail i').exists()).toBe(false)
  // The long text is the Description's; the short one is not said again there.
  expect(wrapper.get('#param-description').text()).toContain('The long text')
  expect(wrapper.get('#param-description').text()).not.toContain('Return')
})

it('uses the kit\'s field for the value, with the same id', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.get('#draft').classes()).toContain('kit-input')
  expect(wrapper.get('label[for="draft"]').text()).toBe('Value')
})

it('queues the value when it is settled (leaving the field or Enter), not on every key', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  handle.parameters.select('RTL_ALT')
  await wrapper.vm.$nextTick()

  await typeInto(wrapper, '1')
  await typeInto(wrapper, '16')
  expect(handle.staged.changes.value).toEqual([])

  await typeInto(wrapper, '1600')
  await wrapper.get('#draft').trigger('change')
  expect(handle.staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1600 }])

  // Enter submits the form: the same, and nothing more is queued twice.
  await wrapper.get('#edit').trigger('submit')
  expect(handle.staged.changes.value).toHaveLength(1)

  // Put back to the value the vehicle has: the change goes, and its warning with it.
  await typeInto(wrapper, '1500')
  await wrapper.get('#draft').trigger('change')
  expect(handle.staged.changes.value).toEqual([])
  expect(handle.parameters.draftWarning.value).toBeNull()
})

it('leaves the queue as it is for an empty or invalid value, and shows the error', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, withI18n)
  await flushPromises()
  feed(handle, { params: PARAMS, connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  handle.parameters.select('RTL_ALT')
  await wrapper.vm.$nextTick()
  await typeInto(wrapper, '1600')
  await wrapper.get('#draft').trigger('change')

  await typeInto(wrapper, 'abc')
  await wrapper.get('#draft').trigger('change')
  expect(wrapper.get('#draft-error').text()).toBe('a number, please')
  await typeInto(wrapper, '')
  await wrapper.get('#draft').trigger('change')

  expect(handle.staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1600 }])
})

it('turns the Value field off while the changes are written, as what is typed then could not be queued', async () => {
  const { wrapper, handle } = await editorWithSpies()
  expect(wrapper.get('#draft').attributes('disabled')).toBeUndefined()

  handle.staged.writing.value = true
  await wrapper.vm.$nextTick()
  expect(wrapper.get('fieldset.field').attributes('disabled')).toBeDefined()
  expect((wrapper.get('#draft').element as HTMLInputElement).matches(':disabled')).toBe(true)

  handle.staged.writing.value = false
  await wrapper.vm.$nextTick()
  expect((wrapper.get('#draft').element as HTMLInputElement).matches(':disabled')).toBe(false)
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

it('shows a draft error as text, escaped', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, { draftError: '<b>a number</b>, please' })
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#detail .error').text()).toBe('<b>a number</b>, please')
  expect(wrapper.find('#detail b').exists()).toBe(false)
})

it('shows what the metadata finds unusual as a warning the field points to, and still queues the value', async () => {
  const { wrapper, handle } = await editorWithSpies()
  // The status is in the page all the time, empty, so that a screen reader announces its text when it comes.
  expect(wrapper.get('#draft-warning').text()).toBe('')
  expect(wrapper.get('#draft-warning').attributes('role')).toBe('status')
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBeUndefined()

  feed(handle, { metadata: new Map([['RTL_ALT', { min: 2000, max: 300000, units: 'cm' }]]) })
  await flushPromises()

  const warning = wrapper.get('#draft-warning')
  expect(warning.text()).toBe('Outside the usual range 2000–300000 cm')
  expect(warning.classes()).toContain('warning')
  expect(warning.attributes('role')).toBe('status')
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBe('draft-warning')
  expect(wrapper.get('#draft').attributes('aria-invalid')).toBeUndefined()
  await wrapper.get('#draft').trigger('change')
  expect(handle.staged.changes.value).toEqual([
    { id: 'RTL_ALT', from: 1500, to: 1600, warning: 'Outside the usual range 2000–300000 cm' },
  ])

  // An error comes first: the field points to it, and the warning is not said beside it.
  feed(handle, { draftError: 'Not a number' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBe('draft-error')
  expect(wrapper.get('#draft-warning').text()).toBe('')
})

it('chooses a value from the names when the metadata has them, in the same field id, any number still allowed', async () => {
  const { wrapper, handle, editDraft } = await editorWithSpies()

  feed(handle, { metadata: new Map([['RTL_ALT', { values: { 0: 'Disabled', 1500: 'Default', 3000: 'High' } }]]), draft: '1500' })
  await wrapper.vm.$nextTick()

  const field = wrapper.get<HTMLInputElement>('#draft')
  expect(field.attributes('role')).toBe('combobox')
  expect(field.element.value).toBe('Default')
  expect(wrapper.get('#detail').text()).not.toContain('Values:')
  await field.trigger('focus')
  await wrapper.findAll('[role="option"]').find(option => option.text().includes('High'))?.trigger('click')
  expect(editDraft).toHaveBeenCalledWith('3000')
})

it('queues the value of a name that is picked, at once', async () => {
  const handle = createConfigurator(mockBackend())
  const wrapper = mount(ParamEditor, withI18n)
  await flushPromises()
  feed(handle, {
    params: PARAMS,
    metadata: new Map([['RTL_ALT', { values: { 0: 'Disabled', 1500: 'Default', 3000: 'High' } }]]),
    connection: { state: 'connected', vehicle: { ...VEHICLE } },
  })
  handle.parameters.select('RTL_ALT')
  await wrapper.vm.$nextTick()

  await wrapper.get('#draft').trigger('focus')
  await wrapper.findAll('[role="option"]').find(option => option.text().includes('High'))?.trigger('click')

  expect(handle.staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 3000 }])
})

it('names the field of names by a label beside it, so that its open list is not part of the name', async () => {
  const { wrapper, handle } = await editorWithSpies()
  feed(handle, { metadata: new Map([['RTL_ALT', { values: { 0: 'Disabled', 1500: 'Default' } }]]), draft: '1500' })
  await wrapper.vm.$nextTick()

  await wrapper.get('#draft').trigger('focus')
  const label = wrapper.get('label[for="draft"]')

  expect(label.text()).toBe('Value')
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

it('lists the other parameters of the same group as related, a line each: the name, and what it is', async () => {
  const { wrapper, handle } = await editorWithSpies()
  const select = vi.spyOn(handle.parameters, 'select').mockImplementation(() => undefined)
  feed(handle, {
    selected: 'BATT_CAPACITY',
    metadata: new Map([['BATT_LOW_VOLT', { description: 'Low battery voltage' }]]),
  })
  await wrapper.vm.$nextTick()

  // Inside the Description's scrolling box, after the rows: one line per parameter, the name a button, the text with a tooltip.
  const lines = wrapper.findAll('#param-description .body .related .related-line')
  expect(lines).toHaveLength(1)
  const [name, text] = [wrapper.get('.related-item'), wrapper.get('.related-text')]
  const shown = [name.text(), text.text(), text.attributes('title')]
  expect(shown).toEqual(['BATT_LOW_VOLT', 'Low battery voltage', 'Low battery voltage'])
  expect(wrapper.get('#param-description .body .related-label').text()).toBe('Related')
  await name.trigger('click')

  expect(select).toHaveBeenCalledWith('BATT_LOW_VOLT')
})

it('leaves the text of a related parameter empty, and without a tooltip, when there is no metadata for it', async () => {
  const { wrapper, handle } = await editorWithSpies()
  feed(handle, { selected: 'BATT_CAPACITY' })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#param-description .related-line .related-text')
  expect(text.text()).toBe('')
  expect(text.attributes('title')).toBeUndefined()
})

it('lists no related parameters for one that is alone in its group', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.find('.related').exists()).toBe(false)
})
