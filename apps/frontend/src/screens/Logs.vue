<template>
  <section class="logs" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="logs-title">{{ t('screen.logs') }}</h2>
    <SectionNav :label="t('logs.sections')" :sections="tabs" />
    <!-- The part that is shown stays alive when another is: what is selected in it is there when the tab is chosen again. -->
    <RouterView v-slot="{ Component, route }">
      <KeepAlive>
        <component :is="Component" :key="String(route.name)" />
      </KeepAlive>
    </RouterView>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import SectionNav from '@/components/ui/SectionNav.vue'
import { SCREENS, sectionRouteName } from '@/screens/registry'

// The Logs screen: a title, the tabs of its parts (the registry's list, so a part is added in one place), and the part that the
// address names. Each part is a screen of its own in the registry's sense (a nested route), loaded when it is first shown.
const { t } = useI18n()
const uid = useId()
const SCREEN = 'logs'
const sections = SCREENS.find(screen => screen.id === SCREEN)?.sections ?? []
const tabs = computed(() => sections.map(section => ({
  id: section.id,
  to: { name: sectionRouteName(SCREEN, section.id) },
  label: t(section.titleKey),
})))
</script>
