import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Berth targets current macOS releases; a modern target avoids legacy
    // transforms and keeps the WebView bundle small.
    target: "es2022",
  },
});
