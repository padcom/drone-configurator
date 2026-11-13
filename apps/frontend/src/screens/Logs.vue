<template>
  <section class="logs" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="visually-hidden">{{ t('screen.logs') }}</h2>
    <SectionNav :label="t('logs.sections')" :sections="tabs" />
    <!-- Which part was chosen, said politely (a screen reader hears no change when only the part under the tabs is another). -->
    <p class="visually-hidden" role="status">{{ shown }}</p>
    <!-- The part that is shown stays alive when another is: what is selected in it is there when the tab is chosen again. -->
    <RouterView v-slot="{ Component, route }">
      <KeepAlive>
        <component :is="Component" :key="String(route.name)" />
      </KeepAlive>
    </RouterView>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import SectionNav from '@/components/ui/SectionNav.vue'
import { SCREENS, sectionRouteName } from '@/screens/registry'

// The Logs screen: a title, the tabs of its parts (the registry's list, so a part is added in one place), and the part that the
// address names. Each part is a screen of its own in the registry's sense (a nested route), loaded when it is first shown.
const { t } = useI18n()
const uid = useId()
const route = useRoute()
const SCREEN = 'logs'
const sections = SCREENS.find(screen => screen.id === SCREEN)?.sections ?? []
const tabs = computed(() => sections.map(section => ({
  id: section.id,
  to: { name: sectionRouteName(SCREEN, section.id) },
  label: t(section.titleKey),
})))

// The title of the part that is shown, "Logs: On the vehicle". It follows the route only while this screen is the one shown (the
// screen is kept alive when another is, and the route is then another screen's).
const titleKey = ref('')
watch(() => route.meta, meta => {
  if (meta.screen === SCREEN && typeof meta.titleKey === 'string') {
    titleKey.value = meta.titleKey
  }
}, { immediate: true })
const shown = computed(() => titleKey.value === '' ? '' : t('logs.shown', { section: t(titleKey.value) }))
</script>
