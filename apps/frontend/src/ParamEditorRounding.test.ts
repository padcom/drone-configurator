// Values by the type of the parameter, through the screens: an integer has no decimals (what is typed is rounded when it is
// settled, and the field says so), a float is shown without the noise of its widening to a double and is compared, queued and
// written as the float, so 0.1 typed is the 0.10000000149011612 the vehicle sent.
import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Param } from './generated/app'
import { VEHICLE } from './fixtures'
import { mockBackend } from './mock-backend'
import ParamEditor from './ParamEditor.vue'
import ParamTable from './ParamTable.vue'
import { questionFor } from './useStaged'
import { feed, nextFrame, withI18n } from './testing'
import { createConfigurator } from './useConfigurator'

const NOISY = 0.10000000149011612
const PARAMS: Param[] = [
  { id: 'A_REAL', index: 0, kind: 'real', type: 'REAL32', value: NOISY },
  { id: 'B_INT', index: 1, kind: 'int', type: 'INT16', value: 5 },
  { id: 'C_BIG', index: 2, kind: 'int', type: 'UINT32', value: 4294967295 },
  { id: 'D_FLOAT', index: 3, kind: 'real', type: 'REAL32', value: 16777216 },
  { id: 'E_SMALL', index: 4, kind: 'real', type: 'REAL32', value: Math.fround(1e-7) },
]

/**
 * The editor and the list on a connected Configurator that has the parameters above.
 *
 * @param select the parameter that is selected
 * @returns the components and the Configurator
 */
async function screen(select: string) {
  const handle = createConfigurator(mockBackend(), () => Promise.resolve(true))
  const editor = mount(ParamEditor, { ...withI18n, attachTo: document.body })
  const table = mount(ParamTable, withI18n)
  // The mock vehicle's first state arrives a moment after the start; the connection that is fed must come after it.
  await flushPromises()
  await nextFrame()
  feed(handle, { params: PARAMS, list: 'complete', connection: { state: 'connected', vehicle: { ...VEHICLE } } })
  handle.parameters.select(select)
  await flushPromises()

  return { editor, table, handle }
}

/**
 * Types a value into the Value field and settles it (leaves the field).
 *
 * @param editor the editor
 * @param text what is typed
 */
async function typeAndSettle(editor: Awaited<ReturnType<typeof screen>>['editor'], text: string): Promise<void> {
  const field = editor.get<HTMLInputElement>('#draft')
  // As a keyboard does it: the text is typed (an `input`) and the value is settled later (a `change`, on leaving). (`setValue`
  // of the test utils fires both at once, so that a value that goes back to what it was is never drawn.)
  field.element.value = text
  await field.trigger('input')
  await field.trigger('change')
  await flushPromises()
}

const cells = (table: Awaited<ReturnType<typeof screen>>['table']) => table.findAll('#rows td.num').map(cell => cell.text())

it('shows the grid and the Value field without the noise of a float, and every digit of a whole number', async () => {
  const { editor, table } = await screen('A_REAL')

  expect(cells(table)).toEqual(['0.1', '5', '4294967295', '16777216', '1e-7'])
  expect(editor.get<HTMLInputElement>('#draft').element.value).toBe('0.1')
})

it('queues nothing for the float typed as 0.1, which is the number the vehicle holds', async () => {
  const { editor, handle } = await screen('A_REAL')

  await typeAndSettle(editor, '0.1')

  expect(handle.staged.changes.value).toEqual([])
})

it('rounds a number with decimals typed for an integer when it is settled, shows that in the field, and queues it', async () => {
  const { editor, handle } = await screen('B_INT')

  await typeAndSettle(editor, '7.6')

  expect(editor.get<HTMLInputElement>('#draft').element.value).toBe('8')
  expect(handle.staged.changes.value).toEqual([{ id: 'B_INT', from: 5, to: 8 }])
  expect(editor.get('.staged-row .to').text()).toBe('8')
})

it('rounds to the number the integer already has: typed 5.2 is no change', async () => {
  const { editor, handle } = await screen('B_INT')

  await typeAndSettle(editor, '5.2')

  expect(handle.staged.changes.value).toEqual([])
  expect(handle.fields.draft.value).toBe('5')
  expect(editor.get<HTMLInputElement>('#draft').element.value).toBe('5')
})

it('still refuses an integer whose rounded value is outside the range of its type', async () => {
  const { editor, handle } = await screen('B_INT')

  await typeAndSettle(editor, '32767.5')

  expect(editor.get('#draft-error').text()).toBe('INT16 goes from -32768 to 32767')
  expect(handle.staged.changes.value).toEqual([])
})

it('queues a float as the float nearest to what was typed, and shows it in the rows and the question without noise', async () => {
  const { editor, handle } = await screen('A_REAL')

  await typeAndSettle(editor, '3.3')

  const [change] = handle.staged.changes.value
  expect(change).toEqual({ id: 'A_REAL', from: NOISY, to: Math.fround(3.3) })
  expect(editor.get('.staged-row .from').text()).toBe('0.1')
  expect(editor.get('.staged-row .to').text()).toBe('3.3')
  expect(questionFor(handle.staged.changes.value)).toBe('Write 1 parameter to the vehicle?\nA_REAL 0.1 → 3.3')
  expect(editor.get<HTMLInputElement>('#draft').element.value).toBe('3.3')
})

it('takes 16777217 typed for a float as 16777216, which it holds already, and 0.0000001 as 1e-7', async () => {
  const { editor, handle } = await screen('D_FLOAT')

  await typeAndSettle(editor, '16777217')
  expect(handle.staged.changes.value).toEqual([])

  handle.parameters.select('E_SMALL')
  await flushPromises()
  await typeAndSettle(editor, '0.0000001')
  expect(handle.staged.changes.value).toEqual([])
})

it('puts a float back to its initial value with no noise, and the reset of a value it has is no change', async () => {
  const { handle } = await screen('A_REAL')
  feed(handle, { initial: { values: new Map([['A_REAL', Math.fround(0.1)]]), at: 0 } })

  const queued = handle.staged.resetTo([{ id: 'A_REAL', to: 0.1 }])

  expect(queued).toBe(0)
  expect(handle.staged.changes.value).toEqual([])
})
