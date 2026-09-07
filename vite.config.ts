import { defineConfig } from "vite";

// Static export for GitHub Pages, served under /explorer/.
export default defineConfig({
  base: "/explorer/",
  build: {
    target: "es2022",
  },
});
