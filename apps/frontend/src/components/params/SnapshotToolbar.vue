<template>
  <!-- The buttons of the toolbar are commands: what they say, whether they may be pressed (and why not), and what a press does
       are the command's own (lib/commands/snapshots.ts, metadata.ts), the same as in the palette. -->
  <CommandButton id="save" command="snapshot.save" icon-position="left" />
  <!-- ArduPilot's own NAME,VALUE file; the MAVProxy and QGroundControl formats are in the palette (paramFile.save.*). -->
  <CommandButton id="save-param" command="paramFile.save.param" icon-position="left" />
  <CommandButton id="load-button" command="snapshot.load" icon-position="left" />
  <!-- Compare the parameters with a file or a snapshot, or with the firmware's defaults (#40). -->
  <CommandButton id="compare-file" command="params.compare.file" icon-position="left" />
  <CommandButton id="compare-defaults" command="params.compare.defaults" icon-position="left" />
  <CommandButton id="metadata-button" command="metadata.load" icon-position="left" />
</template>

<script setup lang="ts">
import CommandButton from '@/components/ui/CommandButton.vue'
</script>
