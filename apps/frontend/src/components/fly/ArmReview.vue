<template>
  <Dialog v-if="review.open.value" :title="t('review.title')" @close="review.hide()">
    <p id="review-state" role="status">{{ t(`review.checks.${checks}`) }}</p>
    <p v-if="review.running.value" id="review-running" class="muted">{{ t('review.running') }}</p>
    <Banner v-if="review.error.value" id="review-error" tone="error">
      {{ t('review.error', { error: review.error.value }) }}
    </Banner>
    <h3 class="review-heading">{{ t('review.heard') }}</h3>
    <ul v-if="reasons.length > 0" id="review-reasons" class="review-reasons">
      <li v-for="reason in reasons" :key="reason.text">
        <span class="review-text">{{ reason.text }}</span>
        <span class="muted">{{ t('review.ago', { seconds: Math.round(reason.ageMs / 1000) }) }}</span>
      </li>
    </ul>
    <p v-else id="review-none" class="muted">{{ t('review.none') }}</p>
    <p class="muted">{{ t('review.note') }}</p>
    <template #actions>
      <Button id="review-close" data-initial-focus @click="review.hide()">{{ t('review.notNow') }}</Button>
      <Button id="review-again" :disabled="review.running.value" @click="review.run()">{{ t('review.again') }}</Button>
      <Button id="review-arm" variant="primary" :disabled="!armable" @click="arm">{{ t('review.arm') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The review before arming: what the vehicle says of its pre-arm checks (its SYS_STATUS bit) and, in its own words, why they
// do not pass (the "PreArm: ..." texts it sent in the last two minutes: the vehicle does not repeat a text it has just printed,
// so the answer to an arm may carry none, and the review shows what it said, whenever). Opening it asks the vehicle to run its
// checks. "Arm…" closes the review and runs the arm command, which asks for the hold; nothing here arms. There is no forced arm.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import { useArmReview } from '@/composables/useArmReview'
import { useCommandContext, useCommands } from '@/composables/useCommands'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useConfigurator } from '@/composables/useConfigurator'
import { checksOf, reasonsOf } from '@/lib/fly/prearm'

const { t } = useI18n()
const review = useArmReview()
const { fields, messages } = useConfigurator()
const registry = useCommands()
const ctx = useCommandContext()
const run = useCommandRunner()
// "How long ago" is kept true while the review is open.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

watch(review.open, open => {
  clearInterval(timer)

  if (open) {
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
})
onBeforeUnmount(() => clearInterval(timer))

const checks = computed(() => checksOf(fields.telemetry.value))
const reasons = computed(() => reasonsOf(messages.list.value, now.value))
/** Whether the arm may be asked for now (it is the command's say, read again as the vehicle changes). */
const armable = computed(() => registry.availability('vehicle.arm', ctx)?.enabled === true)

/** Closes the review and asks for the arm, which asks for the hold. */
function arm(): void {
  review.hide()
  void run('vehicle.arm')
}
</script>
