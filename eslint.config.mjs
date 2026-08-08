import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Interface-required params are often intentionally unused; allow the
      // conventional underscore prefix to opt out.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * Agent scratch space. `.claude/worktrees/` holds whole checkouts of this repo,
     * which eslint will happily walk - it does not read .gitignore in flat config, so
     * `pnpm lint` was reporting 6,603 problems in copies of files that are not the
     * ones being linted. Nothing under here is source.
     */
    ".claude/**",
  ]),
]);

export default eslintConfig;
