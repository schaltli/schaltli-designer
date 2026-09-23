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
    ["link", { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" }],
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
      { text: "Einführung", link: "/einfuehrung/" },
      { text: "Installieren", link: "/installieren/pekaway" },
      { text: "Firmware flashen", link: "/flasher/", target: "_self" },
    ],

    sidebar: [
      {
        text: "Einführung",
        items: [{ text: "Was ist Schaltli?", link: "/einfuehrung/" }],
      },
      {
        text: "Designer installieren",
        items: [
          { text: "Auf Pekaway", link: "/installieren/pekaway" },
          { text: "Ohne Pekaway", link: "/installieren/ohne-pekaway" },
        ],
      },
    ],

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
