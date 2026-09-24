import { defineConfig } from "vitepress"

// The handbook lives at the root of the repository's Pages site; the flasher
// page sits beside it under flasher/ (.github/workflows/pages.yml builds both
// into one stand, because a repository has only one).
const BASE = "/schaltli-designer/"

export default defineConfig({
  lang: "de-CH",
  title: "Schaltli",
  titleTemplate: ":title · Schaltli-Handbuch",
  description: "Bildschirme für Van und Haus gestalten und auf echte Geräte bringen - das Handbuch zu Schaltli.",
  base: BASE,
  cleanUrls: false,
  lastUpdated: true,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${BASE}brand/icon.svg` }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: `${BASE}brand/favicon-32.png` }],
    ["link", { rel: "apple-touch-icon", href: `${BASE}brand/apple-touch-icon-180.png` }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    ["link", { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,200..1000;1,6..12,200..1000&family=Varela+Round&display=swap" }],
  ],

  // The flasher is not part of this site's sources; it is copied in next to it
  // at publish time. Links to it are real, VitePress just cannot see them.
  ignoreDeadLinks: [/^\.?\/?flasher\//, /\/flasher\/?$/],

  vite: {
    // Without this, Vite looks upward for a PostCSS config and finds the
    // designer's (Tailwind), whose plugins the Pages workflow never installs -
    // it installs handbuch/ only. The handbook needs no PostCSS at all.
    css: { postcss: {} },
  },

  themeConfig: {
    logo: { light: "/brand/mark.svg", dark: "/brand/mark.svg", alt: "Schaltli" },
    siteTitle: "Schaltli",

    // Only pages that exist are listed: the handbook grows in stages
    // (Einführung, Installation first), and a sidebar entry that leads
    // nowhere is worse than one that is not there yet.
    nav: [
      { text: "Loslegen", link: "/einfuehrung/erste-schritte" },
      { text: "Installieren", link: "/installieren/pekaway" },
      { text: "Geräte", link: "/geraete/" },
      { text: "Designer", link: "/designer/" },
      { text: "Betrieb", link: "/betrieb/fehlersuche" },
      { text: "Firmware flashen", link: "/geraete/flashen" },
    ],

    sidebar: [
      {
        text: "Einführung",
        items: [
          { text: "Was ist Schaltli?", link: "/einfuehrung/" },
          { text: "Erste Schritte", link: "/einfuehrung/erste-schritte" },
          { text: "Ohne Gerät ausprobieren", link: "/einfuehrung/ausprobieren" },
        ],
      },
      {
        text: "Designer installieren",
        items: [
          { text: "Auf Pekaway", link: "/installieren/pekaway" },
          { text: "Ohne Pekaway", link: "/installieren/ohne-pekaway" },
        ],
      },
      {
        text: "Geräte",
        items: [
          { text: "Übersicht", link: "/geraete/" },
          { text: "Waveshare Knob 1.8", link: "/geraete/knob" },
          { text: "Waveshare 4.3B", link: "/geraete/waveshare-4-3b" },
          { text: "M5Stack PaperS3", link: "/geraete/papers3" },
          { text: "Android-App", link: "/geraete/android" },
          { text: "Firmware flashen", link: "/geraete/flashen" },
          { text: "WLAN und MQTT einrichten", link: "/geraete/einrichten" },
          { text: "Firmware-Updates", link: "/geraete/firmware-updates" },
        ],
      },
      {
        text: "Designer",
        items: [
          { text: "Die Oberfläche", link: "/designer/" },
          { text: "Projekte", link: "/designer/projekte" },
          { text: "Screens und Master", link: "/designer/screens" },
          { text: "Objekte platzieren", link: "/designer/objekte" },
          { text: "Hardware-Tasten und Gesten", link: "/designer/tasten" },
          { text: "Bausteine", link: "/designer/bausteine" },
          { text: "MQTT-Topics", link: "/designer/topics" },
          { text: "Vorschau", link: "/designer/vorschau" },
          { text: "Icons und Schriften", link: "/designer/icons-schriften" },
          { text: "Auf ein Gerät übertragen", link: "/designer/deploy" },
          { text: "Versionen und Wiederherstellen", link: "/designer/versionen" },
          { text: "Tastatur und Maus", link: "/designer/tastatur" },
        ],
      },
      {
        text: "Objekt-Referenz",
        items: [
          { text: "Übersicht", link: "/objekte/" },
          { text: "Anzeigen", link: "/objekte/anzeigen" },
          { text: "Bedienen", link: "/objekte/bedienen" },
          { text: "Zeichnen", link: "/objekte/zeichnen" },
          { text: "Anordnen", link: "/objekte/anordnen" },
          { text: "Gemeinsames", link: "/objekte/gemeinsames" },
        ],
      },
      {
        text: "Betrieb",
        items: [
          { text: "MQTT-Broker und Topics", link: "/betrieb/mqtt" },
          { text: "VanPi-Brücke", link: "/betrieb/vanpi-bruecke" },
          { text: "Updates und Versionen", link: "/betrieb/updates" },
          { text: "Daten und Sicherung", link: "/betrieb/daten" },
          { text: "Fehlersuche", link: "/betrieb/fehlersuche" },
        ],
      },
    ],

    footer: {
      message:
        'Handbuch unter <a href="https://github.com/Matthias-Hess/schaltli-designer/blob/main/handbuch/LICENSE">CC BY-SA 4.0</a> · Code unter <a href="https://github.com/Matthias-Hess/schaltli-designer/blob/main/LICENSE">AGPL-3.0</a>',
      copyright: "Name und Zeichen «Schaltli» sind von diesen Lizenzen ausgenommen.",
    },

    socialLinks: [{ icon: "github", link: "https://github.com/Matthias-Hess/schaltli-designer" }],

    editLink: {
      pattern: "https://github.com/Matthias-Hess/schaltli-designer/edit/main/handbuch/:path",
      text: "Diese Seite auf GitHub bearbeiten",
    },

    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "Suchen", buttonAriaLabel: "Suchen" },
          modal: {
            displayDetails: "Details anzeigen",
            resetButtonTitle: "Suche zurücksetzen",
            backButtonTitle: "Suche schliessen",
            noResultsText: "Keine Treffer für",
            footer: { selectText: "auswählen", navigateText: "wechseln", closeText: "schliessen" },
          },
        },
      },
    },

    outline: { level: [2, 3], label: "Auf dieser Seite" },
    docFooter: { prev: "Zurück", next: "Weiter" },
    lastUpdated: { text: "Zuletzt geändert" },
    returnToTopLabel: "Nach oben",
    sidebarMenuLabel: "Menü",
    darkModeSwitchLabel: "Darstellung",
    lightModeSwitchTitle: "Hell",
    darkModeSwitchTitle: "Dunkel",
    langMenuLabel: "Sprache",
    notFound: {
      title: "Diese Seite gibt es nicht",
      quote: "Vielleicht wurde sie umbenannt. Die Suche oben rechts findet sie meistens.",
      linkText: "Zur Startseite",
    },
  },
})
