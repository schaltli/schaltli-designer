<script setup lang="ts">
// One screen in every theme, light and dark: the 4.3B's van, rendered by the
// designer once per theme and variant (e2e/handbook-screenshots.spec.ts, "the
// homepage showcase"), which also writes the list of themes beside the
// pictures - so this never names a theme the designer does not have.
//
// Without the pictures (a local build that has not run npm run screenshots)
// the section says nothing rather than showing empty frames.
import { computed, onMounted, ref } from "vue"
import { withBase } from "vitepress"

type Theme = { id: string; name: string; light: [string, string]; dark: [string, string] }

const themes = ref<Theme[]>([])
const theme = ref("garden")
const variant = ref<"light" | "dark">("dark")

onMounted(async () => {
  try {
    const res = await fetch(withBase("/bilder/themes.json"))
    if (res.ok) themes.value = await res.json()
  } catch {
    themes.value = []
  }
})

const current = computed(() => themes.value.find((t) => t.id === theme.value))
const src = computed(() => withBase(`/bilder/theme-${theme.value}-${variant.value}.webp`))
const alt = computed(
  () => `Der 4.3B mit dem Cockpit im Theme ${current.value?.name ?? theme.value}, ${variant.value === "dark" ? "dunkel" : "hell"}`,
)
</script>

<template>
  <section v-if="themes.length" class="schaltli-themes">
    <p class="kicker">Themes</p>
    <h2>Ein Screen, acht Themes, hell und dunkel</h2>
    <p class="lede">
      Farben suchst du nicht einzeln aus. Du wählst ein Theme, und alles auf dem Screen passt zusammen. Tanks, Dimmer und
      Heizung laufen in einem Verlauf vom Akzent zur zweiten Farbe des Themes. Am Abend schaltet die ganze Anlage auf
      dunkel.
    </p>
    <div class="layout">
      <div class="stage"><img :src="src" :alt="alt" /></div>
      <div>
        <div class="seg" role="group" aria-label="Hell oder dunkel">
          <button type="button" :aria-pressed="variant === 'light'" @click="variant = 'light'">Hell</button>
          <button type="button" :aria-pressed="variant === 'dark'" @click="variant = 'dark'">Dunkel</button>
        </div>
        <div class="swatches">
          <button
            v-for="t in themes"
            :key="t.id"
            type="button"
            class="swatch"
            :aria-pressed="t.id === theme"
            @click="theme = t.id"
          >
            <span class="dot" :style="{ background: `linear-gradient(90deg, ${t[variant][0]}, ${t[variant][1]})` }" />
            {{ t.name }}
          </button>
        </div>
        <p class="note">Klick auf ein Theme. So sieht derselbe Screen auf dem 4.3B aus. Mehr dazu unter <a :href="withBase('/designer/themes.html')">Themes und Farben</a>.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.schaltli-themes {
  margin-top: 8px;
}
.kicker {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--schaltli-signal);
  font-weight: 700;
  margin: 0;
}
h2 {
  font-family: var(--schaltli-heading-font);
  font-weight: 400;
  font-size: 30px;
  line-height: 1.2;
  margin: 6px 0 0;
  border: 0;
  padding: 0;
}
.lede {
  color: var(--vp-c-text-2);
  max-width: 40em;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 4fr);
  gap: 32px;
  align-items: center;
  margin-top: 24px;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.stage {
  background: var(--vp-c-bg-soft);
  border-radius: 18px;
  padding: 22px;
}
.stage img {
  display: block;
  width: 100%;
  height: auto;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  padding: 3px;
  margin-bottom: 14px;
}
.seg button {
  border: 0;
  background: none;
  color: var(--vp-c-text-2);
  font-size: 14px;
  padding: 4px 14px;
  border-radius: 16px;
  cursor: pointer;
}
.seg button[aria-pressed="true"] {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}
.swatches {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.swatch {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  color: var(--vp-c-text-1);
}
.swatch[aria-pressed="true"] {
  border-color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}
.swatch:focus-visible,
.seg button:focus-visible {
  outline: 2px solid var(--schaltli-signal);
  outline-offset: 2px;
}
.dot {
  width: 26px;
  height: 14px;
  border-radius: 7px;
  flex: none;
}
.note {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
</style>
