// The kit's data table: only the rows in view are drawn, the sort and its arrow, the edge of a column that is nudged, the filter,
// the keys (one tab stop, the arrows, Tab, an edit begun by a character or Enter, ended by Enter, Tab or Escape), the cell and
// editor a caller draws, that updating one cell draws one row, and a benchmark of 2000 rows.
import { afterEach, describe, expect, it } from 'vitest'
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils'
import { type DefineComponent, defineComponent, h, nextTick, ref } from 'vue'
import { i18n } from '@/i18n/i18n'
import type { Column } from '@/lib/ui/dataTable'
import DataTable from './DataTable.vue'

interface Row {
  id: number
  name: string
  value: number
}

type Part = ReturnType<VueWrapper['get']>

const COLUMNS: Column<Row>[] = [
  { id: 'id', header: 'Number', value: row => row.id, sortable: true, align: 'end' },
  { id: 'name', header: 'Name', value: row => row.name, sortable: true, editable: true },
  { id: 'value', header: 'Value', value: row => row.value, sortable: true, editable: true, min: 60 },
]

let mounted: VueWrapper | undefined

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

/**
 * Rows to show.
 *
 * @param count how many
 * @returns the rows, numbered from 1, in the order of their names
 */
function rowsOf(count: number): Row[] {
  return Array.from({ length: count }, (_unused, n) => ({
    id: n + 1,
    name: `P${String(n + 1).padStart(4, '0')}`,
    value: (n * 7) % 100,
  }))
}

/**
 * A table, in the page (focus needs that).
 *
 * @param props what to give it, over the rows and columns
 * @param slots the slots
 * @returns the table
 */
function table(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}): VueWrapper {
  mounted = mount(DataTable as unknown as DefineComponent, {
    props: { rows: rowsOf(8), columns: COLUMNS, rowKey: (row: Row) => row.id, label: 'Parameters', ...props },
    slots: slots as never,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })

  return mounted
}

/**
 * What the body shows, row by row.
 *
 * @param wrapper the table
 * @returns the text of each cell of each row, joined
 */
function shown(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.data-table-row').map(row => row.findAll('.data-table-cell').map(part => part.text()).join('|'))
}

/**
 * The top of a row (px), from its style.
 *
 * @param row the row
 * @returns the number, as text
 */
function topOf(row: Part): string | undefined {
  return /top: (?<px>\d+)px/u.exec(row.attributes('style') ?? '')?.groups?.px
}

/**
 * Where each drawn row says it is: its name, its place, its top (px) and its aria-rowindex, as "name@place/top/aria".
 *
 * @param wrapper the table
 * @returns one text for each row, in the order of the page
 */
function placed(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.data-table-row').map(row => {
    const name = row.findAll('.data-table-cell')[1]?.text()

    return `${name}@${row.attributes('data-index')}/${topOf(row)}/${row.attributes('aria-rowindex')}`
  })
}

/**
 * The cell at a row and a column of the drawn rows.
 *
 * @param wrapper the table
 * @param index the row (as its place in the table)
 * @param col the column
 * @returns the element of the cell
 */
function cellAt(wrapper: VueWrapper, index: number, col: number): HTMLElement {
  return wrapper.get(`[data-index="${index}"] [data-column="${col}"]`).element as HTMLElement
}

/**
 * Puts the focus in a cell.
 *
 * @param wrapper the table
 * @param index the row
 * @param col the column
 */
function focusCell(wrapper: VueWrapper, index: number, col: number): void {
  cellAt(wrapper, index, col).focus()
}

/**
 * Presses a key where the focus is.
 *
 * @param key the key
 * @param more what else is down
 */
async function press(key: string, more: KeyboardEventInit = {}): Promise<void> {
  const target = document.activeElement ?? document.body

  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...more }))
  await flushPromises()
}

/**
 * Types into the field of an edit.
 *
 * @param wrapper the table
 * @param text what to type
 */
function typeInto(wrapper: VueWrapper, text: string): void {
  const field = wrapper.get('input').element as HTMLInputElement

  field.value = text
  field.dispatchEvent(new Event('input'))
}

/**
 * Scrolls the table to a row.
 *
 * @param wrapper the table
 * @param row the row
 */
async function scrollTo(wrapper: VueWrapper, row: number): Promise<void> {
  const scroller = wrapper.get('.data-table-scroll').element as HTMLElement

  scroller.scrollTop = row * 44
  scroller.dispatchEvent(new Event('scroll'))
  await nextTick()
}

/**
 * The places of the rows that are drawn.
 *
 * @param wrapper the table
 * @returns the places
 */
