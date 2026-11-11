<template>
  <div class="enum-field bit-field">
    <input
      ref="input"
      :disabled="disabled"
      class="kit-input enum-input bit-input"
      :class="{ open }"
      :id="inputId"
      role="combobox"
      type="text"
      autocomplete="off"
      inputmode="numeric"
      :aria-label="inputId ? undefined : label"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="open && active >= 0 ? `${listId}-${active}` : undefined"
      :value="draft"
      :title="t('bits.help')"
      @focus="onFocus"
      @click="open = true"
      @input="onInput"
      @keydown="onKey"
      @blur="onBlur"
    >
    <span :id="`${listId}-summary`" class="bit-summary" :title="fullSummary">{{ summary }}</span>
    <span class="chevron-hit" aria-hidden="true" @mousedown.prevent @click="toggleList">
      <Icon class="chevron" name="chevron-down" />
    </span>
    <div
      v-if="open"
      :id="listId"
      class="listbox"
      role="listbox"
      aria-multiselectable="true"
      :aria-label="label"
      @mousedown.prevent
    >
      <button
        v-for="(option, i) in options"
        :id="`${listId}-${i}`"
        :key="option.bit"
        type="button"
        role="option"
        class="option bit-option"
        :class="{ active: i === active }"
        :aria-selected="isSet(value, option.bit, type) ? 'true' : 'false'"
        tabindex="-1"
        @mousedown.prevent
        @click="toggle(i)"
      >
        <span class="box" aria-hidden="true"><Icon v-if="isSet(value, option.bit, type)" name="check" /></span>
        <span class="name">{{ option.name }}</span>
        <span class="num">{{ t('bits.bit', { bit: option.bit }) }}</span>
      </button>
      <div v-if="other !== 0" class="none bit-other">{{ t('bits.other', { hex: hexOf(other) }) }}</div>
    </div>
    <span class="visually-hidden" role="status">{{ announced }}</span>
  </div>
</template>

<script setup lang="ts">
// A field for a value of the vehicle whose bits mean things (ArduPilot's Bitmask: bit number → name). The field is the number,
// as it is typed (any number is taken; the checkboxes follow it); the list has one row for each named bit with a box at the
// left, and a row toggles that one bit and leaves every other (the bits that have no name here as well). The number changes
// as the boxes are toggled, and the change is settled (queued by the screen) when the list is closed: Enter, leaving the field,
// or a click away; never in the middle of a series of toggles. Escape closes the list and keeps the value as it is.
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type BitOption, fitsType, hexOf, isSet, namesLine, setOptions, unknownBits, withBit } from '@/lib/params/bitmask'
import { moved } from '@/lib/params/enumField'
import Icon from '@/components/ui/Icon.vue'
import { rowsPerPage } from '@/lib/ui/menuKeys'

const props = defineProps<{
  /** The named bits, lowest first. */
  options: BitOption[]
  /** The parameter's type (INT32, UINT16, ...): how wide it is and whether its top bit is a sign. */
  type: string
  /** The number the checkboxes show: the number in `draft`, or the vehicle's value while the text is not one. */
  value: number
  /** What the field says: the draft's text. */
  draft: string
  /** What the field is, for a screen reader (and for its list). */
  label: string
  /** The id of the field, when a `<label for>` names it. */
  inputId?: string
  /** The draft is not acceptable: said to a screen reader (the reason is in the element `describedby` points to). */
  invalid?: boolean
  /** The id of an element that says more about the field (why it is invalid), read after its name. */
  describedby?: string
  /** The field cannot be used now (a fieldset round it being disabled is seen too): the list is closed and does not open. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** The draft changed: a bit was toggled, or a number was typed. */
  edit: [text: string]
  /** The value is settled: it can be queued. */
  settle: []
}>()

/** How many rows a page is when the list is not laid out (and so cannot say). */
const FALLBACK_PAGE = 5
/** How many names the closed field lists before it cuts the line. */
const ROOM = 3

const { t } = useI18n()
const listId = useId()
const open = ref(false)
const input = ref<HTMLInputElement | null>(null)
const active = ref(-1)
/** What was done last, for a screen reader ("GPS on"). */
const announced = ref('')

const set = computed(() => setOptions(props.value, props.options, props.type))
const other = computed(() => unknownBits(props.value, props.options, props.type))
const otherText = computed(() => other.value === 0 ? '' : t('bits.other', { hex: hexOf(other.value) }))
const summary = computed(() => {
  const head = set.value.length === 0 ? '' : t('bits.count', { count: set.value.length, names: namesLine(set.value, ROOM) })

  return [head, otherText.value].filter(Boolean).join('; ')
})
const fullSummary = computed(() => [namesLine(set.value, set.value.length), otherText.value].filter(Boolean).join('; '))
const describedBy = computed(() => {
  const ids = [props.describedby, summary.value ? `${listId}-summary` : ''].filter(Boolean)

  return ids.length > 0 ? ids.join(' ') : undefined
})

