<template>
  <!-- The buttons of the toolbar are commands: what they say, whether they may be pressed (and why not), and what a press does
       are the command's own (lib/commands/snapshots.ts, compare.ts, metadata.ts), the same as in the palette. -->
  <!-- Saving and loading a snapshot, and comparing the parameters with a file or a snapshot, or with the firmware's defaults
       (#40), under one button, so that the toolbar stays one row at 1000 px. Saving as a plain-text parameter file (ArduPilot's
       .param, MAVProxy's .parm, QGroundControl's .params) is in the palette (paramFile.save.*). -->
  <DropPanel id="param-files" icon="file" :label="t('params.files.label')" :title="t('params.files.title')">
    <CommandButton id="save" command="snapshot.save" icon-position="left" />
    <CommandButton id="load-button" command="snapshot.load" icon-position="left" />
    <CommandButton id="compare-file" command="params.compare.file" icon-position="left" />
    <CommandButton id="compare-defaults" command="params.compare.defaults" icon-position="left" />
  </DropPanel>
  <!-- The icon alone (the words are its name and tooltip). -->
  <CommandButton id="metadata-button" command="metadata.load" icon-position="left" icon-only />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import DropPanel from '@/components/ui/DropPanel.vue'

const { t } = useI18n()
</script>
