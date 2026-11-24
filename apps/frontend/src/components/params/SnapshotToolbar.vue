<template>
  <!-- The buttons of the toolbar are commands: what they say, whether they may be pressed (and why not), and what a press does
       are the command's own (lib/commands/snapshots.ts, metadata.ts), the same as in the palette. -->
  <CommandButton id="save" command="snapshot.save" icon-position="left" />
  <!-- Saving as a plain-text parameter file (ArduPilot's .param, MAVProxy's .parm, QGroundControl's .params) is in the palette
       (paramFile.save.*): a fourth button would wrap the toolbar onto a second line at 1280 px. -->
  <CommandButton id="load-button" command="snapshot.load" icon-position="left" />
  <CommandButton id="metadata-button" command="metadata.load" icon-position="left" />
</template>

<script setup lang="ts">
import CommandButton from '@/components/ui/CommandButton.vue'
</script>
