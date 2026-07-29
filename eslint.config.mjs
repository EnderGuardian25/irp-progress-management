import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Both generated packages are ignored for the same reason: their contents
    // are produced by a generator, git-ignored, rebuilt fresh in CI, and never
    // hand-edited, so a lint finding in them is not actionable — the stylistic
    // rules below flag index-signature shapes that are the generator's normal
    // output, not something the spec or a handler controls.
    //
    // They differ in how strictly they typecheck, and the difference matters:
    //   - packages/types/src (openapi-typescript) typechecks clean under the
    //     unmodified strict settings of tsconfig.base.json.
    //   - packages/client/src (@hey-api/openapi-ts) does NOT. It needs
    //     `lib: ["ES2023", "DOM"]` and `exactOptionalPropertyTypes: false`,
    //     relaxed in packages/client/tsconfig.json only — see the `_comment`
    //     there. tsconfig.base.json stays strict for hand-written code.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "packages/types/src/**",
      "packages/client/src/**",
      "apps/api/src/generated/**",
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
  {
    // apps/web is React + JSX. The type-aware config above already applies;
    // this only relaxes the rules that misfire on JSX and Server Components.
    files: ["apps/web/**/*.tsx"],
    rules: {
      // Server Components are async functions returning JSX. The rule assumes
      // a Promise-returning function is awaited by its caller; React awaits it.
      "@typescript-eslint/require-await": "off",
    },
  },
);
