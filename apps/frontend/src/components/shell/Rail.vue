<template>
  <nav class="rail" tabindex="-1" :aria-label="t('shell.navigation')">
    <div class="rail-main">
      <CommandButton v-for="id in RAIL_COMMANDS.main" :key="id" :command="id" look="rail" />
      <!-- A screen that has no command (the development gallery) is a plain link. -->
      <RouterLink v-for="screen in others" :key="screen.id" :to="screen.path" class="rail-item">
        <span class="rail-icon"><Icon :name="screen.icon" /></span>
        <span class="rail-label">{{ t(screen.titleKey) }}</span>
      </RouterLink>
    </div>
    <div class="rail-end">
      <CommandButton v-for="id in RAIL_COMMANDS.end" :key="id" :command="id" look="rail" />
    </div>
  </nav>
</template>

<script setup lang="ts">
// The rail: a button for each command of its table (lib/app/railCommands.ts, one list of command ids), an icon over its name, the
// one that is shown marked (by colour and by the plain `aria-current`), and Settings apart at the bottom. Each is a real link, so
// a keyboard reaches them in order, a screen reader says which screen is the current one and a middle click opens it; a normal
// click runs the command (CommandButton). Below 1000 px wide it lies down on top as a row (frame.css).
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import Icon from '@/components/ui/Icon.vue'
import { RAIL_COMMANDS } from '@/lib/app/railCommands'
import { SCREENS } from '@/screens/registry'

const { t } = useI18n()
const named = new Set([...RAIL_COMMANDS.main, ...RAIL_COMMANDS.end])
// The screens that the table does not name, whose "Switch to" command is none: drawn as they always were.
const others = SCREENS.filter(screen => !named.has(`go.${screen.id}`))
</script>
