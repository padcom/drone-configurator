// The six flight mode slots of a Copter and what chooses between them: FLTMODE1 to FLTMODE6 are the modes, FLTMODE_CH the
// channel of the switch. ArduCopter/Parameters.cpp lines 150 to 192 say which pulse width chooses which slot (up to 1230, to
// 1360, to 1490, to 1620, to 1749, and 1750 up). The names of the modes come from the backend (`vehicle.modes`), never from here.

/** The parameters of the slots, in order. */
export const SLOT_PARAMS: readonly string[] = ['FLTMODE1', 'FLTMODE2', 'FLTMODE3', 'FLTMODE4', 'FLTMODE5', 'FLTMODE6']

/** The parameter that names the channel of the mode switch. */
export const CHANNEL_PARAM = 'FLTMODE_CH'

/** Everything the page writes. */
export const MODE_PARAMS: readonly string[] = [...SLOT_PARAMS, CHANNEL_PARAM]

/** The last pulse width (µs) that still chooses each of the first five slots: the sixth takes everything above. */
const SLOT_TOPS: readonly number[] = [1230, 1360, 1490, 1620, 1749]

/** The modes that bring the vehicle back or down by themselves (Copter: RTL 6, Land 9, SmartRTL 21). */
export const ESCAPE_MODES: readonly number[] = [6, 9, 21]

/** The modes that have a line of help under them (the words are `setup.modes.hint.<number>`). */
export const HINTED_MODES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 14, 15, 16, 17, 18, 21]

/** The pulse widths a slot answers to: up to a width, from a width up, or between two. */
export type SlotRange
  = | { kind: 'upTo', to: number }
    | { kind: 'from', from: number }
    | { kind: 'between', from: number, to: number }

/**
 * Whether none of the slots can bring the vehicle home or down: the page warns, and says what to do.
 *
 * @param slots the mode of each slot
 * @returns true when no slot is RTL, Land or SmartRTL
 */
export function noEscape(slots: readonly number[]): boolean {
  return !slots.some(mode => ESCAPE_MODES.includes(mode))
}

/**
 * Where a pulse width of the mode channel falls.
 *
 * @param width the pulse width (µs)
 * @returns the slot, 0 to 5
 */
export function slotFor(width: number): number {
  const slot = SLOT_TOPS.findIndex(top => width <= top)

  return slot < 0 ? SLOT_TOPS.length : slot
}

/**
 * The pulse widths a slot answers to.
 *
 * @param slot the slot, 0 to 5
 * @returns the range
 */
export function slotRange(slot: number): SlotRange {
  const to = SLOT_TOPS[slot]
  const before = SLOT_TOPS[slot - 1]
  if (to === undefined) {
    return { kind: 'from', from: (SLOT_TOPS.at(-1) ?? 0) + 1 }
  }

  return before === undefined ? { kind: 'upTo', to } : { kind: 'between', from: before + 1, to }
}

/**
 * Whether a mode has a line of help.
 *
 * @param mode the mode's number
 * @returns true if it does
 */
export function hasHint(mode: number): boolean {
  return HINTED_MODES.includes(mode)
}

/**
 * Whether a number is a channel of the receiver the mode switch can be on: a whole number from 0 (none) to 16.
 *
 * @param channel the number
 * @returns true if it is
 */
function isChannel(channel: number): boolean {
  return Number.isInteger(channel) && channel >= 0 && channel <= 16
}

/**
 * The channel as typed.
 *
 * @param text what was typed
 * @returns the channel, or null when it is not one
 */
export function parseChannel(text: string): number | null {
  const channel = Number(text)

  return text.trim() !== '' && isChannel(channel) ? channel : null
}
