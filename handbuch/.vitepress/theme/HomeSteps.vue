<script setup lang="ts">
// From the browser to the board, in three pictures: the designer, the deploy
// that finished, and the board with the result - all three taken by
// e2e/handbook-screenshots.spec.ts, so they show the designer as it is.
import { withBase } from "vitepress"

const steps = [
  {
    title: "Gestalten",
    text: "Du ziehst Anzeigen und Schalter auf den Screen und verbindest sie mit den Werten deiner Anlage.",
    img: "/bilder/screen-fertig.png",
    alt: "Der Designer mit einem Screen für den 4.3B",
    link: "/einfuehrung/erste-schritte.html",
  },
  {
    title: "Übertragen",
    text: "Ein Klick schickt das Projekt per WLAN auf das Gerät. Auch neue Firmware kommt so aufs Gerät, ohne Kabel.",
    img: "/bilder/deploy-fertig.png",
    alt: "Der Dialog «Deploy to Device», das Gerät startet mit dem neuen Projekt neu",
    link: "/designer/deploy.html",
  },
  {
    title: "Bedienen",
    text: "Runder Drehknopf, 4,3-Zoll-Touchscreen, E-Paper oder das alte Android-Handy aus der Schublade, ohne Flashen und Löten.",
    img: "/bilder/theme-amber-light.webp",
    alt: "Der 4.3B mit dem fertigen Cockpit im Theme Amber",
    link: "/geraete/",
  },
]
</script>

<template>
  <section class="schaltli-steps">
    <p class="kicker">So geht es</p>
    <h2>Vom Browser aufs Gerät</h2>
    <ol>
      <li v-for="(s, i) in steps" :key="s.title">
        <a class="pic" :href="withBase(s.link)"><img :src="withBase(s.img)" :alt="s.alt" loading="lazy" /></a>
        <span class="n">{{ i + 1 }}</span>
        <h3>{{ s.title }}</h3>
        <p>{{ s.text }}</p>
      </li>
    </ol>
    <div class="cloud">
      <h3>Ohne Cloud</h3>
      <p>Alles läuft im Van, ohne Konto und ohne fremden Server. Fällt das Internet weg, schaltest du trotzdem.</p>
    </div>
  </section>
</template>

<style scoped>
.schaltli-steps {
  margin-top: 56px;
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
ol {
  list-style: none;
  padding: 0;
  margin: 24px 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}
@media (max-width: 820px) {
  ol {
    grid-template-columns: 1fr;
  }
}
li {
  margin: 0;
}
.pic {
  display: block;
  aspect-ratio: 4 / 3;
  background: var(--vp-c-bg-soft);
  border-radius: 14px;
  padding: 12px;
  overflow: hidden;
}
.pic img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 6px;
}
.n {
  display: block;
  margin-top: 10px;
  font-family: var(--schaltli-heading-font);
  color: var(--schaltli-signal);
  font-size: 14px;
}
h3 {
  font-family: var(--schaltli-heading-font);
  font-weight: 400;
  font-size: 20px;
  margin: 2px 0 0;
}
li p,
.cloud p {
  color: var(--vp-c-text-2);
  font-size: 15px;
  margin: 6px 0 0;
}
.cloud {
  margin-top: 32px;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  padding: 18px 20px;
}
</style>