function drawnRows(wrapper: VueWrapper): number[] {
  return wrapper.findAll('.data-table-row').map(row => Number(row.attributes('data-index')))
}

describe('the rows', () => {
  it('are a grid with a header and a row for each, in the order they came in', () => {
    const wrapper = table()

    expect(wrapper.get('[role="grid"]').attributes('aria-label')).toBe('Parameters')
    expect(wrapper.get('[role="grid"]').attributes('aria-rowcount')).toBe('9')
    expect(wrapper.findAll('[role="columnheader"]').map(head => head.text())).toEqual(['Number', 'Name', 'Value'])
    expect(shown(wrapper)).toHaveLength(8)
    expect(shown(wrapper)[0]).toBe('1|P0001|0')
  })

  it('say there are none', () => {
    const wrapper = table({ rows: [] })

    expect(wrapper.get('.data-table-empty').text()).toBe('No rows.')
    expect(wrapper.findAll('.data-table-row')).toHaveLength(0)
  })
})

describe('a long list', () => {
  it('is drawn only where it is in view, with the body as tall as all of it', async () => {
    const wrapper = table({ rows: rowsOf(2000) })

    expect(drawnRows(wrapper).length).toBeLessThan(80)
    expect(wrapper.get('.data-table-body').attributes('style')).toContain(`height: ${2000 * 44}px`)

    await scrollTo(wrapper, 1000)
    // (the first row is drawn too: it holds the tab stop, and a scroll must not take it away)
    const near = drawnRows(wrapper).filter(index => index > 0)

    expect(drawnRows(wrapper)[0]).toBe(0)
    expect(Math.min(...near)).toBeGreaterThan(900)
    expect(Math.max(...near)).toBeLessThan(1100)
  })
})

describe('the sort of the rows', () => {
  /**
   * A table of three rows that keeps the sort it is told about.
   *
   * @returns the table
   */
  function sorting(): VueWrapper {
    const rows = [{ id: 1, name: 'B', value: 1 }, { id: 2, name: 'C', value: 2 }, { id: 3, name: 'A', value: 3 }]
    const wrapper = table({ rows, 'sort': null, 'onUpdate:sort': (sort: unknown) => wrapper.setProps({ sort }) })

    return wrapper
  }
  const names = (wrapper: VueWrapper): string[] => shown(wrapper).map(row => row.split('|')[1] as string)
  const head = (wrapper: VueWrapper): Part => wrapper.findAll('[role="columnheader"]')[1] as Part

  it('goes ascending, then descending, then none, with its arrow and aria-sort', async () => {
    const wrapper = sorting()

    expect([names(wrapper), head(wrapper).attributes('aria-sort')]).toEqual([['B', 'C', 'A'], 'none'])
    await head(wrapper).get('button').trigger('click')
    expect([names(wrapper), head(wrapper).attributes('aria-sort')]).toEqual([['A', 'B', 'C'], 'ascending'])
    expect(head(wrapper).text()).toContain('▲')
    expect(placed(wrapper)).toEqual(['A@0/0/2', 'B@1/44/3', 'C@2/88/4'])
    await head(wrapper).get('button').trigger('click')
    expect([names(wrapper), head(wrapper).attributes('aria-sort')]).toEqual([['C', 'B', 'A'], 'descending'])
    expect(placed(wrapper)).toEqual(['C@0/0/2', 'B@1/44/3', 'A@2/88/4'])
    await head(wrapper).get('button').trigger('click')
    expect(names(wrapper)).toEqual(['B', 'C', 'A'])
  })
})

describe('a column that is not sortable', () => {
  it('has no button in its header and no aria-sort', () => {
    const wrapper = table({ columns: [{ id: 'id', header: 'Number', value: (row: Row) => row.id }] })

    expect(wrapper.find('[role="columnheader"] button').exists()).toBe(false)
    expect(wrapper.get('[role="columnheader"]').attributes('aria-sort')).toBeUndefined()
  })
})

describe('the filter', () => {
  it('shows the rows the hook lets through', async () => {
    const wrapper = table({ filter: (row: Row) => row.id % 2 === 0 })

    expect(shown(wrapper).map(row => row.split('|')[0])).toEqual(['2', '4', '6', '8'])
    expect(wrapper.get('[role="grid"]').attributes('aria-rowcount')).toBe('5')
    // (the rows that stay are moved up: their place, top and aria-rowindex follow the filter)
    expect(placed(wrapper).slice(0, 3)).toEqual(['P0002@0/0/2', 'P0004@1/44/3', 'P0006@2/88/4'])

    await wrapper.setProps({ filter: undefined })
    expect(shown(wrapper)).toHaveLength(8)
    expect(placed(wrapper).slice(0, 3)).toEqual(['P0001@0/0/2', 'P0002@1/44/3', 'P0003@2/88/4'])
  })
})

