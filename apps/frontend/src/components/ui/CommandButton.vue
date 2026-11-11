
<template>
  <component
    :is="isLink ? 'a' : 'button'"
    v-if="cmd"
    class="command-button"
    :class="classes"
    :href="asLink ? href : undefined"
    :type="isLink ? undefined : 'button'"
    :role="isLink && !asLink ? 'link' : undefined"
    :tabindex="isLink && !asLink ? 0 : undefined"
    :aria-disabled="reason !== null ? 'true' : undefined"
    :aria-current="current ? 'page' : undefined"
    :aria-describedby="reason !== null ? reasonId : undefined"
    :aria-label="onlyIcon ? label : undefined"
    :title="onlyIcon ? label : undefined"
    :data-command-button="cmd.id"
    @click="press"
  >
    <template v-for="part in parts" :key="part">
      <span v-if="part === 'icon'" :class="look === 'rail' ? 'rail-icon' : 'command-button-icon'" aria-hidden="true">
        <Icon :name="cmd.icon as IconName" />
      </span>
      <span v-else :class="[look === 'rail' ? 'rail-label' : 'command-button-label', { 'visually-hidden': onlyIcon }]">
        {{ label }}
      </span>
    </template>
    <slot />
    <!-- Hidden from the page (it is not part of the button's text), still the button's description for a screen reader. -->
    <span v-if="reason !== null" :id="reasonId" hidden>{{ reason }}</span>
  </component>
</template>

<script setup lang="ts">
import { computed, inject, useId } from 'vue'
import { routerKey } from 'vue-router'
import Icon from './Icon.vue'
import type { Command } from '@/lib/commands/command'
import type { IconName } from '@/lib/ui/icons'
import { useCommandContext, useCommands } from '@/composables/useCommands'
import { type RunFrom, useCommandRunner } from '@/composables/useCommandRunner'

// A button that is a command: its words, its icon, whether it is the current one, whether it may be pressed (and why not) come
// from the command, and a press runs it through the registry (so the palette, the rail and the buttons agree). With a command
// that leads somewhere (it has an `href`) it is a real link: a middle click or Ctrl+click opens it as a link does, a normal click
// runs the command, and the current one is marked `aria-current="page"`. A command that may not run is `aria-disabled` (not a
// native disabled button: that cannot be focused, so its reason could not be reached and the focus would be lost when a button
// turns off under it), described by its reason, and does nothing when pressed. Nothing here depends on how it looks: the look and
// the place of the icon are two props, and the words (the accessible name) are the same for all of them.
const props = withDefaults(defineProps<{
  /** The command, or its id. */
  command: string | Command
  /** How it is drawn: the rail's, or one of the kit button's variants (`default` is the kit's outline). */
  look?: 'rail' | 'default' | 'primary' | 'flight' | 'plain'
  /** Where the icon is, relative to the words: `none` for the words alone. */
  iconPosition?: 'top' | 'left' | 'right' | 'bottom' | 'none'
  /** Only the icon is seen: the words stay as the accessible name and the tooltip. Needs an icon. */
  iconOnly?: boolean
  /** Who runs it (the focus that follows depends on it). */
  from?: RunFrom
}>(), { look: 'default', iconPosition: 'top', iconOnly: false, from: 'control' })

const registry = useCommands()
const ctx = useCommandContext()
const router = inject(routerKey, null)
const run = useCommandRunner()
const reasonId = `command-button-${useId()}-reason`

// The command object: given, or found by its id (none: nothing is drawn).
const cmd = computed(() => (typeof props.command === 'string' ? registry.get(props.command) : props.command))
const label = computed(() => (cmd.value ? cmd.value.label ?? ctx.say(cmd.value.buttonLabelKey ?? cmd.value.labelKey) : ''))
const availability = computed(() => cmd.value?.isEnabled(ctx))
const reason = computed(() => {
  const a = availability.value

  return a && !a.enabled ? ctx.say(a.reasonKey, a.reasonParams) : null
})
const current = computed(() => cmd.value?.isActive?.(ctx) ?? false)
/**
 * The address a real link points to: the router's own (it knows the base and the history mode), or the route as it is.
 *
 * @param route the command's route, if it leads somewhere
 * @returns the address, or undefined for a command that leads nowhere
 */
function hrefOf(route: string | undefined): string | undefined {
  return route === undefined ? undefined : (router?.resolve(route).href ?? route)
}

const href = computed(() => hrefOf(cmd.value?.href))
// A command that leads somewhere is always the same element, an <a>: replacing it by a <button> when the command turns off
// would lose the focus. While it may run it has its href (a real link); while it may not it has none, so that nothing opens,
// and it is kept focusable (a link without an href is not) and still a link for a screen reader, `aria-disabled` as any other.
const isLink = computed(() => href.value !== undefined)
const asLink = computed(() => isLink.value && reason.value === null)

/** Without an icon there is nothing to put by the words. */
const position = computed(() => (cmd.value?.icon === undefined ? 'none' : props.iconPosition))
// Only the icon is seen when it was asked for and the command has one: without an icon the words stay (nothing else is drawn).
const onlyIcon = computed(() => props.iconOnly && cmd.value?.icon !== undefined)

// The icon and the words in the order they are read: the icon first for top and left, the words first for bottom and right.
const parts = computed(() => {
  if (position.value === 'none') {
    return ['label']
  }

  return ['bottom', 'right'].includes(position.value) ? ['label', 'icon'] : ['icon', 'label']
})

// `plain` draws nothing of its own: the caller's class gives the look.
const LOOK_CLASSES: Record<string, string[]> = {
  rail: ['rail-item'],
  default: ['kit-button'],
  primary: ['kit-button', 'primary'],
  flight: ['kit-button', 'flight'],
  plain: [],
}

const classes = computed(() => [
  LOOK_CLASSES[props.look],
  `icon-${position.value}`,
  { 'icon-only': onlyIcon.value },
])

/**
 * Whether a click is the browser's to handle: on a link, a middle click or a modifier held (open in a new tab or window).
 *
 * @param event the click
 * @returns true when it is
 */
function leftToBrowser(event: MouseEvent): boolean {
  const modifier = [event.ctrlKey, event.shiftKey, event.altKey, event.metaKey].some(Boolean)

  return asLink.value && (event.button !== 0 || modifier)
}

/**
 * A press: nothing happens while the command may not run (the button stays focusable and says why); a link that is opened some
 * other way (a middle click, Ctrl, Shift, Alt or Cmd) is left to the browser; anything else runs the command.
 *
 * @param event the click
 */
function press(event: MouseEvent): void {
  if (reason.value !== null) {
    event.preventDefault()

    return
  }
  if (cmd.value && !leftToBrowser(event)) {
    event.preventDefault()
    void run(cmd.value, props.from)
  }
}
</script>
