import { createApp } from "vue";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../docs/design/tokens.css";
import "./style.css";
import "./styles/workspace.css";
import "./styles/settings.css";
import "./styles/developer.css";
import "./styles/git.css";
import App from "./App.vue";
import DeveloperCenter from "./components/DeveloperCenter.vue";
import { reveal } from "./motion.js";
import "./styles/interaction.css";
import "./styles/review-workspace.css";
import "./styles/dashboard-theme.css";

try {
  document.documentElement.dataset.theme = localStorage.getItem("semanote.theme") === "dark" ? "dark" : "light";
  const preferences = JSON.parse(
    localStorage.getItem("semanote.preferences") || "{}",
  );
  document.documentElement.dataset.motion = preferences.reduceMotion
    ? "reduced"
    : "full";
} catch {
  /* Ignore corrupt reading preferences. */
}

createApp(
  location.pathname.startsWith("/developer") ? DeveloperCenter : App,
).directive("reveal", reveal).mount("#app");
