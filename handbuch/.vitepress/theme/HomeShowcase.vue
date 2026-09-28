<script setup lang="ts">
// The homepage's picture: three boards with the same small van on them, the
// values moving on - tanks going down, the heating warming up, the light going
// off and on. Each board is a stack of pictures the designer rendered
// (e2e/handbook-screenshots.spec.ts, "the homepage showcase"), switched one to
// the next; nothing here draws a control itself.
//
// Like every picture of the designer they are made fresh for each publish and
// not committed, so a local build without them shows the Schaltli mark
// instead of three empty frames.
import { onBeforeUnmount, onMounted, ref } from "vue"
import { withBase } from "vitepress"

const STEPS = 6
const boards = ["papers3", "4v3b", "knob"] as const
const src = (board: string, step: number) => withBase(`/bilder/start-${board}-${step + 1}.webp`)

const step = ref(0)
const ready = ref(false)
const missing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  // The first picture decides: there or not, before anything is shown.
  const probe = new Image()
  probe.onload = () => {
    ready.value = true
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    timer = setInterval(() => (step.value = (step.value + 1) % STEPS), 2600)
  }
  probe.onerror = () => (missing.value = true)
  probe.src = src("4v3b", 0)
})
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <img v-if="missing" class="schaltli-showcase-fallback" :src="withBase('/brand/mark.svg')" alt="Das Schaltli-Zeichen, eine Pille mit Kugel" />
  <div
    v-else
    class="schaltli-showcase"
    :class="{ ready }"
    role="img"
    aria-label="Drei Geräte mit Schaltli-Screens: ein 4,3-Zoll-Touchscreen mit Tanks, Batterie, Dimmer und Heizung, ein runder Drehknopf für die Heizung und ein E-Paper-Display mit den Vorräten"
  >
    <div v-for="board in boards" :key="board" class="board" :class="`b-${board}`">
      <img
        v-for="i in STEPS"
        :key="i"
        :src="src(board, i - 1)"
        :class="{ on: step === i - 1 }"
        alt=""
        :loading="i === 1 ? 'eager' : 'lazy'"
      />
    </div>
  </div>
</template>

<style scoped>
.schaltli-showcase {
  position: relative;
  width: min(600px, 100%);
  margin-inline: auto;
  aspect-ratio: 16 / 11;
  opacity: 0;
  transition: opacity 0.4s;
}
.schaltli-showcase.ready {
  opacity: 1;
}
.board {
  position: absolute;
  filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.28));
}
.board img {
  display: block;
  width: 100%;
  height: auto;
  /* Switched, not faded: a fade lets the page's white through while both
     pictures are half there (the user, 2026-09-28: "lieber hart umschalten"),
     and a board changes its screen at once too. */
  opacity: 0;
}
.board img:not(:first-child) {
  position: absolute;
  inset: 0;
}
.board img.on {
  opacity: 1;
}
.b-papers3 {
  width: 60%;
  right: 0;
  top: 0;
}
.b-4v3b {
  width: 78%;
  left: 0;
  top: 22%;
}
.b-knob {
  width: 36%;
  right: 2%;
  bottom: 0;
}
.schaltli-showcase-fallback {
  width: 320px;
  max-width: 100%;
}
</style>
