import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// StatusBar gedrag per platform:
// - Android: overlay UIT -> content zakt onder statusbar (lost “titel achter camera/statusbar” op)
// - iOS: overlay AAN -> safe-area padding bepaalt de juiste afstand (voorkomt de gtote gap boven aan het scherm)
(async () => {
  try {
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();

    if (platform === "android") {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: "#071427" });
      await StatusBar.setStyle({ style: Style.Dark });
    } else if (platform === "ios") {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: Style.Dark });
    }
  } catch {
    // ignore
  }
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
