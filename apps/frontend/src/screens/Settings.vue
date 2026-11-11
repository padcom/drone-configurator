<template>
  <section class="settings" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="settings-title">{{ t('settings.title') }}</h2>
    <div class="settings-row">
      <label :for="`${uid}-language`">{{ t('language.label') }}</label>
      <Select :id="`${uid}-language`" v-model="language" :options="options" :aria-describedby="`${uid}-help`" />
      <p :id="`${uid}-help`" class="muted">{{ t('settings.languageHelp') }}</p>
    </div>
    <div class="settings-row">
      <Toggle id="show-groups" v-model="groups" :aria-describedby="`${uid}-groups-help`">{{ t('settings.groups') }}</Toggle>
      <p :id="`${uid}-groups-help`" class="muted">{{ t('settings.groupsHelp') }}</p>
    </div>
    <p class="muted">{{ t('settings.more') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { LANGUAGES, isLanguage } from '@/i18n/i18n'
import Select from '@/components/ui/Select.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useGroupsSetting } from '@/composables/useGroupsSetting'

// What the user chooses about the application. For now that is the language of the interface, of which there is one; the
// choice is kept in the settings (the backend's file), which shows the interface in it, so it is still there at the next
// start. The settings notice (a file that was set aside, one that cannot be written) stays where it is, under the top bar,
// since it matters on every screen.
const { t, locale } = useI18n()
const { settings } = useConfigurator()
const uid = useId()
// "Show parameter groups": it shows at once, and goes back to what the settings hold when they could not keep it.
const { shown, choose } = useGroupsSetting()
const groups = computed({
  get: () => shown.value,
  set: (next: boolean) => void choose(next),
})
const options = LANGUAGES.map(code => ({ value: code, label: t(`language.${code}`) }))
const language = computed<string>({
  get: () => locale.value,
  set: (next: string) => {
    if (isLanguage(next)) {
      void settings.setLanguage(next)
    }
  },
})
</script>
