import { defineConfig } from "vitest/config";

// Separate config without the React Router Vite plugin: unit tests for helper functions.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    environment: "node",
  },
});
