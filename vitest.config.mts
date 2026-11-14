import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Workers inherit this; test/integration/setup.ts then repoints DATABASE_URL per file.
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // `server-only` throws outside a React Server bundle; tests call server code directly.
      "server-only": path("./test/empty.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          // Unit tests have no database; an accidental import of src/db fails loudly
          // instead of reaching the developer's dev database.
          env: { DATABASE_URL: "postgres://unit-tests-have-no-database.invalid/none" },
        },
      },
      {
        // Server code against a real Postgres: one fresh, migrated database per test file.
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./test/integration/global-setup.ts"],
          setupFiles: ["./test/integration/setup.ts"],
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