describe('the edge of a column, from the keyboard', () => {
  it('is moved by the arrow keys (Shift for more), and tells', async () => {
    const wrapper = table()
    const grips = wrapper.findAll('[role="separator"]')
    const grip = grips[2] as Part

    expect(grips).toHaveLength(3)
    expect(grip.attributes('aria-label')).toBe('Resize column Value')
    expect(grip.attributes('aria-valuenow')).toBe('120')
    await grip.trigger('keydown', { key: 'ArrowRight' })
    expect(grip.attributes('aria-valuenow')).toBe('128')
    await grip.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(grip.attributes('aria-valuenow')).toBe('160')
    expect(wrapper.emitted('resize')?.at(-1)?.[1]).toBe(160)
  })

  it('does not go under the column\'s least width', async () => {
    const wrapper = table()
    const grip = wrapper.findAll('[role="separator"]')[2] as Part

    await grip.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    await grip.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    await grip.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    await grip.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(grip.attributes('aria-valuenow')).toBe('60')
    expect(wrapper.get('.data-table-row').attributes('style')).toContain('grid-template-columns: 120px 120px 60px')
  })
})

describe('the edge of a column, with the pointer', () => {
  it('follows the pointer until it is up', async () => {
    const wrapper = table()
    const grip = wrapper.findAll('[role="separator"]')[0] as Part

    // (mouse events with the pointer events' names: the table only reads where the pointer is)
    grip.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true, cancelable: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150 }))
    await nextTick()
    expect(grip.attributes('aria-valuenow')).toBe('170')
    window.dispatchEvent(new MouseEvent('pointerup'))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400 }))
    await nextTick()
    expect(grip.attributes('aria-valuenow')).toBe('170')
  })

  it('has no edge to drag on a column that cannot be resized', () => {
    const wrapper = table({ columns: [{ id: 'id', header: 'Number', value: (row: Row) => row.id, resizable: false }] })

    expect(wrapper.find('[role="separator"]').exists()).toBe(false)
  })
})

describe('the cursor', () => {
  it('is one tab stop: the first cell until the cursor is somewhere, then the cell it is in', async () => {
    const wrapper = table()

    expect(wrapper.findAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1)
    expect(cellAt(wrapper, 0, 0).getAttribute('tabindex')).toBe('0')

    focusCell(wrapper, 3, 1)
    await nextTick()
    expect(wrapper.findAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1)
    expect(cellAt(wrapper, 3, 1).getAttribute('tabindex')).toBe('0')
  })
})

describe('the cursor, moved', () => {
  it('moves with the arrows, Home and End', async () => {
    const wrapper = table()

    focusCell(wrapper, 0, 0)
    await press('ArrowDown')
    await press('ArrowRight')
    expect(document.activeElement).toBe(cellAt(wrapper, 1, 1))
    await press('End')
    expect(document.activeElement).toBe(cellAt(wrapper, 1, 2))
    await press('Home')
    expect(document.activeElement).toBe(cellAt(wrapper, 1, 0))
  })

  it('goes to the ends of the table with Control Home and Control End', async () => {
    const wrapper = table()

    focusCell(wrapper, 2, 1)
    await press('End', { ctrlKey: true })
    expect(document.activeElement).toBe(cellAt(wrapper, 7, 2))
    await press('Home', { ctrlKey: true })
    expect(document.activeElement).toBe(cellAt(wrapper, 0, 0))
  })
})

describe('Tab in the table', () => {
  it('goes from cell to cell, row after row', async () => {
    const wrapper = table()

    focusCell(wrapper, 0, 1)
    await press('Tab')
    expect(document.activeElement).toBe(cellAt(wrapper, 0, 2))
    await press('Tab')
    expect(document.activeElement).toBe(cellAt(wrapper, 1, 0))
    await press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(cellAt(wrapper, 0, 2))
  })

  it('leaves the table at the last cell, which is the browser\'s to do', () => {
    const wrapper = table()
    const last = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })

    focusCell(wrapper, 7, 2)
    document.activeElement?.dispatchEvent(last)

    expect(last.defaultPrevented).toBe(false)
  })
})

