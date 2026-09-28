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
  enhanceApp({ app }) {
    app.component("Screenshot", Screenshot)
    app.component("ThemeShowcase", ThemeShowcase)
    app.component("HomeSteps", HomeSteps)
  },
}
