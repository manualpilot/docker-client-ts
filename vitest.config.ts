import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  // mirrors the "~/*" paths mapping in tsconfig.json
  resolve: {
    alias: [{ find: /^~\//, replacement: `${src}/` }],
  },
  test: {
    environment: "node",
    // the default pattern also matches src/spec.ts, which is generated data
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
