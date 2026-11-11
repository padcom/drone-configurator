<template>
  <div ref="root" class="kit-menu">
    <Button
      :id="triggerId"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? listId : undefined"
      @click="toggle"
      @keydown="onTriggerKey"
    >
      {{ label }}
      <Icon name="chevron-down" />
    </Button>
    <div v-if="open" :id="listId" class="list" role="menu" :aria-labelledby="triggerId" @keydown="onKey">
      <button
        v-for="(item, i) in items"
        :key="item.id"
        type="button"
        role="menuitem"
        class="item"
        :disabled="item.disabled"
        :tabindex="i === active ? 0 : -1"
        @click="choose(item)"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.hint" class="hint">{{ item.hint }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// A button that opens a list of actions (role=menu): the arrows, Home and End move between the items, a letter goes to the
// next item that starts with it, Enter or Space chooses, Escape closes and puts the focus back on the button, Tab and a click
// elsewhere close. An item that cannot be chosen is skipped. `select` says which item was chosen, by its id.
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import Button from './Button.vue'
import Icon from './Icon.vue'
import { type MenuItem, edge, focusAndShow, pageStep, rowsPerPage, step, typeAhead } from '@/lib/ui/menuKeys'

/** How long the letters of type-ahead are remembered (ms). */
const TYPED_MS = 700

/** How many items a page is when the list is not laid out (and so cannot say). */
const FALLBACK_PAGE = 5

const props = defineProps<{
  /** What the button says. */
  label: string
  /** The items, in order. */
  items: MenuItem[]
}>()

const emit = defineEmits<{
  /** An item was chosen: its id. */
  select: [id: string]
}>()

const triggerId = useId()
const listId = useId()
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const active = ref(-1)
let typed = ''
let typedTimer: ReturnType<typeof setTimeout> | undefined

/** Puts the focus on the item that is active, once it is there. */
async function focusActive(): Promise<void> {
  await nextTick()
  // The item is in view whichever key brought it here, and the list moves no more than it must.
  focusAndShow(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active.value])
}

/** Puts the focus back on the button. */
function focusTrigger(): void {
  root.value?.querySelector<HTMLElement>(`[id="${triggerId}"]`)?.focus()
}

/**
 * Closes the menu.
 *
 * @param back whether the focus goes back to the button (not when it went elsewhere: Tab, a click)
 */
function close(back: boolean): void {
  open.value = false
  active.value = -1

  if (back) {
    focusTrigger()
  }
}

/**
 * Opens the menu on an item.
 *
 * @param at which item: the first or the last that can be chosen
 */
function openAt(at: 'first' | 'last'): void {
  open.value = true
  active.value = edge(props.items, at)
  void focusActive()
}

/** The button was pressed: opens at the first item, or closes. */
function toggle(): void {
  if (open.value) {
    close(false)
  } else {
    openAt('first')
  }
}

/**
 * Keys on the button: the arrows open the menu on its first or last item.
 *
 * @param event the key event
 */
function onTriggerKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openAt(event.key === 'ArrowDown' ? 'first' : 'last')
  }
}

/**
 * An item was chosen.
 *
 * @param item the item
 */
function choose(item: MenuItem): void {
  emit('select', item.id)
  close(true)
}

/**
 * Moves the focus to an item.
 *
 * @param at its index (nothing happens for -1)
 */
function go(at: number): void {
  if (at >= 0) {
    active.value = at
    void focusActive()
  }
}

/**
 * A letter: goes to the next item that starts with what was typed lately.
 *
 * @param key the character
 */
function typeLetter(key: string): void {
  clearTimeout(typedTimer)
  typed += key
  typedTimer = setTimeout(() => {
    typed = ''
  }, TYPED_MS)
  go(typeAhead(props.items, active.value, typed))
}

/**
 * Moves the focus by a key, which does nothing else.
 *
 * @param event the key event
 * @param to the item to go to
 */
function moveTo(event: KeyboardEvent, to: number): void {
  event.preventDefault()
  go(to)
}

/**
 * Escape closes the menu and stays here (in a dialog it would close the dialog too).
 *
 * @param event the key event
 */
function escape(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  close(true)
}

/**
 * How many items a page is: the ones that fit in the list (a few when it is not laid out).
 *
 * @returns the items, at least one
 */
function pageSize(): number {
  const list = root.value?.querySelector<HTMLElement>('[role="menu"]')
  const item = list?.querySelector<HTMLElement>('[role="menuitem"]')

  return rowsPerPage(list, item, FALLBACK_PAGE)
}

/** What each key in the list does (a letter is type-ahead, below). */
const KEYS: Record<string, (event: KeyboardEvent) => void> = {
  ArrowDown: event => moveTo(event, step(props.items, active.value, 1)),
  ArrowUp: event => moveTo(event, step(props.items, active.value, -1)),
  Home: event => moveTo(event, edge(props.items, 'first')),
  End: event => moveTo(event, edge(props.items, 'last')),
  PageDown: event => moveTo(event, pageStep(props.items, active.value, 1, pageSize())),
  PageUp: event => moveTo(event, pageStep(props.items, active.value, -1, pageSize())),
  Escape: escape,
  Tab: () => close(false),
}

/**
 * Whether a key is held with Ctrl, Alt or Meta: a shortcut, not a letter.
 *
 * @param event the key event
 * @returns true for a shortcut
 */
function shortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/**
 * Whether a key is a letter (or a digit or a sign) for type-ahead: one character, no Ctrl, Alt or Meta, and not Space (which
 * chooses).
 *
 * @param event the key event
 * @returns true for a character to type ahead with
 */
function isLetter(event: KeyboardEvent): boolean {
  return !shortcut(event) && event.key.length === 1 && event.key !== ' '
}

/**
 * Keys in the list.
 *
 * @param event the key event
 */
function onKey(event: KeyboardEvent): void {
  const action = KEYS[event.key]
  if (action) {
    action(event)
  } else if (isLetter(event)) {
    typeLetter(event.key)
  }
}

/**
 * A press anywhere closes the menu, unless it is inside it.
 *
 * @param event the pointer event
 */
function outside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) {
    close(false)
  }
}

watch(open, now => {
  if (now) {
    window.addEventListener('pointerdown', outside)
  } else {
    window.removeEventListener('pointerdown', outside)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside)
  clearTimeout(typedTimer)
})
</script>
