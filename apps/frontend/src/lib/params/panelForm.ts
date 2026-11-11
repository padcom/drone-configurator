// The rows a panel form is made of: the shared form of the specialist screens (a head, a note, a warning, a read-only value,
// a slider, a tick, a text field, an enum field, a button). The caller owns the values: a row says what it shows, and the
// form says what the user did (`change` with the row's id and the new value, `press` for a button).
import type { EnumOption } from './enumField'

/** What every row has: an id, which is what `change` and `press` say. */
interface RowBase {
  /** Names the row among the form's rows. */
  id: string
}

/** A row with a label over (or beside) its control. */
interface LabelledRow extends RowBase {
  /** What the row is. */
  label: string
}

/** A small heading over the rows that follow, or a line of explanation, or something to take care of. */
export interface TextOnlyRow extends RowBase {
  /** `head` is a heading, `note` a line of explanation, `warn` a warning (read out as an alert, in the caution colour). */
  kind: 'head' | 'note' | 'warn'
  /** The words. */
  text: string
}

/** A label and a value that cannot be changed here. */
export interface InfoRow extends LabelledRow {
  /** Marks the row's kind. */
  kind: 'info'
  /** The value, as it is to be read. */
  value: string
}

/** A number in a range. */
export interface SliderRow extends LabelledRow {
  /** Marks the row's kind. */
  kind: 'slider'
  /** The number. */
  value: number
  /** The smallest. */
  min: number
  /** The largest. */
  max: number
  /** The step between numbers. */
  step: number
  /** The value as it is to be read, with its unit. */
  text: string
}

/** A tick. */
export interface CheckRow extends LabelledRow {
  /** Marks the row's kind. */
  kind: 'check'
  /** Whether it is ticked. */
  value: boolean
}

/** A text field for a value. */
export interface TextRow extends LabelledRow {
  /** Marks the row's kind. */
  kind: 'text'
  /** The text. */
  value: string
  /** What to show in the field while it is empty. */
  placeholder?: string
}

/** A number with names (see EnumField). */
export interface EnumRow extends LabelledRow {
  /** Marks the row's kind. */
  kind: 'enum'
  /** The number the vehicle holds. */
  value: number
  /** The names it can have. */
  options: EnumOption[]
}

/** A button. */
export interface ButtonRow extends LabelledRow {
  /** Marks the row's kind. */
  kind: 'button'
  /** How it is drawn (see Button). */
  tone?: 'default' | 'primary' | 'flight'
}

/** Any row. */
export type FormRow = TextOnlyRow | InfoRow | SliderRow | CheckRow | TextRow | EnumRow | ButtonRow

/** What a row can change to. */
export type FormValue = number | string | boolean
