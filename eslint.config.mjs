import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // Interface-required params are often intentionally unused; allow the
      // conventional underscore prefix to opt out.
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      /*
       * THE TRUNCATION RULE (VISION.md kill-list #8; the D72 disease, made a lint
       * instead of a fourth cleanup pass). Tailwind's `truncate` clips text mid-word
       * with an ellipsis. On a 390px phone that has repeatedly meant player, team and
       * manager names rendering as "Julius Ran...", "Blockbu...", "strad..." - D72
       * fixed six pages by hand, the disease regrew on four new ones, and hand passes
       * demonstrably do not hold the line. So the class is lint-restricted: every use
       * must either go (the house fix for names and prose is `line-clamp-*` or giving
       * the string its own full-width line - see D72) or carry an
       * eslint-disable-next-line comment SAYING WHY the clip is safe. Legitimate
       * reasons that have survived audit: a figure/identifier that fits by
       * construction (the ellipsis is a guard, not a layout tool); a single-line
       * preview whose full text is printed one tap away; fixed house copy in
       * width-bounded chrome. "It usually fits" is not one of them - that is exactly
       * the state every regression started from.
       *
       * Two selectors because JSX carries class strings two ways: plain string
       * literals (including inside cn()/clsx calls) and template literal quasis.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/(^|\\s)truncate($|\\s)/]',
          message:
            "`truncate` clips text mid-word. Names and prose must wrap or `line-clamp-*` instead (D72, VISION kill-list #8). If this clip is genuinely safe (identifier/figure that fits by construction, a one-line preview restated in full nearby, fixed copy in bounded chrome), keep it WITH an eslint-disable-next-line comment stating that reason.",
        },
        {
          selector:
            'JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|\\s)truncate($|\\s)/]',
          message:
            "`truncate` clips text mid-word. Names and prose must wrap or `line-clamp-*` instead (D72, VISION kill-list #8). If this clip is genuinely safe (identifier/figure that fits by construction, a one-line preview restated in full nearby, fixed copy in bounded chrome), keep it WITH an eslint-disable-next-line comment stating that reason.",
        },
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
