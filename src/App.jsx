import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

import Track from "./pages/Track";

export default function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      // Kies Style.Dark voor lichte tekst (donkere background)
      // Kies Style.Light voor donkere tekst (lichte background)
      await StatusBar.setStyle({ style: Style.Dark });

      // Overlay true = web content loopt onder status bar door (handig met safe area)
      const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"
      await StatusBar.setOverlaysWebView({ overlay: platform === "ios" });
    })();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Track />} />
      <Route path="/track/:code?" element={<Track />} />
    </Routes>
  );
}