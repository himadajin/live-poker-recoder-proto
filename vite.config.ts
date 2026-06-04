import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/live-poker-recoder-proto/",
  plugins: [react()],
  test: {
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
});
