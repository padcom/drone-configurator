<template>
  <section class="tune-page" :aria-labelledby="`${uid}-title`">
    <PageSplit class="tune-split">
      <!-- The main column: what is tuned scrolls; "Put back initial values" is fixed below it, in view. -->
      <Pane tag="div" class="tune-main">
        <div class="setup-main">
          <h3 :id="`${uid}-title`" class="visually-hidden">{{ title }}</h3>
          <slot />
        </div>
        <template #bottom>
          <div class="tune-main-bottom">
            <Button
              :id="`${idPrefix}-initial`"
              :disabled="!tune.movable.value || tune.panel.writing.value"
              @click="tune.backToInitial()"
            >
              {{ t('tune.backToInitial') }}
            </Button>
          </div>
        </template>
      </Pane>
      <!-- The aside: why nothing can be written at the top, how the last write went in the body, and what it writes (the changed
           values, as the Parameters page lists them) with the Write button fixed at the bottom. -->
      <Pane tag="aside" class="tune-aside" :aria-label="t('setup.aside')">
        <template v-if="write.reason.value" #top>
          <Banner :id="`${idPrefix}-blocked`" tone="warn">{{ write.reason.value }}</Banner>
        </template>
        <p :id="`${idPrefix}-status`" class="setup-status" role="status">{{ write.status.value }}</p>
        <!-- A write that stopped says which parameters were read back, which were not confirmed, and which were not
             written. -->
        <ul v-if="write.outcome.value.length > 0" :id="`${idPrefix}-outcome`" class="setup-outcome">
          <li v-for="line in write.outcome.value" :key="line">{{ line }}</li>
        </ul>
        <template #bottom>
          <TuneWrites
            :panel="tune.panel"
            :id-prefix="idPrefix"
            :hold="tune.refused.value"
            :refused-ids="tune.refusedIds.value"
          />
        </template>
      </Pane>
    </PageSplit>
  </section>
</template>

<script setup lang="ts">
// The layout of a part of the Tune screen (the rate loop, the other groups, the filters), from the page layout of
// components/ui/Pane.vue: the main column scrolls with "Put back initial values" fixed under it, and the aside has what blocks a
// write at its top, how the last write went in its body, and what it writes, with the Write button, fixed at its bottom. The
// part gives its own content (the default slot) and its heading (the section's name for a screen reader).
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import TuneWrites from '@/components/tune/TuneWrites.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import PageSplit from '@/components/ui/PageSplit.vue'
import Pane from '@/components/ui/Pane.vue'
import { usePanelWrite } from '@/composables/usePanelWrite'
import type { TunePanel } from '@/composables/useTunePanel'

const props = defineProps<{
  /** The part's tuning panel (what its page got from `useTunePanel`). */
  tune: TunePanel
  /** The section's name: a heading for a screen reader only (the tabs say where the page is). */
  title: string
  /** A prefix for the ids of the parts (`tune-rate`), so that a page's own checks can find them. */
  idPrefix: string
}>()

const { t } = useI18n()
const uid = useId()
const write = usePanelWrite(() => props.tune.panel, () => props.tune.refused.value)
</script>
