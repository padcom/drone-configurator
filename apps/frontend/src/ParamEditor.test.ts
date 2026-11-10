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

  // The top block is gone (the value is in the list, the range in the Description): only a hidden name for the panel is left.
  expect(wrapper.get('#detail h2').text()).toBe('RTL_ALT')
  expect(wrapper.get('#detail h2').classes()).toContain('visually-hidden')

  for (const gone of ['.big', '.param-name', '.facts', '.current']) {
    expect(wrapper.find(`#detail ${gone}`).exists(), gone).toBe(false)
  }
  expect(wrapper.get('#detail').text()).not.toContain('on the vehicle:')
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

it('shows the outcome of a failed write and a draft error as text, escaped', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, {
    lastWrite: { kind: 'failed', id: 'RTL_ALT', message: '<b>TIMEOUT</b>' },
    draftError: 'a number, please',
  })
  await wrapper.vm.$nextTick()

  const text = wrapper.get('#detail').text()
  expect(text).toContain('Not confirmed: <b>TIMEOUT</b>')
  expect(text).toContain('The value on the vehicle is unknown')
  expect(text).toContain('a number, please')
  expect(wrapper.find('#detail b, #detail i').exists()).toBe(false)
  expect(wrapper.find('#detail .error').exists()).toBe(true)
})

it('shows nothing of a write that was read back but says it out of sight, and an unconfirmed one as a problem', async () => {
  const { wrapper, handle } = await editorWithSpies()

  feed(handle, { lastWrite: { kind: 'verified', id: 'RTL_ALT', value: 1600 } })
  await wrapper.vm.$nextTick()
  // The words are in the polite status (a screen reader reads them), in a visually hidden span: nothing is shown.
  const said = wrapper.get('#write-status span')
  expect(said.text()).toBe('Written and read back: 1600.')
  expect(said.classes()).toContain('visually-hidden')
  expect(wrapper.get('#write-alert').text()).toBe('')

  feed(handle, { lastWrite: { kind: 'failed', id: 'RTL_ALT', message: 'TIMEOUT' } })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#detail .notice.error').text()).toContain('Not confirmed')
  expect(wrapper.get('#detail .notice.error').attributes('role')).toBe('alert')
})

it('shows what the metadata finds unusual as a warning the field points to, and keeps Write enabled', async () => {
  const { wrapper, handle } = await editorWithSpies()
  // The status is in the page all the time, empty, so that a screen reader announces its text when it comes.
  expect(wrapper.get('#draft-warning').text()).toBe('')
  expect(wrapper.get('#draft-warning').attributes('role')).toBe('status')
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBeUndefined()

  feed(handle, { draftWarning: 'Outside the usual range 200–300000 cm' })
  await wrapper.vm.$nextTick()

  const warning = wrapper.get('#draft-warning')
  expect(warning.text()).toBe('Outside the usual range 200–300000 cm')
  expect(warning.classes()).toContain('warning')
  expect(warning.attributes('role')).toBe('status')
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBe('draft-warning')
  expect(wrapper.get('#draft').attributes('aria-invalid')).toBeUndefined()
  expect(wrapper.get('#write').attributes('disabled')).toBeUndefined()

  // An error comes first: the field points to it, and the warning is not said beside it.
  feed(handle, { draftError: 'Not a number' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#draft').attributes('aria-describedby')).toBe('draft-error')
  expect(wrapper.get('#draft-warning').text()).toBe('')
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

it('has a polite and an assertive region for the outcome of a write, there from the start and empty', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.get('.notice[role="status"]').text()).toBe('')
  expect(wrapper.get('.notice[role="alert"]').text()).toBe('')
})

it('says a write under way in the polite region, and one that is not confirmed or was changed in the assertive one', async () => {
  const { wrapper, handle } = await editorWithSpies()
  const polite = () => wrapper.get('.notice[role="status"]').text()
  const assertive = () => wrapper.get('.notice[role="alert"]').text()

  feed(handle, { writing: true })
  await wrapper.vm.$nextTick()
  expect([polite(), assertive()]).toEqual(['Writing… waiting for the vehicle to report the new value.', ''])

  feed(handle, { writing: false, lastWrite: { kind: 'verified', id: 'RTL_ALT', value: 1600 } })
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

  // The last row of the Description block, inside its scrolling box (and no longer a section of its own below the buttons).
  const related = wrapper.findAll('#param-description .body .row:last-child .related-item')
  expect(related.map(item => item.text())).toEqual(['BATT_LOW_VOLT'])
  expect(wrapper.get('#param-description .body .row.related dt').text()).toBe('Related')
  expect(wrapper.find('section.related').exists()).toBe(false)
  await related[0]?.trigger('click')

  expect(select).toHaveBeenCalledWith('BATT_LOW_VOLT')
})

it('adds a valid draft that differs to the changes with Add to changes, and writes nothing', async () => {
  const { wrapper, handle, write } = await editorWithSpies()

  expect(wrapper.get('#stage').attributes('disabled')).toBeUndefined()
  await wrapper.get('#stage').trigger('click')
  expect(handle.staged.changes.value).toEqual([{ id: 'RTL_ALT', from: 1500, to: 1600 }])
  expect(write).not.toHaveBeenCalled()

  feed(handle, { draft: '1500' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#stage').attributes('disabled')).toBeDefined()
  feed(handle, { draft: '1700', draftError: 'a number, please' })
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#stage').attributes('disabled')).toBeDefined()
})

it('turns the single Write off while another write (the collected changes, a snapshot) holds the lock', async () => {
  const { wrapper, handle } = await editorWithSpies()
  expect(wrapper.get('#write').attributes('disabled')).toBeUndefined()

  const release = handle.parameters.lock.take()
  await wrapper.vm.$nextTick()
  expect(wrapper.get('#write').attributes('disabled')).toBeDefined()
  release?.()
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#write').attributes('disabled')).toBeUndefined()
})

it('leaves Write turned on while its question is open, so that the dialog can give the focus back to it', async () => {
  const neverAnswered = () => new Promise<boolean>(() => {
    // The user has not answered.
  })
  const handle = createConfigurator(mockBackend(), neverAnswered)
  const wrapper = mount(ParamEditor, { ...withI18n, attachTo: document.body })
  await flushPromises()
  const connection = { state: 'connected' as const, vehicle: { ...VEHICLE } }
  feed(handle, { params: PARAMS, selected: 'RTL_ALT', draft: '1600', connection })
  await wrapper.vm.$nextTick()

  await wrapper.get('#edit').trigger('submit')
  await wrapper.vm.$nextTick()

  expect(wrapper.get('#write').attributes('disabled')).toBeUndefined()
  expect(handle.parameters.lock.busy.value).toBe(false)
  wrapper.unmount()
})

it('lists no related parameters for one that is alone in its group', async () => {
  const { wrapper } = await editorWithSpies()

  expect(wrapper.find('.related').exists()).toBe(false)
})
