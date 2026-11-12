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
    <div class="settings-row">
      <Toggle id="notify-commands" v-model="notify" :aria-describedby="`${uid}-notify-help`">{{ t('settings.notify') }}</Toggle>
      <p :id="`${uid}-notify-help`" class="muted">{{ t('settings.notifyHelp') }}</p>
    </div>
    <h3 class="settings-group">{{ t('settings.logs.title') }}</h3>
    <p class="muted">{{ t('settings.logs.inert') }}</p>
    <div class="settings-row">
      <Toggle id="logs-auto-download" v-model="autoDownload" :aria-describedby="`${uid}-auto-help`">
        {{ t('settings.logs.autoDownload') }}
      </Toggle>
      <p :id="`${uid}-auto-help`" class="muted">{{ t('settings.logs.autoDownloadHelp') }}</p>
    </div>
    <div class="settings-row">
      <label :for="`${uid}-retention`">{{ t('settings.logs.retention') }}</label>
      <Select :id="`${uid}-retention`" v-model="retention" :options="retentionOptions" />
    </div>
    <div class="settings-row">
      <label :for="`${uid}-cap`">{{ t('settings.logs.sizeCap') }}</label>
      <Select :id="`${uid}-cap`" v-model="sizeCap" :options="capOptions" />
    </div>
    <p class="muted">{{ t('settings.more') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { LANGUAGES, LANGUAGE_NAMES, isLanguage } from '@/i18n/i18n'
import Select from '@/components/ui/Select.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useCommandNotice } from '@/composables/useCommandNotice'
import { useGroupsSetting } from '@/composables/useGroupsSetting'
import { RETENTION_DAYS, SIZE_CAPS_MB, useLogsSettings } from '@/composables/useLogsSettings'
import { sizeText } from '@/lib/logs/vehicleLogs'
import { useFormat } from '@/i18n/useFormat'

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
// "Show a notification when a command runs" (off by default): the same way.
const { shown: noticeShown, choose: chooseNotice } = useCommandNotice()
const notify = computed({
  get: () => noticeShown.value,
  set: (next: boolean) => void chooseNotice(next),
})
// The preferences about logs (kept; nothing acts on them until the backend downloads and removes logs).
const { number } = useFormat()
const logsSettings = useLogsSettings()
const autoDownload = computed({
  get: () => logsSettings.autoDownload.value,
  set: (next: boolean) => void logsSettings.chooseAutoDownload(next),
})
const retention = computed({
  get: () => logsSettings.retentionDays.value,
  set: (next: string) => void logsSettings.chooseRetention(next),
})
const sizeCap = computed({
  get: () => logsSettings.sizeCapMb.value,
  set: (next: string) => void logsSettings.chooseSizeCap(next),
})
const retentionOptions = computed(() => RETENTION_DAYS.map(value => ({ value, label: t('settings.logs.days', { days: value }) })))
const capOptions = computed(() => SIZE_CAPS_MB.map(value => ({ value, label: sizeText(Number(value) * 1_000_000, number) })))
// Each language is named in itself (Deutsch, not German): a person who cannot read the current language can still find theirs.
const options = LANGUAGES.map(code => ({ value: code, label: LANGUAGE_NAMES[code] }))
const language = computed<string>({
  get: () => locale.value,
  set: (next: string) => {
    if (isLanguage(next)) {
      void settings.setLanguage(next)
    }
  },
})
</script>
