import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cerebro's submodule and the fleet's and Claude Code's worktrees are not this app.
    ".cerebro/**",
    ".claude/**",
    // Drawings and documents: a change there alone skips CI (scripts/ci-needed.sh).
    "docs/**",
  ]),
]);

export default eslintConfig;
