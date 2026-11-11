<template>
  <section
    class="messages"
    :aria-labelledby="`${uid}-heading`"
    @pointerenter="messages.markRead()"
    @focusin="messages.markRead()"
  >
    <SectionLabel :id="`${uid}-heading`">
      {{ t('messages.heading') }}
      <span v-if="messages.unread.value > 0" class="unread">{{ t('messages.unread', { count: messages.unread.value }) }}</span>
    </SectionLabel>
    <ul v-if="shown.length > 0" class="message-list" tabindex="0" :aria-label="t('messages.list')">
      <li v-for="message in shown" :key="message.id" class="message" :class="{ warning: isWarning(message) }">
        <time class="time" :datetime="sentAt(message).toISOString()">{{ format.time(sentAt(message)) }}</time>
        <span v-if="isWarning(message)" class="sev" :class="`sev-${severityName(message.severity)}`">
          <Icon :name="message.severity <= 3 ? 'close' : 'warning'" />
          {{ t(`messages.severity.${severityName(message.severity)}`) }}
        </span>
        <span class="text">{{ message.text }}</span>
      </li>
    </ul>
    <p v-else class="muted empty">{{ t('messages.none') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import { isWarning, sentAt, severityName } from '@/lib/fly/messages'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'

// What the vehicle has said (its STATUSTEXT), newest first, each with its time. A warning or worse also says so in a word
// and a mark, so the severity is never colour alone. The count on the heading is how many warnings came since the list was
// last looked at: putting the pointer or the focus on the list counts as looking. Opening the screen does not: the list is
// below the display and the cards, and the count is what says there is something to scroll to.
const { t } = useI18n()
const format = useFormat()
const { messages } = useConfigurator()
const uid = useId()
const shown = computed(() => [...messages.list.value].reverse())
</script>
