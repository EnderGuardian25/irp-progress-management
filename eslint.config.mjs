import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**"],
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
    ...tseslint.configs.disableTypeChecked,
  },
);
