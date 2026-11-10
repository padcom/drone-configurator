<template>
  <div class="enum-field">
    <input
      class="kit-input enum-input"
      :class="{ open, named: name !== undefined }"
      :id="inputId"
      role="combobox"
      type="text"
      autocomplete="off"
      :aria-label="inputId ? undefined : label"
      :aria-describedby="nameless ? `${listId}-noname` : undefined"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
      :value="text"
      @focus="onFocus"
      @click="open = true"
      @input="onInput"
      @keydown="onKey"
      @blur="onBlur"
    >
    <span class="enum-badge" aria-hidden="true">{{ badge }}</span>
    <span v-if="nameless" :id="`${listId}-noname`" class="visually-hidden">{{ t('enum.noName') }}</span>
    <Icon class="chevron" name="chevron-down" />
    <div v-if="open" :id="listId" class="listbox" role="listbox" :aria-label="label">
      <button v-if="custom" type="button" class="option custom" tabindex="-1" @mousedown.prevent @click="pick(Number(query))">
        <span class="num">{{ query?.trim() }}</span>
        <span>{{ t('enum.useNumber') }}</span>
      </button>
      <button
        v-for="(option, i) in shown"
        :id="`${listId}-${i}`"
        :key="option.value"
        type="button"
        role="option"
        class="option"
        :class="{ active: i === active }"
        :aria-selected="option.value === model ? 'true' : 'false'"
        tabindex="-1"
        @mousedown.prevent
        @click="pick(option.value)"
      >
        <span class="num">{{ option.value }}</span>
        <span class="name">{{ option.label }}</span>
        <Icon v-if="option.value === model" class="mark" name="check" />
      </button>
      <div v-if="none" class="none">{{ t('enum.noMatch') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A field for a value of the vehicle that is a number with names (a failsafe action, a flight mode): it shows the name,
// offers the list, and accepts any number, because a vehicle can hold a value that has no name here; a number with no name is
// shown as it is. Typing filters the list by name or by the start of the number; the arrows move, Enter takes the
// highlighted row (or a typed number), Escape closes, and leaving the field with a number typed uses it. It takes any number
// that is typed, 2.5 and -1 as well: a screen whose value is an integer (or never negative) refuses the others itself.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { type EnumOption, chosen, isNumber, matching, moved, nameOf, offersNumber, typedNumber } from './enumField'
import Icon from './kit/Icon.vue'

const props = defineProps<{
  /** The options, with the numbers the vehicle stores. */
  options: EnumOption[]
  /** What the field is, for a screen reader (and for its list). */
  label: string
  /** The id of the field, when a `<label for>` names it: the label is then that one, not `label`. */
  inputId?: string
}>()

const model = defineModel<number>({ required: true })

const { t } = useI18n()
const listId = useId()
const open = ref(false)
/** What is being typed, or null when nothing is (the field then shows the name of the value). */
const query = ref<string | null>(null)
const active = ref(-1)

const name = computed(() => nameOf(props.options, model.value))
/** The field shows a number that has no name: a screen reader is told so (the badge is for the eye). */
const nameless = computed(() => name.value === undefined && query.value === null)
const text = computed(() => query.value ?? name.value ?? String(model.value))
const badge = computed(() => query.value !== null ? '' : name.value === undefined ? t('enum.noName') : String(model.value))
const shown = computed(() => matching(props.options, query.value ?? ''))
const custom = computed(() => query.value !== null && offersNumber(props.options, query.value))
const none = computed(() => query.value !== null && shown.value.length === 0 && !isNumber(query.value))

/** Closes the list and forgets what was typed. */
function close(): void {
  open.value = false
  query.value = null
  active.value = -1
}

/**
 * Takes a value, and closes the list.
 *
 * @param value the number
 */
function pick(value: number): void {
  model.value = value
  close()
}

/**
 * The field got the focus: its text is selected, so typing replaces it, and the list opens.
 *
 * @param event the focus event
 */
function onFocus(event: FocusEvent): void {
  (event.target as HTMLInputElement).select()
  open.value = true
}

/**
 * Something was typed.
 *
 * @param event the input event
 */
function onInput(event: Event): void {
  query.value = (event.target as HTMLInputElement).value
  open.value = true
  active.value = -1
}

/** The field lost the focus: a typed number is used, anything else is let go. */
function onBlur(): void {
  const typed = typedNumber(query.value)
  if (typed === undefined) {
    close()
  } else {
    pick(typed)
  }
}

/**
 * An arrow key: the list opens and the highlight moves.
 *
 * @param event the key event
 */
function arrow(event: KeyboardEvent): void {
  event.preventDefault()
  open.value = true
  active.value = moved(active.value, shown.value.length, event.key)
}

/**
 * Enter: takes the highlighted row, a typed number, or the only row there is.
 *
 * @param event the key event
 */
function enter(event: KeyboardEvent): void {
  event.preventDefault()
  const value = chosen(shown.value, active.value, query.value)
  if (value !== undefined) {
    pick(value)
  }
}

/**
 * Escape closes the list, and does nothing else while it does: in a native dialog the browser closes the dialog on Escape
 * as the key's default action (its `cancel` event), which only `preventDefault` stops; `stopPropagation` keeps the key from
 * the listeners round it. Once the list is closed Escape goes on to the dialog.
 *
 * @param event the key event
 */
function escape(event: KeyboardEvent): void {
  if (open.value) {
    event.preventDefault()
    event.stopPropagation()
  }
  close()
}

/** What each key of the field does. */
const KEYS: Record<string, (event: KeyboardEvent) => void> = { ArrowDown: arrow, ArrowUp: arrow, Enter: enter, Escape: escape }

/**
 * The keys of the field.
 *
 * @param event the key event
 */
function onKey(event: KeyboardEvent): void {
  KEYS[event.key]?.(event)
}
</script>
