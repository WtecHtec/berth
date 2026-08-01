import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 将打包开始时间转换为可直接识别的年月日时分版本号。 */
function createBuildVersion(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export default defineConfig({
  plugins: [react()],
  // 版本在 Vite 启动构建时固定，应用运行期间不会随系统时间变化。
  define: {
    __BERTH_BUILD_VERSION__: JSON.stringify(createBuildVersion(new Date())),
  },
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
