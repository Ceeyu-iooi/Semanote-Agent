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

try {
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
).mount("#app");
