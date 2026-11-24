<template>
  <section class="setup-page-body single" :aria-labelledby="`${uid}-title`">
    <div class="setup-main setup-signing">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.signing') }}</h3>
      <p class="muted">{{ t('setup.signing.summary') }}</p>
      <div id="signing-state" class="signing-state" :class="look.tone" :data-state="status.state" role="status">
        <p class="signing-title">
          <Icon :name="look.icon" />
          <strong>{{ t(look.titleKey) }}</strong>
        </p>
        <p class="signing-note">{{ t(look.noteKey) }}</p>
        <dl v-if="status.fingerprint" class="setup-facts-list">
          <dt>{{ t('setup.signing.fingerprint') }}</dt>
          <dd id="signing-fingerprint" class="mono">{{ status.fingerprint }}</dd>
          <template v-if="setAt">
            <dt>{{ t('setup.signing.setAt') }}</dt>
            <dd id="signing-set-at">{{ setAt }}</dd>
          </template>
        </dl>
      </div>
      <Banner v-if="blocked" id="signing-blocked" tone="info">{{ t(blocked) }}</Banner>
      <Banner v-if="failure" id="signing-error" tone="error">{{ t(failure) }}</Banner>
      <form id="signing-form" class="signing-form" @submit.prevent="turnOn">
        <h4 class="setup-label">{{ t(signed ? 'setup.signing.changeHeading' : 'setup.signing.newHeading') }}</h4>
        <SegmentedControl v-model="source" :label="t('setup.signing.source')" :options="sources" :disabled="blocked !== null" />
        <template v-if="source === 'passphrase'">
          <label :for="`${uid}-phrase`">{{ t('setup.signing.passphrase') }}</label>
          <TextInput
            :id="`${uid}-phrase`"
            v-model="phrase"
            type="password"
            autocomplete="new-password"
            :invalid="phraseProblem === 'long'"
            :disabled="blocked !== null"
            :aria-describedby="`${uid}-phrase-hint`"
          />
          <p :id="`${uid}-phrase-hint`" class="muted">{{ t(`setup.signing.phraseHint.${phraseProblem ?? 'ok'}`) }}</p>
        </template>
        <p v-else class="muted">{{ t('setup.signing.randomHint') }}</p>
        <Banner id="signing-loss" tone="warn">{{ t('setup.signing.loss') }}</Banner>
        <div class="signing-actions">
          <Button id="signing-on" variant="primary" type="submit" :disabled="!canTurnOn">
            {{ t(signed ? 'setup.signing.replace' : 'setup.signing.turnOn') }}
          </Button>
          <Button v-if="status.state !== 'off'" id="signing-off" :disabled="blocked !== null" @click="turnOff">
            {{ t('setup.signing.turnOff') }}
          </Button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
// MAVLink signing (#33): whether the link to this vehicle is signed, with the key's fingerprint and when it was set (never the
// key: the backend makes it and keeps it), and the actions. A key is made at random, or from a passphrase (as other ground
// stations make them, so that they can be given the same one); before it is sent the user is told that losing it means
// resetting the vehicle over USB, and confirms (SafetyConfirm, naming the vehicle). Signing is turned off the same way. Nothing
// is changed while the vehicle is armed or its state is not known, and the backend refuses it too. The passphrase is cleared
// once it has been sent.
import { computed, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useArmGrace } from '@/composables/useArmGrace'
import { useConfigurator } from '@/composables/useConfigurator'
import type { SigningOutcome } from '@/composables/useSigning'
import { useFormat } from '@/i18n/useFormat'
import { passphraseProblem, signingBlocked, signingErrorKey, signingLook } from '@/lib/setup/signing'

const { t } = useI18n()
const uid = useId()
const format = useFormat()
const handle = useConfigurator()
const { signing } = handle
const { armed } = useArmGrace()
const status = computed(() => signing.status.value)
const look = computed(() => signingLook(status.value.state))
const signed = computed(() => status.value.state === 'signed')
const setAt = computed(() => (status.value.setAt === undefined ? '' : format.dateTime(new Date(Number(status.value.setAt)))))
const connected = computed(() => handle.fields.connection.value.state === 'connected')
const blocked = computed(() => signingBlocked(connected.value, armed.value, signing.busy.value))
const source = shallowRef<'random' | 'passphrase'>('random')
const sources = computed(() => [
  { value: 'random', label: t('setup.signing.random') },
  { value: 'passphrase', label: t('setup.signing.fromPassphrase') },
])
const phrase = shallowRef('')
const phraseProblem = computed(() => passphraseProblem(phrase.value))
const canTurnOn = computed(() => blocked.value === null && (source.value === 'random' || phraseProblem.value === null))
/** The message of the last refusal, or null. */
const failure = shallowRef<string | null>(null)
/** The vehicle as the status bar names it. */
const vehicle = computed(() => {
  const info = handle.fields.connection.value.vehicle

  return info ? t('topBar.vehicleValue', { ...info }) : ''
})

/**
 * Asks the user to confirm a change, naming the vehicle.
 *
 * @param what what will happen
 * @param label the words on the confirm button
 * @returns whether the user confirmed
 */
function confirm(what: string, label: string): Promise<boolean> {
  const title = t('setup.signing.confirmTitle')

  return handle.confirmWith({ title, what, vehicle: vehicle.value, level: 'plain', confirmLabel: label })
}

/**
 * Shows what a change came to.
 *
 * @param outcome the change's outcome
 */
function show(outcome: SigningOutcome): void {
  failure.value = outcome.ok ? null : signingErrorKey(outcome.code)
}

/**
 * What the confirmation of a new key says: where the key comes from, and what losing it means.
 *
 * @returns the words
 */
function onWhat(): string {
  const what = t(source.value === 'random' ? 'setup.signing.confirmRandom' : 'setup.signing.confirmPassphrase')

  return `${what} ${t('setup.signing.loss')}`
}

/** Sets a key on the vehicle, once the user has read what losing it means and confirmed. */
async function turnOn(): Promise<void> {
  if (!canTurnOn.value || !await confirm(onWhat(), t('setup.signing.confirmOn'))) {
    return
  }
  const passphrase = source.value === 'passphrase' ? phrase.value : undefined
  phrase.value = ''
  show(await signing.provision(passphrase))
}

/** Turns the vehicle's signing off, once the user has confirmed. */
async function turnOff(): Promise<void> {
  if (await confirm(t('setup.signing.confirmOffWhat'), t('setup.signing.confirmOff'))) {
    show(await signing.disable())
  }
}
</script>
