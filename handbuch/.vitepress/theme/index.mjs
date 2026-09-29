import { h } from "vue"
import DefaultTheme from "vitepress/theme"
import Screenshot from "./Screenshot.vue"
import HomeShowcase from "./HomeShowcase.vue"
import ThemeShowcase from "./ThemeShowcase.vue"
import HomeSteps from "./HomeSteps.vue"
import "./custom.css"

export default {
  extends: DefaultTheme,
  // The homepage's picture: three boards with their values moving, in the
  // hero's image slot (HomeShowcase.vue).
  Layout: () => h(DefaultTheme.Layout, null, { "home-hero-image": () => h(HomeShowcase) }),
  enhanceApp({ app, router }) {
    // GoatCounter's script counts the page a visit starts on by itself. Every
    // later page is the handbook's own router at work, with no page load for
    // the script to notice, so each is counted here. The router's first run
    // is that starting page, already counted.
    let started = false
    router.onAfterRouteChange = (href) => {
      if (!started) {
        started = true
        return
      }
      window.goatcounter?.count?.({ path: new URL(href, location.href).pathname })
    }
    app.component("Screenshot", Screenshot)
    app.component("ThemeShowcase", ThemeShowcase)
    app.component("HomeSteps", HomeSteps)
  },
}