describe('an edit that is begun', () => {
  it('with a character has it as the first of the new text, and ends with Enter, which goes down', async () => {
    const wrapper = table()

    focusCell(wrapper, 1, 1)
    await press('Z')
    expect(document.activeElement).toBe(wrapper.get('input').element)
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Z')
    typeInto(wrapper, 'Zed')
    await press('Enter')

    const [row, column, text] = wrapper.emitted('edit')?.[0] as [Row, Column<Row>, string]

    expect([row.id, column.id, text]).toEqual([2, 'name', 'Zed'])
    expect(wrapper.find('input').exists()).toBe(false)
    expect(document.activeElement).toBe(cellAt(wrapper, 2, 1))
  })
})

describe('an edit that is begun with Enter or a double click', () => {
  it('starts on the text the cell has, and ends with Tab, which goes right', async () => {
    const wrapper = table()

    focusCell(wrapper, 0, 1)
    await press('Enter')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('P0001')
    typeInto(wrapper, 'P1')
    await press('Tab')

    expect(wrapper.emitted('edit')?.[0]?.[2]).toBe('P1')
    expect(document.activeElement).toBe(cellAt(wrapper, 0, 2))
  })

  it('is the same with a double click', async () => {
    const wrapper = table()

    await wrapper.get('[data-index="2"] [data-column="2"]').trigger('dblclick')

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('14')
  })
})

describe('an edit that is dropped or unchanged', () => {
  it('with Escape tells nothing, and the focus is back in the cell', async () => {
    const wrapper = table()

    focusCell(wrapper, 0, 2)
    await press('F2')
    typeInto(wrapper, '99')
    await press('Escape')

    expect(wrapper.emitted('edit')).toBeUndefined()
    expect(wrapper.find('input').exists()).toBe(false)
    expect(document.activeElement).toBe(cellAt(wrapper, 0, 2))
    expect(shown(wrapper)[0]).toBe('1|P0001|0')
  })

  it('with the same text tells nothing either', async () => {
    const wrapper = table()

    focusCell(wrapper, 0, 1)
    await press('Enter')
    await press('Enter')

    expect(wrapper.emitted('edit')).toBeUndefined()
  })
})

describe('a cell of a column that is not editable', () => {
  it('is not edited by Enter or by a character', async () => {
    const wrapper = table()

    focusCell(wrapper, 0, 0)
    await press('Enter')
    await press('7')

    expect(wrapper.find('input').exists()).toBe(false)
  })
})

describe('the keys while a cell is edited', () => {
  it('are the field\'s: an arrow is not taken by the table', async () => {
    const wrapper = table()
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })

    focusCell(wrapper, 0, 1)
    await press('Enter')
    document.activeElement?.dispatchEvent(arrow)

    expect(arrow.defaultPrevented).toBe(false)
    expect(wrapper.find('input').exists()).toBe(true)
  })
})

describe('the cell slot', () => {
  it('draws the cells, and is given the row, the column and the value', () => {
    type Slot = { column: Column<Row>, value: string | number }
    const marked = (slot: Slot): string => (slot.column.id === 'value' ? `${slot.value}!` : String(slot.value))
    const wrapper = table({}, { cell: (slot: Slot) => h('b', { class: 'mark' }, marked(slot)) })

    expect(wrapper.findAll('.mark').slice(0, 3).map(mark => mark.text())).toEqual(['1', 'P0001', '0!'])
  })
})

describe('the editor slot', () => {
  it('edits a cell, and says the text and ends the edit', async () => {
    const wrapper = table({}, {
      editor: (slot: { text: string, set: (text: string) => void, commit: () => void }) => h('button', {
        class: 'own', onClick: () => {
          slot.set(`${slot.text}+`)
          slot.commit()
        },
      }, 'own'),
    })

    focusCell(wrapper, 0, 1)
    await press('Enter')
    expect(wrapper.find('input').exists()).toBe(false)
    await wrapper.get('.own').trigger('click')

    expect(wrapper.emitted('edit')?.[0]?.[2]).toBe('P0001+')
  })
})

describe('updating a cell', () => {
  it('draws the one row that changed, and not the table', async () => {
    let drawn = 0
    const rows = ref(rowsOf(30))
    const cell = (slot: { value: string | number }) => {
      drawn += 1

      return String(slot.value)
    }
    // (the slot from a template, as a page gives it)
    const Parent = defineComponent({
      components: { DataTable },
      setup: () => ({ rows, columns: COLUMNS, rowKey: (row: Row) => row.id, cell }),
      template: '<DataTable :rows="rows" :columns="columns" :row-key="rowKey" label="Parameters">'
        + '<template #cell="slot">{{ cell(slot) }}</template></DataTable>',
    })
    mounted = mount(Parent, { global: { plugins: [i18n] }, attachTo: document.body })
    const wrapper = mounted
    const before = drawn

    expect(before).toBeGreaterThanOrEqual(30 * 3)
    rows.value = rows.value.map((row, at) => (at === 5 ? { ...row, value: 99 } : row))
    await flushPromises()

    // (the three cells of the row that was replaced)
    expect(drawn - before).toBe(3)
    expect(shown(wrapper)[5]).toBe('6|P0006|99')
  })
})

