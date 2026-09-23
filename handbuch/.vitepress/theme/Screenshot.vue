<script setup lang="ts">
// A picture of the designer, taken by e2e/handbook-screenshots.spec.ts
// (npm run screenshots). The pictures are not committed - the Pages workflow
// takes them fresh for every publish - so the path is built at runtime rather
// than imported: a local build without them still builds, and shows the
// caption where the picture would be.
import { withBase } from "vitepress"

// narrow: a dialog or a crop, shown at its own modest size rather than
// stretched across the column.
const props = defineProps<{ name: string; alt: string; caption?: string; narrow?: boolean }>()
const src = withBase(`/bilder/${props.name}.png`)
</script>

<template>
  <figure class="schaltli-screenshot" :class="{ narrow }">
    <a :href="src" target="_blank" rel="noreferrer">
      <img class="screenshot" :src="src" :alt="alt" loading="lazy" />
    </a>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>
