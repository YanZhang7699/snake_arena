import path from "node:path";
import { defineConfig } from "vite";

const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@snake/shared": path.resolve(workspaceRoot, "packages/shared/src/index.ts")
    }
  },
  server: {
    fs: {
      allow: [workspaceRoot]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
