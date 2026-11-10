<template>
  <section class="settings" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="settings-title">{{ t('settings.title') }}</h2>
    <div class="settings-row">
      <label :for="`${uid}-language`">{{ t('language.label') }}</label>
      <Select :id="`${uid}-language`" v-model="language" :options="options" :aria-describedby="`${uid}-help`" />
      <p :id="`${uid}-help`" class="muted">{{ t('settings.languageHelp') }}</p>
    </div>
    <p class="muted">{{ t('settings.more') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Language, LANGUAGES, isLanguage, setLanguage } from '../i18n'
import Select from '../kit/Select.vue'

// What the user chooses about the application. For now that is the language of the interface, of which there is one; the
// settings notice (a file that was set aside, one that cannot be written) stays where it is, under the top bar, since it
// matters on every screen.
const { t, locale } = useI18n()
const uid = useId()
const options = LANGUAGES.map(code => ({ value: code, label: t(`language.${code}`) }))
const language = computed<string>({
  get: () => locale.value,
  set: (next: string) => {
    if (isLanguage(next)) {
      setLanguage(next as Language)
    }
  },
})
</script>
