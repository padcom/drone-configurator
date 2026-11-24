<template>
  <RouterLink
    v-if="connected"
    id="link-signing"
    class="link-signing"
    :class="look.tone"
    :data-state="status.state"
    :to="{ name: sectionRouteName('setup', 'signing') }"
    :aria-label="t('topBar.signing.open', { state: word })"
  >
    <Icon :name="look.icon" />
    <span class="link-signing-word">{{ word }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
// Whether the link is signed (#33), in the LINK cell of the top bar: an icon and a word, never colour alone. "Signed" with a
// closed lock; "Unsigned" with an open one; "Not signed" with a warning when a key is held that the vehicle does not answer
// with, or the vehicle signs with a key this computer does not have. It is the way to the Signing page. Nothing without a
// connected vehicle.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { signingLook } from '@/lib/setup/signing'
import { sectionRouteName } from '@/screens/registry'

const { t } = useI18n()
const { signing, fields } = useConfigurator()
const status = computed(() => signing.status.value)
const connected = computed(() => fields.connection.value.state === 'connected')
const look = computed(() => signingLook(status.value.state))
const word = computed(() => t(look.value.wordKey))
</script>
