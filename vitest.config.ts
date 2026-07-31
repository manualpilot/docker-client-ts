import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // the default pattern also matches src/spec.ts, which is generated data
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
