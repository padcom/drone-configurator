<template>
  <div ref="root" class="kit-context" @contextmenu="onContext" @keydown="onTargetKey">
    <slot />
    <div
      v-if="open"
      :id="listId"
      ref="list"
      class="list"
      role="menu"
      :aria-label="label"
      :style="{ left: `${corner.left}px`, top: `${corner.top}px` }"
      @keydown="onKey"
    >
      <button
        v-for="(item, i) in items"
        :key="item.id"
        type="button"
        role="menuitem"
        class="item"
        :class="{ danger: item.danger }"
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
// A menu of actions for what is under the pointer: it opens at the pointer on a right click, and at the focused element on the
// Menu key or Shift F10 (the keys the system has for it); the arrows, Home and End move between the items, a letter goes to the
// next item that starts with it, Enter or Space chooses, Escape closes and puts the focus back where it was, and Tab or a press
// elsewhere closes. An item that cannot be chosen is skipped. `select` says which item was chosen, by its id. The slot is what
// the menu is for; with no items there is no menu (the system's own is not suppressed). The menu is drawn where it was asked
// for and moved just far enough to stay in the window (lib/ui/contextPlace.ts); the lists of the dropdown menu and this one
// look alike.
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { type MenuItem, edge, focusAndShow, step, typeAhead } from '@/lib/ui/menuKeys'
import { type Point, belowLeftOf, placed } from '@/lib/ui/contextPlace'

/** How long the letters of type-ahead are remembered (ms). */
const TYPED_MS = 700

const props = defineProps<{
  /** What the menu is, for a screen reader (the page's words). */
  label: string
  /** The items, in order. */
  items: MenuItem[]
}>()

const emit = defineEmits<{
  /** An item was chosen: its id. */
  select: [id: string]
}>()

const listId = useId()
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)
const active = ref(-1)
/** Where the menu is drawn (px, in the window). */
const corner = ref({ left: 0, top: 0 })
/** What had the focus when the menu opened: it has it again when the menu closes by a key. */
let origin: HTMLElement | null = null
let typed = ''
let typedTimer: ReturnType<typeof setTimeout> | undefined

/** Puts the focus on the item that is active, once it is there. */
async function focusActive(): Promise<void> {
  await nextTick()
  focusAndShow(list.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active.value])
}

/**
 * Closes the menu.
 *
 * @param back whether the focus goes back to where it was (not when it went elsewhere: Tab, a press elsewhere)
 */
function close(back: boolean): void {
  open.value = false
  active.value = -1

  if (back) {
    origin?.focus()
  }
}

/**
 * How big the list is, once it is drawn.
 *
 * @returns its size (0 and 0 when it is not drawn)
 */
function sizeOfList(): { width: number, height: number } {
  const box = list.value

  return box ? { width: box.offsetWidth, height: box.offsetHeight } : { width: 0, height: 0 }
}

/**
 * Draws the menu where it was asked for, moved into the window by its size (known once it is drawn).
 *
 * @param at the point it was asked for
 */
async function placeAt(at: Point): Promise<void> {
  corner.value = { left: at.x, top: at.y }
  await nextTick()
  corner.value = placed(at, sizeOfList(), { width: window.innerWidth, height: window.innerHeight })
}

/**
 * Opens the menu at a point and puts the focus on its first item.
 *
 * @param at the point
 */
function openAt(at: Point): void {
  origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
  open.value = true
  active.value = edge(props.items, 'first')
  void placeAt(at)
  void focusActive()
}

/**
 * Whether a right click or key came from the keyboard: the system gives it no place (0 and 0).
 *
 * @param event the event
 * @returns true when it has no place
 */
function placeless(event: MouseEvent): boolean {
  return event.clientX === 0 && event.clientY === 0
}

/**
 * Where the focused element is, as a point.
 *
 * @param target the element that has the focus, else the one the event is for
 * @returns the point
 */
function atElement(target: EventTarget | null): Point {
  const element = target instanceof Element ? target : root.value

  return belowLeftOf((element ?? document.body).getBoundingClientRect())
}

/**
 * Whether an element is in the list of the menu.
 *
 * @param target the element
 * @returns true when it is
 */
function insideList(target: EventTarget | null): boolean {
  return list.value?.contains(target as Node) ?? false
}

/**
 * Where a right click asks for the menu: at the pointer, or at the focused element when it came from the keyboard.
 *
 * @param event the event
 * @returns the point
 */
function pointOf(event: MouseEvent): Point {
  return placeless(event) ? atElement(event.target) : { x: event.clientX, y: event.clientY }
}

/**
 * A right click (or the system's key for it): opens the menu, when there are items.
 *
 * @param event the event
 */
function onContext(event: MouseEvent): void {
  if (props.items.length > 0 && !insideList(event.target)) {
    event.preventDefault()
    openAt(pointOf(event))
  }
}

/**
 * Whether a key is the one that asks for a context menu: the Menu key, or Shift F10.
 *
 * @param event the key event
 * @returns true for it
 */
function asksForMenu(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/**
 * Keys in what the menu is for: the system's keys for a context menu open it at the element that has the focus.
 *
 * @param event the key event
 */
function onTargetKey(event: KeyboardEvent): void {
  if (props.items.length > 0 && asksForMenu(event) && !insideList(event.target)) {
    event.preventDefault()
    openAt(atElement(event.target))
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

/** What each key in the list does (a letter is type-ahead, below). */
const KEYS: Record<string, (event: KeyboardEvent) => void> = {
  ArrowDown: event => moveTo(event, step(props.items, active.value, 1)),
  ArrowUp: event => moveTo(event, step(props.items, active.value, -1)),
  Home: event => moveTo(event, edge(props.items, 'first')),
  End: event => moveTo(event, edge(props.items, 'last')),
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
  if (!insideList(event.target)) {
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
