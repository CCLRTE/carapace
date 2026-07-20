import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const exampleRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: exampleRoot,
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
