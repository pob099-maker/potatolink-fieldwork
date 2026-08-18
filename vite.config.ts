import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Set VITE_BASE when hosting under a sub-path (e.g. GitHub Pages project site).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
