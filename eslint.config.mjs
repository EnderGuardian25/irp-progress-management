import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // packages/types/src is openapi-typescript output: generated, git-ignored,
    // rebuilt fresh in CI, never hand-edited. It typechecks clean under the
    // strict compiler settings (that's the real signal worth acting on); the
    // stylistic rules below flag its index-signature shapes, which are the
    // generator's normal output, not something the spec or a handler controls.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "packages/types/src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files are not in any tsconfig project, so type-aware rules
    // cannot run on them. Lint them with syntactic rules only rather than
    // ignoring them — an ignore here would make this file itself invisible,
    // and with no .ts files yet that leaves ESLint zero candidates and a
    // non-zero exit.
    //
    // "**/*.config.ts" matters as much as the .mjs entries: each package's
    // tsconfig includes only src/**/*, so vitest.config.ts and its kin are
    // real TypeScript sitting outside every project. Without this they fail
    // projectService resolution and break `pnpm lint` for the whole
    // workspace.
    files: ["**/*.mjs", "**/*.js", "**/*.config.ts"],
    // Never let this reach real source. "**/*.config.ts" is repo-wide, so a
    // future domain file such as `packages/core/src/rubric.config.ts` would
    // silently lose every type-aware rule — no error, just weaker linting
    // nobody notices. Config files live beside a package root, never in src/.
    ignores: ["**/src/**"],
    ...tseslint.configs.disableTypeChecked,
  },
);
