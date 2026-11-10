// What an enum field needs to decide, apart from the DOM: which options match what was typed, whether the typed text is a
// number that has no name, and where the arrow keys go. A vehicle's value is a number; the names are the interface's help.

/** One value the vehicle can take, and its name. */
export interface EnumOption {
  /** The number the vehicle stores. */
  value: number
  /** What it is called ("Return or land"). */
  label: string
}

const NUMBER = /^-?\d+(?:\.\d+)?$/u

/**
 * Whether some text is a number.
 *
 * @param text what was typed
 * @returns true for "7", "-1" and "2.5"
 */
export function isNumber(text: string): boolean {
  return NUMBER.test(text.trim())
}

/**
 * The options that fit what was typed: those whose name contains it, or whose number starts with it. Everything when
 * nothing was typed.
 *
 * @param options all the options
 * @param query what was typed
 * @returns the matching options, in order
 */
export function matching(options: EnumOption[], query: string): EnumOption[] {
  const q = query.trim().toLowerCase()

  return q === '' ? options : options.filter(o => o.label.toLowerCase().includes(q) || String(o.value).startsWith(q))
}

/**
 * Whether the typed text is a number that none of the options has: the field then offers to use it as it is.
 *
 * @param options all the options
 * @param query what was typed
 * @returns true when there is a number with no name
 */
export function offersNumber(options: EnumOption[], query: string): boolean {
  return isNumber(query) && !options.some(o => o.value === Number(query.trim()))
}

/**
 * The number that was typed, if what is in the field is one.
 *
 * @param query what was typed, or null when nothing was
 * @returns the number, or undefined
 */
export function typedNumber(query: string | null): number | undefined {
  return query !== null && isNumber(query) ? Number(query.trim()) : undefined
}

/**
 * The value of the one row there is.
 *
 * @param rows the rows shown
 * @returns its number, or undefined when there are none or several
 */
function onlyOne(rows: EnumOption[]): number | undefined {
  return rows.length === 1 ? rows[0]?.value : undefined
}

/**
 * The value Enter takes: the highlighted row, else a typed number, else the only row there is.
 *
 * @param rows the rows shown
 * @param active the highlighted row, or -1 for none
 * @param query what was typed, or null when nothing was
 * @returns the number, or undefined when Enter has nothing to take
 */
export function chosen(rows: EnumOption[], active: number, query: string | null): number | undefined {
  return rows[active]?.value ?? typedNumber(query) ?? onlyOne(rows)
}

/**
 * The name of a value.
 *
 * @param options all the options
 * @param value the number
 * @returns its name, or undefined when it has none
 */
export function nameOf(options: EnumOption[], value: number): string | undefined {
  return options.find(o => o.value === value)?.label
}

/**
 * Where the highlight goes for an arrow key: down or up one, and stopping at the ends.
 *
 * @param active the highlighted row, or -1 for none
 * @param count how many rows there are
 * @param key `ArrowDown` or `ArrowUp`
 * @returns the new row
 */
export function moved(active: number, count: number, key: string): number {
  return key === 'ArrowDown' ? Math.min(count - 1, active + 1) : Math.max(0, active - 1)
}
