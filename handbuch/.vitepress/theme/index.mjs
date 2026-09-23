import DefaultTheme from "vitepress/theme"
import Screenshot from "./Screenshot.vue"
import "./custom.css"

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Screenshot", Screenshot)
  },
}
