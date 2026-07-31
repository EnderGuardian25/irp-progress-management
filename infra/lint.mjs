// Fails on ANY Bicep diagnostic, not on the exit code.
//
// `az bicep lint` exits 0 on WARNINGS. BCP053 — reading a property a resource
// type does not have — is a warning, so a template referencing a nonexistent
// property passes an exit-code-only gate. That is the same shape as Redocly's
// plain `recommended` preset exiting 0 on warnings, which left this repo's
// zero-warning bar unenforced for most of Plan 2A (see CLAUDE.md).
//
// Raising severity in bicepconfig.json does NOT help: BCP053 is a core compiler
// diagnostic, not a configurable linter rule.
//
// Diagnostics are matched on Bicep's own `file.bicep(line,col) : <Severity>`
// citation rather than on "any output at all", because the Azure CLI emits
// unrelated WARNING lines of its own (extension-preview notices, config
// notices) that must not fail the build. Only Error and Warning count — Info is
// not a defect, and bicepconfig.json's `verbose: true` emits one on every run.
// A non-zero exit with no diagnostic is still a failure.
//
// The gate also asserts that our bicepconfig.json was actually LOADED. Bicep
// resolves it by walking up from the target file, so a moved or renamed config
// is not an error: every rule silently reverts to its built-in default, most of
// which are `warning` — and warnings do not fail `az bicep lint`. That would be
// a second way for this gate to look healthy while enforcing nothing, so the
// `verbose: true` Info line is load-bearing rather than noise. Do not set
// verbose to false to tidy the output.
import { spawnSync } from "node:child_process";

const target = process.argv[2] ?? "infra/main.bicep";
const onWindows = process.platform === "win32";

// On Windows `az` is a .cmd shim, which cannot be spawned without a shell. But
// passing an args ARRAY together with shell: true is deprecated in Node 24
// (DEP0190) because the arguments are concatenated rather than escaped, so the
// two forms are kept separate: a single quoted command string under a shell on
// Windows, and a plain argv array with no shell everywhere else.
const result = onWindows
  ? spawnSync(`az bicep lint --file "${target}"`, { encoding: "utf8", shell: true })
  : spawnSync("az", ["bicep", "lint", "--file", target], { encoding: "utf8" });

if (result.error) {
  console.error(`Could not run the Azure CLI: ${result.error.message}`);
  process.exit(1);
}

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const lines = combined.split(/\r?\n/);

const diagnostics = lines.filter((line) => /\.bicep\(\d+,\d+\)\s*:\s*(Error|Warning)\s/.test(line));
const configLoaded = lines.some((line) => /Custom bicepconfig\.json file found/.test(line));

if (!configLoaded) {
  console.error(combined.trim());
  console.error(
    "::error::Bicep did not report loading a custom bicepconfig.json. Every linter rule has " +
      "silently reverted to its built-in default, most of which are warnings — and warnings do " +
      "not fail az bicep lint. Check that infra/bicepconfig.json exists beside the template and " +
      'still sets "verbose": true.',
  );
  process.exit(1);
}

if (diagnostics.length > 0) {
  for (const line of diagnostics) console.error(line.trim());
  console.error(
    `\n::error::Bicep reported ${diagnostics.length} diagnostic(s) for ${target}. ` +
      `Warnings fail this gate deliberately: az bicep lint exits 0 on them, so the exit code alone proves nothing.`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(combined.trim());
  console.error(`::error::az bicep lint exited ${result.status} for ${target}.`);
  process.exit(1);
}

console.log(`${target}: no Bicep diagnostics, and bicepconfig.json was loaded.`);
