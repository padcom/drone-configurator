<template>
  <section class="tune" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="visually-hidden">{{ t('screen.tune') }}</h2>
    <!-- While the vehicle is armed this stays (tuning is done in flight, and what is written applies at once). The arming and
         the disarming are announced once, politely, by the status below. -->
    <Banner v-if="armed" id="tune-armed" tone="warn">{{ t('tune.armed') }}</Banner>
    <p id="tune-armed-status" class="visually-hidden" role="status">{{ announcement }}</p>
    <SectionNav :label="t('tune.sections')" :sections="tabs" />
    <!-- Which part was chosen, said politely (a screen reader hears no change when only the part under the tabs is another). -->
    <p class="visually-hidden" role="status">{{ shown }}</p>
    <RouterView v-slot="{ Component, route }">
      <KeepAlive>
        <component :is="Component" :key="String(route.name)" />
      </KeepAlive>
    </RouterView>
  </section>
</template>

<script setup lang="ts">
// The Tune screen: the tabs of its parts (the registry's list), the part that the address names, and, while the vehicle is ARMED,
// a banner that says changes apply in flight (the leader's decision Q7: tuning is the one place where a write goes to an armed
// vehicle, after a hold).
// Arming and disarming are announced once each, politely, so that a person who is not looking at the banner hears it.
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import SectionNav from '@/components/ui/SectionNav.vue'
import Banner from '@/components/ui/Banner.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { armedOf } from '@/lib/app/armed'
import { SCREENS, sectionRouteName } from '@/screens/registry'

const { t } = useI18n()
const uid = useId()
const route = useRoute()
const handle = useConfigurator()
const SCREEN = 'tune'
const sections = SCREENS.find(screen => screen.id === SCREEN)?.sections ?? []
const tabs = computed(() => sections.map(section => ({
  id: section.id,
  to: { name: sectionRouteName(SCREEN, section.id) },
  label: t(section.titleKey),
})))

/** Whether the vehicle is known to be armed (a state that is not known is not said to be armed: the panels say so). */
const armed = computed(() => armedOf(handle.fields.telemetry.value) === true)

/** Said when the vehicle arms or disarms, and nothing before the first change: empty until then (a change, not an insertion). */
const announcement = ref('')
watch(armed, now => {
  announcement.value = t(now ? 'tune.armedAnnounce' : 'tune.disarmedAnnounce')
})

const titleKey = ref('')
watch(() => route.meta, meta => {
  if (meta.screen === SCREEN && typeof meta.titleKey === 'string') {
    titleKey.value = meta.titleKey
  }
}, { immediate: true })
const shown = computed(() => titleKey.value === '' ? '' : t('tune.shown', { section: t(titleKey.value) }))
</script>
