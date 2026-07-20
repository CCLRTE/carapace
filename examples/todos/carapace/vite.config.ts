import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const carapaceDirectory = dirname(fileURLToPath(import.meta.url));
const exampleRoot = resolve(carapaceDirectory, "..");

export default defineConfig({
  root: exampleRoot,
  plugins: [react()],
  server: {
    open: "/carapace/",
  },
  build: {
    emptyOutDir: true,
    outDir: "dist-carapace",
    rollupOptions: {
      input: resolve(carapaceDirectory, "index.html"),
    },
    sourcemap: true,
  },
});
