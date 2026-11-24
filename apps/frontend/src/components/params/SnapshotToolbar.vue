<template>
  <!-- The buttons of the toolbar are commands: what they say, whether they may be pressed (and why not), and what a press does
       are the command's own (lib/commands/snapshots.ts, metadata.ts), the same as in the palette. -->
  <!-- Icons alone (the words are their names and tooltips), so that the toolbar stays one row at 1000 px. Saving as a plain-text
       parameter file (ArduPilot's .param, MAVProxy's .parm, QGroundControl's .params) is in the palette (paramFile.save.*). -->
  <CommandButton id="save" command="snapshot.save" icon-position="left" icon-only />
  <CommandButton id="load-button" command="snapshot.load" icon-position="left" icon-only />
  <CommandButton id="metadata-button" command="metadata.load" icon-position="left" icon-only />
</template>

<script setup lang="ts">
import CommandButton from '@/components/ui/CommandButton.vue'
</script>
