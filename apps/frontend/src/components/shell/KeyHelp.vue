<template>
  <Dialog v-if="help.open.value" :title="t('keys.help.title')" @close="help.hide()">
    <p class="keys-intro">{{ t('keys.help.intro') }}</p>
    <section v-for="group in groups" :key="group.scope" class="keys-group" :aria-labelledby="`${uid}-${group.scope}`">
      <h3 :id="`${uid}-${group.scope}`" class="settings-group">{{ t(scopeMessage(group.scope)) }}</h3>
      <dl class="keys-list">
        <template v-for="key in group.keys" :key="key.actionId">
          <dt>{{ t(actionMessage(key.actionId)) }}</dt>
          <dd><kbd>{{ chordLabel(key, mac) }}</kbd></dd>
        </template>
      </dl>
    </section>
    <p class="keys-intro">{{ t('keys.help.settings') }}</p>
    <template #actions>
      <Button id="keys-close" variant="primary" data-initial-focus @click="help.hide()">{{ t('keys.help.close') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The help of the keys: every key as the user has it now (the defaults with what was chosen in Settings), by screen, and the
// words for what each does. Opened by `help.keys` (F1 by default), so it is in the palette too.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import { useKeyBindings } from '@/composables/useKeyBindings'
import { useKeyHelp } from '@/composables/useKeyHelp'
import { chordLabel } from '@/lib/app/chords'
import { actionMessage, groupKeys, scopeMessage } from '@/lib/app/keyGroups'
import { isMac } from '@/lib/app/keymap'

const { t } = useI18n()
const help = useKeyHelp()
const { keys } = useKeyBindings()
const uid = useId()
const mac = isMac()
const groups = computed(() => groupKeys(keys.value))
</script>
