---
search: false
---

# Bausteine heissen jetzt Baugruppen

Diese Seite ist umgezogen, nach [Baugruppen](/designer/baugruppen). Der Browser sollte dich gleich dorthin bringen.

<script setup>
// The old address, linked from outside (the forum post): kept as a pointer
// with its #anchor carried along (docs/2026-11-05-quick-blocks.md, decision 2).
import { onMounted } from "vue"
import { withBase } from "vitepress"
onMounted(() => {
  window.location.replace(withBase("/designer/baugruppen") + window.location.hash)
})
</script>
