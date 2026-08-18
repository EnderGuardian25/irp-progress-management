/**
 * Declares the `*.png` (and sibling image) modules that a static import such as
 * `import mark from "@/assets/hearts-academy-mark.png"` resolves to.
 *
 * WHY THIS FILE EXISTS AT ALL, given Next already ships the same reference:
 * Next writes `/// <reference types="next/image-types/global" />` into
 * `apps/web/next-env.d.ts`, which `tsconfig.json` explicitly includes — but
 * `next-env.d.ts` is GENERATED and git-ignored (.gitignore:6). It exists on any
 * machine that has run `next dev` or `next build`, and does NOT exist in a fresh
 * clone. So `pnpm typecheck` passed locally and failed in CI the moment the
 * first static image import landed:
 *
 *   components/app-frame/brand-mark.tsx(2,18): error TS2307: Cannot find module
 *   '@/assets/hearts-academy-mark.png' or its corresponding type declarations.
 *
 * CI runs Typecheck BEFORE `Build @irp/web` (.github/workflows/ci.yml), and it
 * is the build that would have generated `next-env.d.ts` — so nothing in the job
 * had produced it yet. Reordering the two steps would also fix it, but it would
 * make a plain `tsc` gate depend on a full Next build having run first, and the
 * ordering is deliberate and documented there. A committed declaration is the
 * smaller, order-independent fix.
 *
 * Do NOT "fix" this by committing `next-env.d.ts` instead. It carries
 * `import "./.next/types/routes.d.ts"`, a path written by `next build` into
 * another git-ignored tree — committing the file would trade this TS2307 for a
 * different one on a fresh clone.
 *
 * The reference below is Next's own declaration set, not a hand-written copy, so
 * it cannot drift from what the bundler actually produces (a `StaticImageData`
 * object, not a string).
 */
/// <reference types="next/image-types/global" />
