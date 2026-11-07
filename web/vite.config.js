import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev: base "/" so the /api proxy works.
// GitHub Actions (Pages) sets GITHUB_ACTIONS=true → serve the app under the
// repository sub-path, e.g. https://<user>.github.io/MindShot/.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/MindShot/" : "/",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
