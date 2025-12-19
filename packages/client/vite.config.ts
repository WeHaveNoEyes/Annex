import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/trpc": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
    watch: {
      // Use polling for WSL2 file system compatibility
      usePolling: true,
      interval: 1000,
    },
    hmr: {
      // Ensure HMR works in WSL2
      host: "localhost",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