/**
 * How long the update of one cell takes, as the least of many updates (so that a busy machine does not fail it).
 *
 * @param wrapper the table
 * @param rows the rows it shows
 * @param left how many more updates to make
 * @param best the least time so far (ms)
 * @returns the least time (ms)
 */
async function bestUpdate(wrapper: VueWrapper, rows: Row[], left: number, best = Number.POSITIVE_INFINITY): Promise<number> {
  if (left === 0) {
    return best
  }
  const next = rows.map((row, at) => (at === 3 ? { ...row, value: left } : row))
  const from = performance.now()

  await wrapper.setProps({ rows: next })

  return bestUpdate(wrapper, next, left - 1, Math.min(best, performance.now() - from))
}

describe('2000 rows', () => {
  it('update a cell in under 2 ms, and draw few rows', async () => {
    const rows = rowsOf(2000)
    const wrapper = table({ rows })

    await flushPromises()
    expect(await bestUpdate(wrapper, rows, 40)).toBeLessThan(2)
    expect(shown(wrapper)[3]).toBe('4|P0004|1')
    expect(drawnRows(wrapper).length).toBeLessThan(80)
  })

  it('draw few rows wherever they are scrolled to', async () => {
    const wrapper = table({ rows: rowsOf(2000) })

    await scrollTo(wrapper, 500)
    expect(drawnRows(wrapper).length).toBeLessThan(80)
    await scrollTo(wrapper, 1999)
    expect(drawnRows(wrapper).length).toBeLessThan(80)
  })
})

describe('a cell a row has nothing in', () => {
  it('is not edited, where the same column of another row is (a column editable by the row)', async () => {
    const byRow = { ...COLUMNS[1] as Column<Row>, editable: (row: Row) => row.id % 2 === 0 }
    const columns: Column<Row>[] = [COLUMNS[0] as Column<Row>, byRow]
    const wrapper = table({ columns })

    focusCell(wrapper, 0, 1)
    await press('Enter')
    expect(wrapper.find('input').exists()).toBe(false)

    focusCell(wrapper, 1, 1)
    await press('Enter')
    expect(wrapper.find('input').exists()).toBe(true)
  })
})

describe('the selected row', () => {
  it('is the row the cursor is in: a click there selects it, and it is marked for the eye and the ear', async () => {
    const chosen: (string | number)[] = []
    const wrapper = table({ 'selected': 3, 'onUpdate:selected': (key: string | number) => chosen.push(key) })

    expect(wrapper.get('[data-index="2"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-index="2"]').classes()).toContain('selected')
    expect(wrapper.get('[data-index="4"]').attributes('aria-selected')).toBe('false')

    await wrapper.get('[data-index="4"] [data-column="1"]').trigger('click')

    expect(chosen.at(-1)).toBe(5)
  })
})

describe('a row selected from outside', () => {
  it('is scrolled into view, with the cursor in it in its column, and the focus left alone', async () => {
    const chosen = ref<number>(1)
    const listen = { 'onUpdate:selected': (key: number) => { chosen.value = key } }
    const Parent = defineComponent(() => () => h(DataTable as unknown as DefineComponent, {
      rows: rowsOf(200), columns: COLUMNS, rowKey: (row: Row) => row.id, label: 'Parameters', selected: chosen.value, ...listen,
    }))
    mounted = mount(Parent, { global: { plugins: [i18n] }, attachTo: document.body })
    focusCell(mounted, 0, 2)
    await flushPromises()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()

    chosen.value = 150
    await flushPromises()

    expect(drawnRows(mounted)).toContain(149)
    expect(cellAt(mounted, 149, 2).tabIndex).toBe(0)
    expect(document.activeElement).toBe(outside)
  })
})

describe('a table that has no selection', () => {
  it('has no row that says aria-selected', () => {
    const wrapper = table()

    expect(wrapper.findAll('[aria-selected]')).toHaveLength(0)
  })
})

describe('a row that is marked', () => {
  it('has the class and the attributes the caller gives it', () => {
    const rowClass = (row: Row) => (row.id === 2 ? 'bad' : undefined)
    const wrapper = table({ rowClass, rowAttrs: (row: Row) => ({ 'data-id': String(row.id) }) })

    expect(wrapper.get('[data-id="2"]').classes()).toContain('bad')
    expect(wrapper.get('[data-id="3"]').classes()).not.toContain('bad')
  })
})