/** Closes the list (what was done is settled by the caller). */
function close(): void {
  open.value = false
  active.value = -1
}

/** Closes the list and settles the value. */
function settle(): void {
  close()
  emit('settle')
}

/**
 * Toggles the bit of a row, and says what it is now.
 *
 * @param index the row
 */
function toggle(index: number): void {
  const option = props.options[index]
  if (option === undefined) {
    return
  }
  // A number the type cannot hold is left as it is (the screen says why it is wrong): a toggle would fold it into range.
  if (!fitsType(props.value, props.type)) {
    announced.value = t('bits.outOfRange')

    return
  }
  const on = !isSet(props.value, option.bit, props.type)
  emit('edit', String(withBit(props.value, option.bit, on, props.type)))
  active.value = index
  announced.value = t(on ? 'bits.on' : 'bits.off', { name: option.name })
}

/**
 * Whether the field cannot be used now: it is disabled, or in a fieldset that is (the `disabled` property of the input does not
 * see that, the `:disabled` selector does).
 *
 * @returns true when a press on it does nothing
 */
const unusable = (): boolean => props.disabled === true || input.value?.matches(':disabled') === true

/**
 * The chevron: opens the list when it is closed, and closes it (settling the value, as Enter does) when it is open. The press
 * did not take the focus from the field, so the field has it after either.
 */
function toggleList(): void {
  if (unusable()) {
    return
  }
  if (open.value) {
    settle()

    return
  }
  input.value?.focus()
  open.value = true
}

// A list that is open when the field becomes unusable closes (its options are disabled buttons then).
watch(() => props.disabled, disabled => {
  if (disabled) {
    close()
  }
})

/**
 * The field got the focus: its text is selected, and the list opens.
 *
 * @param event the focus event
 */
function onFocus(event: FocusEvent): void {
  (event.target as HTMLInputElement).select()
  open.value = true
}

/**
 * Something was typed: the draft follows (the boxes follow the number).
 *
 * @param event the input event
 */
function onInput(event: Event): void {
  emit('edit', (event.target as HTMLInputElement).value)
}

/** The field lost the focus: the list closes and the value is settled. */
function onBlur(): void {
  settle()
}

/**
 * How many rows the list shows at once, for Page Up and Page Down (a few when it is not laid out).
 *
 * @returns the rows that fit, and at least one
 */
function pageRows(): number {
  const list = document.getElementById(listId)
  const row = list?.querySelector<HTMLElement>('[role="option"]')

  return rowsPerPage(list, row, FALLBACK_PAGE)
}

/**
 * An arrow key (or Page Up, Page Down): the list opens and the highlight moves.
 *
 * @param event the key event
 */
function arrow(event: KeyboardEvent): void {
  event.preventDefault()
  open.value = true
  active.value = moved(active.value, props.options.length, event.key, pageRows())
}

// The highlighted row is always in view, whichever key moved it.
watch(active, async index => {
  await nextTick()
  document.getElementById(`${listId}-${index}`)?.scrollIntoView?.({ block: 'nearest' })
})

/**
 * Home and End: the highlight goes to the first or the last row (the list opens if it was closed).
 *
 * @param event the key event
 */
function ends(event: KeyboardEvent): void {
  event.preventDefault()
  open.value = true
  active.value = event.key === 'Home' ? 0 : props.options.length - 1
}

/**
 * Space toggles the highlighted row; with none highlighted it does nothing (a number has no spaces). A key held down repeats,
 * and a bit would flicker on and off: only the first press toggles.
 *
 * @param event the key event
 */
function space(event: KeyboardEvent): void {
  event.preventDefault()

  if (open.value && !event.repeat) {
    toggle(active.value)
  }
}

/**
 * Enter closes the list and settles. With Ctrl it only closes: the screen's shortcut settles it and goes on to Write.
 *
 * @param event the key event
 */
function enter(event: KeyboardEvent): void {
  if (event.ctrlKey) {
    close()

    return
  }
  event.preventDefault()
  settle()
}

/**
 * Escape closes the list and does nothing else while it does (in a native dialog the browser would close the dialog on
 * Escape). Once the list is closed Escape goes on. The value is as it is: what was toggled stays in the draft, and is
 * settled when the field is left.
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
const KEYS: Record<string, (event: KeyboardEvent) => void> = {
  'ArrowDown': arrow,
  'ArrowUp': arrow,
  'PageDown': arrow,
  'PageUp': arrow,
  'Home': ends,
  'End': ends,
  ' ': space,
  'Enter': enter,
  'Escape': escape,
}

/**
 * The keys of the field.
 *
 * @param event the key event
 */
function onKey(event: KeyboardEvent): void {
  KEYS[event.key]?.(event)
}
</script>
