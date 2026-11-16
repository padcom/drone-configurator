<template>
  <section
    ref="root"
    class="messages"
    tabindex="-1"
    :aria-labelledby="`${uid}-heading`"
    @pointerenter="messages.markRead()"
    @focusin="messages.markRead()"
  >
    <div class="messages-head">
      <SectionLabel :id="`${uid}-heading`">
        {{ t('messages.heading') }}
        <span v-if="messages.unread.value > 0" class="unread">{{ t('messages.unread', { count: messages.unread.value }) }}</span>
      </SectionLabel>
      <Button v-if="shown.length > 0" class="messages-clear" @click="clear">{{ t('messages.clear') }}</Button>
    </div>
    <ul
      v-if="shown.length > 0"
      class="message-list"
      role="log"
      aria-live="off"
      tabindex="0"
      :aria-label="t('messages.list')"
    >
      <li v-for="message in shown" :key="message.id" class="message" :class="{ warning: isWarning(message) }">
        <time class="time" :datetime="sentAt(message).toISOString()">{{ format.time(sentAt(message)) }}</time>
        <span class="sev" :class="`sev-${severityName(message.severity)}`">
          <Icon :name="markOf(message.severity)" />
          {{ t(`messages.severity.${severityName(message.severity)}`) }}
        </span>
        <span class="text">{{ message.text }}</span>
      </li>
    </ul>
    <!-- Always in the page, empty while there are messages: what a screen reader reads is a change of its text (after Clear). -->
    <p class="muted empty" role="status">{{ none }}</p>
    <p class="muted messages-note">{{ t('messages.kept', { kept: KEPT, replayed: REPLAYED }) }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import { KEPT, REPLAYED } from '@/composables/useMessages'
import { isWarning, markOf, sentAt, severityName } from '@/lib/fly/messages'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'

// Everything the vehicle has said (its STATUSTEXT), newest first, each with its time and its severity in a word and a mark, so
// that the severity is never colour alone; nothing is left out (the PreArm texts and the repeats are all here), and only the
// warnings and worse also make a toast. The list is a log that is not read out as it grows (`aria-live="off"`: every PreArm text
// and the replay of 200 messages on connecting would be, and a warning is told by its toast and the banner already) and keeps the
// last 500 messages; Clear empties it and puts the focus on the section. The count on the heading is how many warnings came
// since the list was last looked at: putting the pointer or the focus on the list counts as looking. Opening the screen does
// not: the list is below the display and the cards, and the count is what says there is something to scroll to.
const { t } = useI18n()
const format = useFormat()
const { messages } = useConfigurator()
const uid = useId()
const shown = computed(() => [...messages.list.value].reverse())
const none = computed(() => (shown.value.length === 0 ? t('messages.none') : ''))
const root = ref<HTMLElement | null>(null)

/**
 * Empties the list. The Clear button goes with the messages, so the focus is put on the section first: it would fall to the page.
 */
function clear(): void {
  root.value?.focus()
  messages.clear()
}
</script>
