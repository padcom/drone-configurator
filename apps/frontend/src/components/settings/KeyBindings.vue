<template>
  <section class="settings-keys" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('keys.settings.title') }}</h3>
    <p class="muted">{{ t('keys.settings.intro') }}</p>
    <div v-for="key in rows" :key="key.actionId" class="settings-row keys-row">
      <span :id="`${uid}-${key.actionId}`">{{ t(actionMessage(key.actionId)) }}</span>
      <kbd>{{ chordText(now(key)) }}</kbd>
      <span class="muted">{{ t(scopeMessage(key.scope)) }}</span>
      <p v-if="key.fixed" class="muted">{{ t('keys.settings.fixed') }}</p>
      <template v-else>
        <Button :id="`keys-change-${key.actionId}`" :aria-describedby="`${uid}-${key.actionId}`" @click="start(key.actionId)">
          {{ t('keys.settings.change') }}
        </Button>
        <Button :id="`keys-reset-${key.actionId}`" :disabled="!changed(key.actionId)" @click="reset(key.actionId)">
          {{ t('keys.settings.reset') }}
        </Button>
      </template>
      <p v-if="waiting === key.actionId" :id="`keys-press-${key.actionId}`" role="status">
        {{ t('keys.settings.press', { action: t(actionMessage(key.actionId)) }) }}
      </p>
      <Banner v-if="refusal?.actionId === key.actionId" :id="`keys-refused-${key.actionId}`" tone="error" urgent>
        {{ t(`keys.settings.why.${refusal.why}`) }}
      </Banner>
      <Banner v-if="conflict?.actionId === key.actionId" :id="`keys-clash-${key.actionId}`" tone="warn" urgent>
        {{ t('keys.settings.clash', { chord: chordText(conflict.chord), actions: names(conflict.with) }) }}
        <Button :id="`keys-take-${key.actionId}`" @click="take">{{ t('keys.settings.take') }}</Button>
        <Button :id="`keys-keep-${key.actionId}`" @click="conflict = null">{{ t('keys.settings.keep') }}</Button>
      </Banner>
    </div>
    <Button id="keys-reset-all" :disabled="!anyChanged" @click="resetAll()">{{ t('keys.settings.resetAll') }}</Button>
  </section>
</template>

<script setup lang="ts">
// "Keyboard" in Settings: every key of the application with the screen it works on, a button to give an action another key
// (the next key pressed is the new one; Escape gives up), what stands in the way when it cannot be (a chord that is the
// system's, one that needs Ctrl, one that another action has: that one is named, and the user may take it over), and
// back to the defaults. The keys of the Parameters screen that are matched by the character they type are listed and not
// changed. While a key is being chosen no key does its command.
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import { useKeyBindings } from '@/composables/useKeyBindings'
import { type Chord, type Why, chordLabel, chordOf } from '@/lib/app/chords'
import { type Binding } from '@/lib/app/bindings'
import { actionMessage, scopeMessage } from '@/lib/app/keyGroups'
import { KEYS, isMac, setListening } from '@/lib/app/keymap'

/** A choice that another action's key stands in the way of. */
interface Conflict {
  actionId: string
  chord: Chord
  with: string[]
}

const { t } = useI18n()
const uid = useId()
const { keys, overrides, set, take: takeOver, reset, resetAll } = useKeyBindings()
const waiting = ref<string | null>(null)
const refusal = ref<{ actionId: string, why: Why | 'fixed' } | null>(null)
const conflict = ref<Conflict | null>(null)
// Every action there is, from the defaults: one that has no key now is still here, to be given one.
const rows: readonly Binding[] = KEYS
const anyChanged = computed(() => Object.keys(overrides.value).length > 0)

/**
 * The key an action has now.
 *
 * @param key the action's default
 * @returns its chord now, or null when it has none
 */
function now(key: Binding): Chord | null {
  return keys.value.find(one => one.actionId === key.actionId) ?? null
}

/**
 * How a key is written.
 *
 * @param chord the key, or the chord (null: no key)
 * @returns its label, or the words for no key
 */
function chordText(chord: Chord | null): string {
  return chord === null ? t('keys.settings.none') : chordLabel(chord, isMac())
}

/**
 * Whether an action has a key other than its default.
 *
 * @param actionId the action
 * @returns true when the user chose one
 */
function changed(actionId: string): boolean {
  return actionId in overrides.value
}

/**
 * The names of actions, for a sentence.
 *
 * @param actionIds the actions
 * @returns their names, joined
 */
function names(actionIds: string[]): string {
  return actionIds.map(id => t(actionMessage(id))).join(', ')
}

/**
 * Gives the action the chord, and shows what stands in the way.
 *
 * @param actionId the action
 * @param chord the chord
 */
async function choose(actionId: string, chord: Chord): Promise<void> {
  const result = await set(actionId, chord)

  refusal.value = result.status === 'refused' ? { actionId, why: result.why } : null
  conflict.value = result.status === 'clash' ? { actionId, chord, with: result.with } : null
}

/**
 * Reads the next key press as the chord of the action that is waiting.
 *
 * @param event the key press
 */
function read(event: KeyboardEvent): void {
  const chord = chordOf(event, isMac())
  const actionId = waiting.value

  event.preventDefault()
  event.stopPropagation()

  if (event.code === 'Escape') {
    waiting.value = null
  } else if (chord !== null && actionId !== null) {
    waiting.value = null
    void choose(actionId, chord)
  }
}

// While an action waits for its key the window is listened to (before the keymap is), and no key does its command.
watch(waiting, action => {
  setListening(action !== null)
  window.removeEventListener('keydown', read, true)

  if (action !== null) {
    window.addEventListener('keydown', read, true)
  }
}, { flush: 'sync' })

/**
 * Starts reading the key for an action.
 *
 * @param actionId the action
 */
function start(actionId: string): void {
  refusal.value = null
  conflict.value = null
  waiting.value = actionId
}

/** Gives the chord to the action and takes it from the others. */
async function take(): Promise<void> {
  const pending = conflict.value

  conflict.value = null

  if (pending !== null) {
    await takeOver(pending.actionId, pending.chord)
  }
}

onBeforeUnmount(() => {
  waiting.value = null
})
</script>
