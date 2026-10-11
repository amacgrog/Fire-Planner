# Stage 1 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every mutable binding that crosses a module boundary a home outside the planner closure, and put the `#country/*` import-alias seam in place with one real use, so stage 2 can turn the shared fragments into modules mechanically.

**Architecture:** Each planner is still one bundle built from `src/<country>/main.js`. The bindings move out of the big IIFE into small modules: live bindings (`export let`) with `assign<Name>` setters for primitives, plain exported objects for US-only records. `main.js` imports them, so readers do not change; the esbuild build turns any missed assignment to an import into a hard error. Shared code reaches country-specific code through `#country/<name>` (a standard `package.json` `"imports"` map with a `us` / `canada` condition), checked by a contract test.

**Tech Stack:** Node 22 (CI) / 24 (local), esbuild 0.28 (existing), espree + eslint-scope (existing, analysis only), Playwright (existing tests).

**Spec:** `docs/superpowers/specs/2026-10-10-modular-build-design.md` (section 12, "Stage 1 design"; sections 3, 4 and 6 for layout, build and staging).

## Global Constraints

- Output is a classic IIFE `<script>`, not `type="module"` (spec section 2). `dist/` is gitignored; edit `src/` and `shared/`, never `dist/`.
- No behavior change: numeric output must not move. `tests/snapshots/*.json` stay byte-identical. `npm run snapshot:update` is not used anywhere in this plan.
- Nothing under `src/**/core/` references `document`, `window`, `localStorage` or `navigator` (spec section 3, rule 1). `src/shared/ui/` is where DOM code goes.
- US and Canada never import from each other; both import from `src/shared/` (spec section 3, rule 4).
- `src/` stays plain ESM: no esbuild-only features (spec section 3, rule 5). The `#country/*` mechanism is standard Node subpath imports with custom conditions.
- The build runs on Windows and Linux (CI: ubuntu-latest, Node 22). Every tool that reads sources normalizes CRLF to LF on read.
- Setters are named `assign<Name>` (`assignState`, `assignMode`, ...). The `set<Name>` names are taken by UI handlers (`setMode`, `setChartView`, `setMcPathCount`, ...) that do more than assign.
- Code shared by both planners lives in `shared/*.js` fragments: edit the fragment, run `npm run sync`. A write site inside a `// @@shared:<name>` region is changed in `shared/<name>.js`, never in one planner alone.
- Docs are updated in the stage that changes them (Task 8). Never `--no-verify`. Text files end with a newline. Stop after 3 failed attempts at one step and reassess.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; the commands below pass it as a second `-m`.
- Run commands in Git Bash. Node is not on the Git Bash PATH here: start each session with `export PATH="$PATH:/c/Program Files/nodejs"`. Create files that contain backslashes or regexes with the Write tool, not with shell heredocs (this environment's shell tool collapses double backslashes).

## Deviations from the spec (decided while writing this plan)

- `theme`, `hasPersonalizedData` and the `setMobileView` holder are not extracted here. Each is declared and written only inside shared fragments (identical in both planners) and has a DOM initializer, so they move with those fragments in stage 2. Spec section 12 is amended accordingly.
- `taxFactorInflation` stays where it is: it is written only inside its own region (`06-histTaxFactors`).
- `currentYear` exists only in the US planner (Canada uses a `CURRENT_YEAR` constant), so it is a US-only module.
- The optimizer override maps (`rothBracketOverrideByAge`, `withdrawalMixOverrideByAge`, `lastMultiLeverRun`, `rothPerYearEvalBudget`) get a US-only `optimizerState` object. The inventory showed they are written from the optimizer UI and from test hooks, in different future modules. Spec section 12 is amended.
- The first real use of `#country/*` is the storage key (`storageKey` is the only difference in each planner's storage block). The spec's step 1 had no consumer; a seam with no consumer would leave the build condition untested.
- `scripts/build.js --raw` is removed: once `main.js` has `import` lines it can no longer be inlined as written.

## Review Focus

Failure modes the spec implies but no happy-path test exercises, most likely first. Each has a pin in the task named.

1. **A missed assignment to a moved binding** (in a shared fragment or country code) would silently stop updating the app. Pinned by esbuild's `Cannot assign to import` build error; Task 4 step 6 proves the net catches one.
2. **A leftover read or write of a removed variable name** (for example `cliffPlanKey` after Task 7) is a ReferenceError at runtime, which esbuild does not report. Pinned by `tests/closure_names.js` (Task 1), which fails on any undeclared name in either `main.js`.
3. **A local variable or parameter that shadows a moved name** (`runProjection({ mode, ... })` destructures a local `mode`) rewritten by mistake. Pinned by the exact call counts in Tasks 4, 5, 6 and 7: every `assign…(` call site is listed, so one extra is a failure.
4. **The two countries' `#country` modules drifting apart** (a name one country lacks). Pinned by `tests/country_contract.js` (Task 2), with a negative control in Task 3.
5. **A store binding read before startup assigns it** (`state` is `null` until `main.js` calls `assignState(normalizeState(null))`). Pinned by placing that call exactly where the old `let state = normalizeState(null)` ran (Task 4) and by `tests/snapshot_ui.js`, which fails on any page error at load.

## File Structure

Created:
- `src/package.json` - `"type": "module"` and the `#country/*` imports map (Task 2).
- `scripts/lib/country-contract.js` - `checkCountryContract(srcRoot)` (Task 2).
- `tests/country_contract.js`, `tests/closure_names.js`, `tests/state_modules.js` - checks (Tasks 1, 2, 4-7).
- `src/us/storage-key.js`, `src/canada/storage-key.js` - the country half of the first seam (Task 3).
- `src/shared/ui/storage.js` - `storageKey`, `legacyStorageKey`, `storage`, `SCENARIO_SCHEMA_VERSION` (Task 3).
- `src/shared/core/store.js` - `state`, `mode`, `scenarios`, `compareIds` (Task 4).
- `src/shared/core/chart-prefs.js` - the nine chart display preferences (Task 5).
- `src/shared/core/tax-factors.js` - `histTaxFactors` (Task 6).
- `src/us/core/tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js` - US-only state (Task 7).

Modified: `scripts/analyze-closure.js`, `scripts/build.js`, `src/us/main.js`, `src/canada/main.js`, `shared/03-hadSavedState.js`, `shared/06-histTaxFactors.js`, `shared/13-simulate.js`, `shared/21-writeStorageNow.js`, `shared/25-setMcPathCount.js`, `shared/26-setChartView.js`, `package.json`, `CLAUDE.md`, the spec, and the regenerated `docs/superpowers/inventory/closure-*.md`.

---

### Task 0: Preflight

**Files:** none changed.

- [ ] **Step 1: Confirm the branch and a clean tree**

Run: `git branch --show-current && git status --short`
Expected: `tyler/stage1-foundations`, and no output from `git status`. (If the spec edits and this plan show as uncommitted, they are committed together with the plan; commit them first with `git add docs/superpowers && git commit -m "Plan: stage 1 foundations; amend spec section 12" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`.)

- [ ] **Step 2: Green baseline**

Run (background, about 4.5 minutes; the foreground limit is 10 minutes): `npm test > /tmp/stage1-baseline.log 2>&1; echo "exit $?" >> /tmp/stage1-baseline.log`
Expected: the last line is `exit 0`. Then run `git rev-parse HEAD` and write the hash down as `BASE`.

---

### Task 1: The analyzer reads ES modules; no undeclared names

**Files:**
- Modify: `scripts/analyze-closure.js:109-110`, `tests/closure_analyzer.js`, `package.json`
- Create: `tests/closure_names.js`

**Interfaces:**
- Produces: `analyze(code)` (unchanged shape) now accepts source with top-level `import` declarations before the IIFE. Imported names are resolved bindings, not unknown names.
- Produces: `tests/closure_names.js` fails when either `src/<country>/main.js` references an undeclared name or assigns an implicit global.

- [ ] **Step 1: Write the failing test**

In `tests/closure_analyzer.js`, insert this block immediately before the final line `console.log('closure_analyzer OK');`:

```js
// ES-module sources: top-level imports are resolved bindings (not unknown names), and an
// undeclared name is still reported.
const withImport = analyze(`import { shared } from './shared.js';
(() => {
  function use() { return shared + missing; }
})();
`);
assert.deepStrictEqual(withImport.unknownGlobals.map((g) => g.name), ['missing']);
assert.deepStrictEqual(withImport.units.find((u) => u.label === 'use').deps, []);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/closure_analyzer.js`
Expected: FAIL with a `SyntaxError` from espree about `import` (for example "'import' and 'export' may appear only with 'sourceType: module'").

- [ ] **Step 3: Make the analyzer parse modules**

In `scripts/analyze-closure.js`, change the two lines (currently 109 and 110)

```js
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'script', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'script' });
```

to

```js
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'module' });
```

- [ ] **Step 4: Run the test and confirm the committed reports do not change**

Run: `node tests/closure_analyzer.js && node scripts/analyze-closure.js && git status --short docs/superpowers/inventory`
Expected: `closure_analyzer OK`, the two summary lines the CLI prints, and no output from `git status` (module mode must not change any report). If a report changed, stop and find out why before continuing.

- [ ] **Step 5: Add the names guard**

Create `tests/closure_names.js`:

```js
// Both planner sources must reference only declared names and assign no implicit global.
// esbuild does not report an undeclared identifier (it fails at runtime), so this is the guard
// for edits that remove a declaration (stage 1 moves many bindings out of the closure).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyze } = require('../scripts/analyze-closure');

for (const dir of ['us', 'canada']) {
  const file = path.join(__dirname, '..', 'src', dir, 'main.js');
  const model = analyze(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  assert.deepStrictEqual(
    model.unknownGlobals.map((g) => `${g.name} (line ${g.line})`),
    [],
    `src/${dir}/main.js references names that are not declared anywhere`,
  );
  assert.deepStrictEqual(model.implicitGlobalWrites, [], `src/${dir}/main.js assigns an implicit global`);
}
console.log('closure_names OK');
```

Run: `node tests/closure_names.js`
Expected: `closure_names OK`.

- [ ] **Step 6: Prove the guard fails on a real mistake**

Add a line `  void notDeclaredAnywhere;` immediately before the final `})();` of `src/us/main.js` (use the Edit tool: the last two lines of the file are `})();` and a trailing newline; anchor on the preceding line you see). Run `node tests/closure_names.js`.
Expected: FAIL naming `notDeclaredAnywhere (line N)`. Then remove the line again and run `git diff --stat src/us/main.js`; expected: no output.

- [ ] **Step 7: Add the guard to `npm test` and commit**

In `package.json`, replace `node tests/planner_path.js && ` with `node tests/planner_path.js && node tests/closure_names.js && ` (the string appears once).

Run: `node tests/closure_analyzer.js && node tests/closure_names.js`

```bash
git add scripts/analyze-closure.js tests/closure_analyzer.js tests/closure_names.js package.json
git commit -m "Tooling: the closure analyzer reads ES modules; guard against undeclared names" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The `#country/*` alias plumbing and its contract check

**Files:**
- Create: `src/package.json`, `scripts/lib/country-contract.js`, `tests/country_contract.js`
- Modify: `scripts/build.js`, `package.json`

**Interfaces:**
- Produces: `#country/<name>` resolves to `src/us/<name>.js` or `src/canada/<name>.js` for any file under `src/` (esbuild with `conditions: [country]`; Node with `--conditions=<country>`).
- Produces: `checkCountryContract(srcRoot) => Promise<string[]>`: problem messages; empty when every `#country/<name>` module that shared code imports exists for both countries and exports the same names, including every name the shared code imports.
- Removes: `node scripts/build.js --raw`.

- [ ] **Step 1: Write the failing test**

Create `tests/country_contract.js`:

```js
// The "#country/<name>" seam contract (plain Node): every module shared code imports through the alias
// must exist for both countries and export the same names, and the real tree must satisfy that.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkCountryContract } = require('../scripts/lib/country-contract');

const made = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'country-contract-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}

const SHARED = "import { taxFor, rate } from '#country/tax';\nexport const f = () => taxFor(rate);\n";
const BOTH = 'export function taxFor(x) { return x; }\nexport const rate = 1;\n';

(async () => {
  // Matching countries: no problems.
  assert.deepStrictEqual(
    await checkCountryContract(tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH, 'canada/tax.js': BOTH })),
    [],
  );

  // A country module that does not exist.
  let problems = await checkCountryContract(tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH }));
  assert.ok(problems.some((m) => /src\/canada\/tax\.js is missing/.test(m)), problems.join('\n'));

  // A name the shared code imports but a country does not export.
  problems = await checkCountryContract(
    tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH, 'canada/tax.js': 'export function taxFor(x) { return x; }\n' }),
  );
  assert.ok(problems.some((m) => /src\/canada\/tax\.js does not export "rate"/.test(m)), problems.join('\n'));

  // Both countries export what is imported, but different extra names.
  problems = await checkCountryContract(
    tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH + 'export const extra = 2;\n', 'canada/tax.js': BOTH }),
  );
  assert.ok(problems.some((m) => /the countries export different names/.test(m)), problems.join('\n'));

  // Forms the check cannot read are rejected, not skipped.
  problems = await checkCountryContract(
    tree({ 'shared/core/draw.js': "import * as t from '#country/tax';\nexport const f = t.taxFor;\n", 'us/tax.js': BOTH, 'canada/tax.js': BOTH }),
  );
  assert.ok(problems.some((m) => /must be a named import/.test(m)), problems.join('\n'));

  // A comment that mentions the alias is not an import.
  assert.deepStrictEqual(
    await checkCountryContract(tree({ 'shared/core/note.js': "// see '#country/tax' for the tax function\nexport const n = 1;\n" })),
    [],
  );

  // The real tree.
  assert.deepStrictEqual(await checkCountryContract(path.join(__dirname, '..', 'src')), []);

  console.log('country_contract OK');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/country_contract.js`
Expected: FAIL with `Cannot find module '../scripts/lib/country-contract'`.

- [ ] **Step 3: Implement the checker**

Create `scripts/lib/country-contract.js`:

```js
'use strict';
// Checks the "#country/*" seam contract (spec section 12): every module that shared code imports
// through "#country/<name>" must exist for both countries and export the same names, including
// every name the shared code imports from it.
//
// Shared code may only use named imports of the alias, `import { a, b } from '#country/<name>'`;
// other forms (namespace, default, re-export) cannot be checked and are reported as problems.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const COUNTRIES = ['us', 'canada'];
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]#country\/([^'"]+)['"]/g;
const ANY_ALIAS = /['"]#country\/[^'"]+['"]/g;

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

// Map of module name -> Set of imported names, across every file under <srcRoot>/shared.
function collectSharedImports(srcRoot, problems) {
  const wanted = new Map();
  for (const file of listJsFiles(path.join(srcRoot, 'shared'))) {
    const code = stripComments(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
    let named = 0;
    for (const match of code.matchAll(NAMED_IMPORT)) {
      named++;
      const names = match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      if (!wanted.has(match[2])) wanted.set(match[2], new Set());
      names.forEach((name) => wanted.get(match[2]).add(name));
    }
    if ((code.match(ANY_ALIAS) || []).length !== named) {
      problems.push(`src/${rel}: an import from "#country/..." must be a named import ({ a, b }); namespace, default and re-export forms cannot be checked`);
    }
  }
  return wanted;
}

async function exportsOf(file) {
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    write: false,
    metafile: true,
    outfile: 'country-contract-check.js', // never written (write: false)
    logLevel: 'silent',
  });
  return Object.values(result.metafile.outputs)[0].exports;
}

async function checkCountryContract(srcRoot) {
  const problems = [];
  const wanted = collectSharedImports(srcRoot, problems);
  for (const [name, imported] of [...wanted].sort((a, b) => a[0].localeCompare(b[0]))) {
    const exportsByCountry = {};
    for (const country of COUNTRIES) {
      const file = path.join(srcRoot, country, `${name}.js`);
      if (!fs.existsSync(file)) {
        problems.push(`#country/${name}: src/${country}/${name}.js is missing`);
        continue;
      }
      exportsByCountry[country] = await exportsOf(file);
      for (const imp of [...imported].sort()) {
        if (!exportsByCountry[country].includes(imp)) {
          problems.push(`#country/${name}: src/${country}/${name}.js does not export "${imp}", which shared code imports`);
        }
      }
    }
    const [us, canada] = COUNTRIES.map((country) => exportsByCountry[country]);
    if (us && canada && us.join() !== canada.join()) {
      problems.push(`#country/${name}: the countries export different names (us: ${us.join(', ')}; canada: ${canada.join(', ')})`);
    }
  }
  return problems;
}

module.exports = { checkCountryContract };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/country_contract.js`
Expected: `country_contract OK`. (The real-tree check passes vacuously until Task 3 adds the first consumer.)

- [ ] **Step 5: Create the imports map**

Create `src/package.json`:

```json
{
  "private": true,
  "type": "module",
  "imports": {
    "#country/*": {
      "us": "./us/*.js",
      "canada": "./canada/*.js"
    }
  }
}
```

- [ ] **Step 6: Give the build its country condition and drop `--raw`**

In `scripts/build.js`:

1. Delete these two header lines:
```
//   node scripts/build.js --raw        inline main.js exactly as written, skipping esbuild
//                                      (so also the "use strict" banner: sloppy-mode output; for debugging the build only)
```
2. Replace
```js
async function bundleJs(entry) {
  if (flag('--raw')) return read(entry);
  const { build } = require('esbuild');
```
with
```js
async function bundleJs(entry, country) {
  const { build } = require('esbuild');
```
3. In the `build({ ... })` call, add `conditions: [country],` on the line after `target: 'esnext',`.
4. Replace `js: await bundleJs(path.join(src, 'main.js')),` with `js: await bundleJs(path.join(src, 'main.js'), dir),`.
5. Add `//   (shared code imports country code as '#country/<name>'; the build passes the planner's name as the esbuild condition)` as a new line after the `--out` line of the header comment.

- [ ] **Step 7: Build, wire into the test chain, commit**

Run: `npm run build && node tests/build_output.js`
Expected: `built 2 planners into dist` and `build output OK`.

In `package.json`, replace `node tests/closure_names.js && ` with `node tests/closure_names.js && node tests/country_contract.js && ` (the string appears once).

Run: `node tests/country_contract.js`

```bash
git add src/package.json scripts/lib/country-contract.js scripts/build.js tests/country_contract.js package.json
git commit -m "Build: #country/* import aliases (src/package.json, esbuild condition) and their contract check" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The first real seam: the storage key

**Files:**
- Create: `src/us/storage-key.js`, `src/canada/storage-key.js`, `src/shared/ui/storage.js`
- Modify: `src/us/main.js`, `src/canada/main.js`

**Interfaces:**
- Consumes: Task 2's alias, build condition and contract check.
- Produces: `src/shared/ui/storage.js` exports `storageKey`, `legacyStorageKey`, `storage`, `SCENARIO_SCHEMA_VERSION`. Each `main.js` now begins with an `import` line for them; the four declarations are gone from the closure.

- [ ] **Step 1: Create the country modules**

`src/us/storage-key.js`:
```js
export const storageKey = 'fireCouplePlanner.massachusettsOffline.v1';
```

`src/canada/storage-key.js`:
```js
export const storageKey = 'fireCouplePlanner.canadaOffline.v1';
```

- [ ] **Step 2: Create the shared module**

`src/shared/ui/storage.js` (DOM code, so `ui/`, not `core/`):
```js
import { storageKey } from '#country/storage-key';

export { storageKey };
export const legacyStorageKey = 'fireCouplePlanner.v3';
export const SCENARIO_SCHEMA_VERSION = 1;

// Feature-detected rather than a bare `window.localStorage` reference:
// the property itself can throw (not just return undefined) in some
// private-browsing modes, and a browser that exposes the property can
// still refuse to actually read/write it (e.g. Safari private mode
// historically allowed getItem but threw on setItem). Probing with a
// real set/remove up front means every later `storage?.` call site can
// stay a simple optional-chain without its own try/catch.
export const storage = (() => {
  try {
    const probeKey = '__firePlannerStorageProbe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
})();
```

- [ ] **Step 3: Remove the declarations from both planners and import the module instead**

In each of `src/us/main.js` and `src/canada/main.js` (use the Edit tool; the block below is identical in both files except the key string, which is the US one shown here and `fireCouplePlanner.canadaOffline.v1` in Canada):

Delete this whole block (it starts with `  const storageKey =` and ends with `SCENARIO_SCHEMA_VERSION = 1;`, directly before the `// @@shared:01-LIST_MAX begin` line):

```js
  const storageKey = 'fireCouplePlanner.massachusettsOffline.v1',
    legacyStorageKey = 'fireCouplePlanner.v3',
    // Feature-detected rather than a bare `window.localStorage` reference:
    // the property itself can throw (not just return undefined) in some
    // private-browsing modes, and a browser that exposes the property can
    // still refuse to actually read/write it (e.g. Safari private mode
    // historically allowed getItem but threw on setItem). Probing with a
    // real set/remove up front means every later `storage?.` call site can
    // stay a simple optional-chain without its own try/catch.
    storage = (() => {
      try {
        const probeKey = '__firePlannerStorageProbe__';
        window.localStorage.setItem(probeKey, '1');
        window.localStorage.removeItem(probeKey);
        return window.localStorage;
      } catch {
        return null;
      }
    })(),
    SCENARIO_SCHEMA_VERSION = 1;
```

Then replace the first two lines of the file

```js
(() => {
  const defaults = {
```

with

```js
import { storageKey, legacyStorageKey, storage, SCENARIO_SCHEMA_VERSION } from '../shared/ui/storage.js';
(() => {
  const defaults = {
```

- [ ] **Step 4: Build and run the static guards**

Run: `npm run build && node tests/closure_names.js && node tests/country_contract.js && node scripts/sync-shared.js --check`
Expected: `built 2 planners into dist`, `closure_names OK`, `country_contract OK`, and `shared regions OK (55 regions x 2 planners)`.

- [ ] **Step 5: Negative control for the contract**

Temporarily change `src/canada/storage-key.js` to `export const storageKeyX = 'x';` and run `node tests/country_contract.js`.
Expected: FAIL naming `src/canada/storage-key.js does not export "storageKey"`. Restore the file (`git checkout src/canada/storage-key.js` only works once it is committed, so undo the edit by hand) and re-run: `country_contract OK`.

- [ ] **Step 6: Full suite and commit**

Run (background): `npm test > /tmp/stage1-t3.log 2>&1; echo "exit $?" >> /tmp/stage1-t3.log`
Expected: last line `exit 0`, and `git status --short tests/snapshots` prints nothing.

```bash
git add src/us/storage-key.js src/canada/storage-key.js src/shared/ui/storage.js src/us/main.js src/canada/main.js
git commit -m "Seam: storage key through #country/storage-key; storage helpers move to src/shared/ui/storage.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `store.js`: `state`, `mode`, `scenarios`, `compareIds`

**Files:**
- Create: `src/shared/core/store.js`, `tests/state_modules.js`
- Modify: `shared/03-hadSavedState.js`, `shared/21-writeStorageNow.js`, `shared/26-setChartView.js` (then `npm run sync`), `src/us/main.js`, `src/canada/main.js`, `package.json`

**Interfaces:**
- Produces (from `src/shared/core/store.js`): `export let state` (initially `null`), `export let mode` (`'real'`), `export let scenarios` (`[]`), `export const compareIds` (a `Set`), and `assignState(next)`, `assignMode(next)`, `assignScenarios(next)`.
- Each `main.js` imports them: `import { state, mode, scenarios, compareIds, assignState, assignMode, assignScenarios } from '../shared/core/store.js';` and calls `assignState(normalizeState(null));` where `let state = normalizeState(null)` used to run.

- [ ] **Step 1: Write the failing test**

Create `tests/state_modules.js`:

```js
// The shared state modules (plain Node): importable without a DOM, live bindings, assign* setters.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const load = (rel) => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

(async () => {
  // store.js: state, mode, scenarios, compareIds
  const store = await load('src/shared/core/store.js');
  assert.strictEqual(store.state, null, 'state is null until main.js assigns it at startup');
  assert.strictEqual(store.mode, 'real');
  assert.deepStrictEqual(store.scenarios, []);
  assert.ok(store.compareIds instanceof Set);
  const next = { retireAgeA: 50 };
  store.assignState(next);
  assert.strictEqual(store.state, next, 'the live binding follows assignState');
  store.assignMode('nominal');
  assert.strictEqual(store.mode, 'nominal');
  const list = [{ id: 1 }];
  store.assignScenarios(list);
  assert.strictEqual(store.scenarios, list);

  console.log('state_modules OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/state_modules.js`
Expected: FAIL with an `ERR_MODULE_NOT_FOUND` for `src/shared/core/store.js`.

- [ ] **Step 3: Create the module**

`src/shared/core/store.js`:
```js
// Shared mutable bindings that more than one module reads. Readers import the binding (a live view of
// this module's variable); only this module assigns it, through the assign* functions (assigning to an
// import is a build error). No DOM access: this file is importable in plain Node.

export let state = null; // set once at startup: assignState(normalizeState(null))
export let mode = 'real';
export let scenarios = [];
export const compareIds = new Set();

export function assignState(next) {
  state = next;
}
export function assignMode(next) {
  mode = next;
}
export function assignScenarios(next) {
  scenarios = next;
}
```

Run: `node tests/state_modules.js`
Expected: `state_modules OK`.

- [ ] **Step 4: Rewrite the write sites inside the shared fragments**

Edit the fragments in `shared/` (not the planners). Every replacement below is one occurrence; each `old` line appears exactly where noted.

`shared/03-hadSavedState.js`:
- `      state = normalizeState(saved.state);` -> `      assignState(normalizeState(saved.state));`
- `    if (['real', 'nominal'].includes(saved?.mode)) mode = saved.mode;` -> `    if (['real', 'nominal'].includes(saved?.mode)) assignMode(saved.mode);`

`shared/21-writeStorageNow.js` (five `state` sites and one `scenarios` site):
- both `    state = normalizeState(scenarioState);` (two occurrences) -> `    assignState(normalizeState(scenarioState));`
- both `      state = backup;` (two occurrences) -> `      assignState(backup);`
- `    state = normalizeState(sc.state);` -> `    assignState(normalizeState(sc.state));`
- `    scenarios = scenarios.filter((s) => s.id !== id);` -> `    assignScenarios(scenarios.filter((s) => s.id !== id));`

`shared/26-setChartView.js` (two `state` sites and four `mode` sites; the `chartView`, `lastProjectionView` and `logScale` lines are Task 5):
- `    mode = next;` -> `    assignMode(next);`
- `      state = undoSnapshot.state;` -> `      assignState(undoSnapshot.state);`
- `      mode = undoSnapshot.mode;` -> `      assignMode(undoSnapshot.mode);`
- `    mode = 'real';` -> `    assignMode('real');`
- the multi-line reset: change `    state = {` (the line before `      ...defaults,`) to `    assignState({` and change the closing `    };` (the line after `      children: defaults.children.map((t) => ({ ...t })),`) to `    });`

Then run `npm run sync` and expect `synced 55 regions, updated 6` (three regions changed, counted once per planner).

- [ ] **Step 5: Rewrite the declaration block and add the import in both planners**

In each `src/<country>/main.js` (identical text in both):

1. Replace
```js
  let state = normalizeState(null),
    mode = 'real',
    chartView = '3yr',
```
with
```js
  assignState(normalizeState(null));
  let chartView = '3yr',
```
2. Replace
```js
    lastProjectionView = '3yr',
    scenarios = [],
    compareIds = new Set();
```
with
```js
    lastProjectionView = '3yr';
```
3. Add this import line directly below the existing `import { storageKey, ... } from '../shared/ui/storage.js';` line:
```js
import { state, mode, scenarios, compareIds, assignState, assignMode, assignScenarios } from '../shared/core/store.js';
```

- [ ] **Step 6: Find the remaining writes and prove the net catches a missed one**

Run: `npm run build`
Expected on the US planner: one error `Cannot assign to import "state"` for the test hook `window.__test_replaceState` (`state = normalizeState(raw);`). Replace it with `assignState(normalizeState(raw));`. Canada should build cleanly. Run `npm run build` again until it reports `built 2 planners into dist`.

Negative control: change one `assignMode('real');` in `src/us/main.js` back to `mode = 'real';`, run `npm run build`, and expect `Cannot assign to import "mode"`. Undo the change.

- [ ] **Step 7: Check the call sites against the expected counts**

Run:
```bash
for f in src/us/main.js src/canada/main.js; do echo "$f assignState: $(grep -c 'assignState(' $f)  assignMode: $(grep -c 'assignMode(' $f)  assignScenarios: $(grep -c 'assignScenarios(' $f)"; done
```
Expected exactly: `src/us/main.js assignState: 10  assignMode: 4  assignScenarios: 1` and `src/canada/main.js assignState: 9  assignMode: 4  assignScenarios: 1`. (US: the startup call, five in 21-writeStorageNow, one in 03, two in 26, one in the replace-state hook. Canada has no hook.) A different count means a shadowed local or a missed site: stop and find it.

- [ ] **Step 8: Guards, the full suite, and commit**

In `package.json`, replace `node tests/country_contract.js && ` with `node tests/country_contract.js && node tests/state_modules.js && `.

Run: `node tests/closure_names.js && node scripts/sync-shared.js --check && node tests/state_modules.js`
Expected: all OK. Then run (background) `npm test > /tmp/stage1-t4.log 2>&1; echo "exit $?" >> /tmp/stage1-t4.log`. Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add src/shared/core/store.js tests/state_modules.js shared src/us/main.js src/canada/main.js package.json
git commit -m "State: state, mode, scenarios and compareIds move to src/shared/core/store.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `chart-prefs.js`: the nine chart display preferences

**Files:**
- Create: `src/shared/core/chart-prefs.js`
- Modify: `tests/state_modules.js`, `shared/25-setMcPathCount.js`, `shared/26-setChartView.js` (then `npm run sync`), `src/us/main.js`, `src/canada/main.js`

**Interfaces:**
- Produces (from `src/shared/core/chart-prefs.js`): live bindings `chartView` (`'3yr'`), `chartShiftMode` (`'together'`), `chartGapPartner` (`null`), `chartXAxisMode` (`'ageA'`), `logScale` (`false`), `chartExpanded` (`false`), `chartToolbarCollapsed` (`false`), `mcPathCount` (`1000`), `lastProjectionView` (`'3yr'`), and `assignChartView`, `assignChartShiftMode`, `assignChartGapPartner`, `assignChartXAxisMode`, `assignLogScale`, `assignChartExpanded`, `assignChartToolbarCollapsed`, `assignMcPathCount`, `assignLastProjectionView`.

- [ ] **Step 1: Extend the test**

In `tests/state_modules.js`, insert before `console.log('state_modules OK');`:

```js
  // chart-prefs.js: defaults, live bindings, setters
  const prefs = await load('src/shared/core/chart-prefs.js');
  assert.deepStrictEqual(
    [prefs.chartView, prefs.chartShiftMode, prefs.chartGapPartner, prefs.chartXAxisMode, prefs.logScale,
      prefs.chartExpanded, prefs.chartToolbarCollapsed, prefs.mcPathCount, prefs.lastProjectionView],
    ['3yr', 'together', null, 'ageA', false, false, false, 1000, '3yr'],
  );
  prefs.assignChartView('mc');
  prefs.assignChartShiftMode('gap');
  prefs.assignChartGapPartner('B');
  prefs.assignChartXAxisMode('year');
  prefs.assignLogScale(true);
  prefs.assignChartExpanded(true);
  prefs.assignChartToolbarCollapsed(true);
  prefs.assignMcPathCount(250);
  prefs.assignLastProjectionView('cagr');
  assert.deepStrictEqual(
    [prefs.chartView, prefs.chartShiftMode, prefs.chartGapPartner, prefs.chartXAxisMode, prefs.logScale,
      prefs.chartExpanded, prefs.chartToolbarCollapsed, prefs.mcPathCount, prefs.lastProjectionView],
    ['mc', 'gap', 'B', 'year', true, true, true, 250, 'cagr'],
  );

```

Run: `node tests/state_modules.js`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `chart-prefs.js`).

- [ ] **Step 2: Create the module**

`src/shared/core/chart-prefs.js` (the comments are the ones from the old declaration block, moved here):

```js
// Chart display preferences, shared by the chart code in both planners. Not part of `state` and never
// saved or exported with a scenario: everything here resets on reload. Readers import the binding (a
// live view); only this module assigns it, through the assign* functions. No DOM access.

export let chartView = '3yr';

// Display-only, like chartView/mode/logScale: which partner(s)
// move for the ±1yr/±3yr comparison chart. 'together' shifts both
// partners' dates by the same amount (today's original behavior);
// 'gap' shifts only one partner's date, narrowing or widening the gap
// between the two dates. Not part of state/scenario export, and reset
// to 'together' on reload — see chartShiftModeRow's visibility/
// disabled handling in render() for why.
export let chartShiftMode = 'together';

// Which partner moves in 'gap' mode: null means "auto" — track
// whichever partner currently retires earlier, same as this
// feature's original behavior. 'A' or 'B' means the person explicitly
// picked that partner via the Vary: Partner A/B buttons, which then
// sticks regardless of which partner is actually earlier — full
// manual control, not just auto-detection.
export let chartGapPartner = null;

// Display-only, like chartShiftMode above: which value the chart's
// x-axis is labeled/scrubbed in. All three are just an affine
// transform of the same underlying `age` (Partner A's age) every row
// already carries — 'ageB' = age - ageA + state.ageB, 'year' =
// CURRENT_YEAR + (age - ageA) — so this never changes how rows are
// generated or how the chart's internal x(age) pixel-mapping works,
// only how tick labels and the hover-tooltip header are formatted.
// Not part of state/scenario export, resets to 'ageA' on reload.
export let chartXAxisMode = 'ageA';

export let logScale = false;

// Display-only, like the above: whether the chart card is in its
// CSS-overlay "expanded" (fixed, full-viewport) presentation. Not
// part of state/scenario export, resets to false on reload/tab
// switch — see setChartExpanded() for the CSS class it toggles and
// the best-effort real-Fullscreen/landscape-lock attempt layered on
// top of it for capable mobile browsers.
export let chartExpanded = false;

// Display-only: whether #chartToolbar (the view/x-axis/shift/path
// rows) is collapsed out of the way. Independent of chartExpanded —
// see #chartToolbarToggleBtn's CSS for exactly when it's shown/has an
// effect. Reset to false whenever chartExpanded turns off (in
// setChartExpanded()) so a stale "collapsed" state can never carry
// into a context where the toggle button to undo it isn't visible.
export let chartToolbarCollapsed = false;

export let mcPathCount = 1000;
export let lastProjectionView = '3yr';

export function assignChartView(next) {
  chartView = next;
}
export function assignChartShiftMode(next) {
  chartShiftMode = next;
}
export function assignChartGapPartner(next) {
  chartGapPartner = next;
}
export function assignChartXAxisMode(next) {
  chartXAxisMode = next;
}
export function assignLogScale(next) {
  logScale = next;
}
export function assignChartExpanded(next) {
  chartExpanded = next;
}
export function assignChartToolbarCollapsed(next) {
  chartToolbarCollapsed = next;
}
export function assignMcPathCount(next) {
  mcPathCount = next;
}
export function assignLastProjectionView(next) {
  lastProjectionView = next;
}
```

Run: `node tests/state_modules.js`
Expected: `state_modules OK`.

- [ ] **Step 3: Rewrite the write sites inside the shared fragments**

`shared/25-setMcPathCount.js`:
- `    mcPathCount = n;` -> `    assignMcPathCount(n);`
- `    logScale = e.target.checked;` -> `    assignLogScale(e.target.checked);`
- `    chartExpanded = next;` -> `    assignChartExpanded(next);`
- `    chartToolbarCollapsed = next;` -> `    assignChartToolbarCollapsed(next);`

`shared/26-setChartView.js`:
- `    chartView = next;` -> `    assignChartView(next);`
- `    if (CHART_GROUPS[next] === 'projection') lastProjectionView = next;` -> `    if (CHART_GROUPS[next] === 'projection') assignLastProjectionView(next);`
- `      logScale = true;` -> `      assignLogScale(true);`
- `      logScale = undoSnapshot.logScale;` -> `      assignLogScale(undoSnapshot.logScale);`
- `    logScale = false;` -> `    assignLogScale(false);`

Run `npm run sync`.

- [ ] **Step 4: Rewrite the write sites in the country code and replace the declaration**

In both `src/us/main.js` and `src/canada/main.js` (the text is identical in both):
- `chartShiftMode = next;` (inside `setChartShiftMode`) -> `assignChartShiftMode(next);`
- `if (gapDisabled && chartShiftMode === 'gap') chartShiftMode = 'together';` -> `if (gapDisabled && chartShiftMode === 'gap') assignChartShiftMode('together');`
- `chartGapPartner = next;` -> `assignChartGapPartner(next);`
- `if (state.singlePerson && chartXAxisMode === 'ageB') chartXAxisMode = 'ageA';` -> `if (state.singlePerson && chartXAxisMode === 'ageB') assignChartXAxisMode('ageA');`
- `chartXAxisMode = next;` -> `assignChartXAxisMode(next);`

Then delete the now-unneeded declaration. Write `C:\...\scratchpad\drop-chart-prefs-decl.js` (use the session's scratchpad directory) with the Write tool:

```js
// One-off: removes the chart-preference `let` statement from both planners (it moved to chart-prefs.js).
const fs = require('fs');
for (const dir of ['us', 'canada']) {
  const file = `src/${dir}/main.js`;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf("  let chartView = '3yr',\n");
  const endMark = "    lastProjectionView = '3yr';\n";
  const end = text.indexOf(endMark, start);
  if (start < 0 || end < 0) throw new Error(`${file}: chart-preference declaration not found`);
  fs.writeFileSync(file, text.slice(0, start) + text.slice(end + endMark.length));
  console.log(`${file}: removed ${text.slice(start, end + endMark.length).split('\n').length - 1} lines`);
}
```

Run it from the repo root (`node <path to the script>`). Expected: two lines reporting the same number of removed lines (about 40) for both planners; if the numbers differ, the two declaration blocks differ and one needs a closer look before continuing.

Add this import line directly below the `store.js` import in both planners:
```js
import { chartView, chartShiftMode, chartGapPartner, chartXAxisMode, logScale, chartExpanded, chartToolbarCollapsed, mcPathCount, lastProjectionView, assignChartView, assignChartShiftMode, assignChartGapPartner, assignChartXAxisMode, assignLogScale, assignChartExpanded, assignChartToolbarCollapsed, assignMcPathCount, assignLastProjectionView } from '../shared/core/chart-prefs.js';
```

- [ ] **Step 5: Build, check counts and guards**

Run: `npm run build`
Expected: `built 2 planners into dist` with no `Cannot assign to import` error. If one appears, it names the file and line of a missed site: rewrite it the same way.

Run:
```bash
for f in src/us/main.js src/canada/main.js; do echo "$f: $(for n in ChartView ChartShiftMode ChartGapPartner ChartXAxisMode LogScale ChartExpanded ChartToolbarCollapsed McPathCount LastProjectionView; do printf "%s=%s " $n $(grep -c "assign$n(" $f); done)"; done
```
Expected, identical in both files: `ChartView=1 ChartShiftMode=2 ChartGapPartner=1 ChartXAxisMode=2 LogScale=4 ChartExpanded=1 ChartToolbarCollapsed=1 McPathCount=1 LastProjectionView=1`.

Run: `node tests/closure_names.js && node scripts/sync-shared.js --check && node tests/state_modules.js`
Expected: all OK.

- [ ] **Step 6: Full suite and commit**

Run (background): `npm test > /tmp/stage1-t5.log 2>&1; echo "exit $?" >> /tmp/stage1-t5.log`. Expected `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add src/shared/core/chart-prefs.js tests/state_modules.js shared src/us/main.js src/canada/main.js
git commit -m "State: the chart display preferences move to src/shared/core/chart-prefs.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `tax-factors.js`: `histTaxFactors`

**Files:**
- Create: `src/shared/core/tax-factors.js`
- Modify: `tests/state_modules.js`, `shared/06-histTaxFactors.js`, `shared/13-simulate.js` (then `npm run sync`), `src/us/main.js`, `src/canada/main.js`

**Interfaces:**
- Produces (from `src/shared/core/tax-factors.js`): `export let histTaxFactors` (`null`) and `assignHistTaxFactors(next)`.

- [ ] **Step 1: Extend the test**

In `tests/state_modules.js`, insert before `console.log('state_modules OK');`:

```js
  // tax-factors.js
  const taxFactors = await load('src/shared/core/tax-factors.js');
  assert.strictEqual(taxFactors.histTaxFactors, null);
  const factors = [1, 1.02];
  taxFactors.assignHistTaxFactors(factors);
  assert.strictEqual(taxFactors.histTaxFactors, factors);

```

Run: `node tests/state_modules.js`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `tax-factors.js`).

- [ ] **Step 2: Create the module**

`src/shared/core/tax-factors.js`:
```js
// Per-run tax-indexing factors for the historical engine (read by taxIndexFactor): an array while a
// historical run is in progress, null otherwise. Readers import the live binding; only this module
// assigns it. No DOM access.

export let histTaxFactors = null;

export function assignHistTaxFactors(next) {
  histTaxFactors = next;
}
```

Run: `node tests/state_modules.js`
Expected: `state_modules OK`.

- [ ] **Step 3: Rewrite the fragments**

`shared/06-histTaxFactors.js`: delete line 1, `  let histTaxFactors = null;`. `taxFactorInflation` (a few lines further down) stays.

`shared/13-simulate.js`:
- `    histTaxFactors = [];` -> `    assignHistTaxFactors([]);`
- `      histTaxFactors = prevTaxFactors;` -> `      assignHistTaxFactors(prevTaxFactors);`

Run `npm run sync`.

- [ ] **Step 4: Import it in both planners and rewrite the US-only sites**

Add this import line directly below the `chart-prefs.js` import in both planners:
```js
import { histTaxFactors, assignHistTaxFactors } from '../shared/core/tax-factors.js';
```

Run `npm run build`. Expected: Canada builds; the US planner reports `Cannot assign to import "histTaxFactors"` at each remaining US-only site. Rewrite each as follows (the three test-hook pairs, and the pair in `computeCliffPlan`):
- `histTaxFactors = null;` -> `assignHistTaxFactors(null);`
- `histTaxFactors = [];` -> `assignHistTaxFactors([]);`
- `histTaxFactors = prev;` -> `assignHistTaxFactors(prev);`
- `histTaxFactors = prevFactors;` -> `assignHistTaxFactors(prevFactors);`
- `histTaxFactors = prevTaxFactors;` -> `assignHistTaxFactors(prevTaxFactors);`

Run `npm run build` until clean.

- [ ] **Step 5: Check counts and guards**

Run: `for f in src/us/main.js src/canada/main.js; do echo "$f: $(grep -c 'assignHistTaxFactors(' $f)"; done`
Expected: `src/us/main.js: 10` and `src/canada/main.js: 2`. (US: two in the shared fragment, two in `computeCliffPlan`, six in the three test hooks.)

Run: `node tests/closure_names.js && node scripts/sync-shared.js --check && node tests/state_modules.js`
Expected: all OK.

- [ ] **Step 6: Full suite and commit**

Run (background): `npm test > /tmp/stage1-t6.log 2>&1; echo "exit $?" >> /tmp/stage1-t6.log`. Expected `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add src/shared/core/tax-factors.js tests/state_modules.js shared src/us/main.js src/canada/main.js
git commit -m "State: histTaxFactors moves to src/shared/core/tax-factors.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: US-only state: `currentYear`, `cliffPlanStore`, `optimizerState`, `testHooks`

**Files:**
- Create: `src/us/core/tax-year.js`, `src/us/core/cliff-plan-store.js`, `src/us/core/optimizer-state.js`, `src/us/core/test-hooks.js`
- Modify: `tests/state_modules.js`, `src/us/main.js`

**Interfaces:**
- Produces: `tax-year.js` exports live binding `currentYear` and `assignCurrentYear(next)`.
- Produces: `cliff-plan-store.js` exports `cliffPlanStore = { plan, key, report, forState, year, overrides, computed, computes }`.
- Produces: `optimizer-state.js` exports `ROTH_PER_YEAR_EVAL_BUDGET` (8000) and `optimizerState = { rothBracketByAge, withdrawalMixByAge, lastMultiLeverRun, rothPerYearEvalBudget }`.
- Produces: `test-hooks.js` exports `testHooks = { irmaaInYearCalls, inhTakeCount, testInhForce, testInhNoNeedAdj, inhNoDrawCalls }`.
- Name mapping used by the rename script: `cliffPlan` -> `cliffPlanStore.plan`, `cliffPlanKey` -> `.key`, `cliffPlanReport` -> `.report`, `cliffPlanState` -> `.forState`, `cliffPlanYear` -> `.year`, `cliffPlanOverrides` -> `.overrides`, `cliffPlanComputed` -> `.computed`, `cliffPlanComputes` -> `.computes`; `rothBracketOverrideByAge` -> `optimizerState.rothBracketByAge`, `withdrawalMixOverrideByAge` -> `optimizerState.withdrawalMixByAge`, `lastMultiLeverRun` -> `optimizerState.lastMultiLeverRun`, `rothPerYearEvalBudget` -> `optimizerState.rothPerYearEvalBudget`; each test-hook name -> `testHooks.<same name>`.

- [ ] **Step 1: Extend the test**

In `tests/state_modules.js`, insert before `console.log('state_modules OK');`:

```js
  // US-only modules
  const taxYear = await load('src/us/core/tax-year.js');
  assert.strictEqual(taxYear.currentYear, new Date().getFullYear());
  taxYear.assignCurrentYear(2031);
  assert.strictEqual(taxYear.currentYear, 2031);

  const { cliffPlanStore } = await load('src/us/core/cliff-plan-store.js');
  assert.deepStrictEqual(cliffPlanStore, {
    plan: null, key: null, report: null, forState: null, year: null, overrides: null, computed: false, computes: 0,
  });

  const { optimizerState, ROTH_PER_YEAR_EVAL_BUDGET } = await load('src/us/core/optimizer-state.js');
  assert.strictEqual(ROTH_PER_YEAR_EVAL_BUDGET, 8000);
  assert.deepStrictEqual(optimizerState, {
    rothBracketByAge: null, withdrawalMixByAge: null, lastMultiLeverRun: null, rothPerYearEvalBudget: 8000,
  });

  const { testHooks } = await load('src/us/core/test-hooks.js');
  assert.deepStrictEqual(testHooks, {
    irmaaInYearCalls: 0, inhTakeCount: 0, testInhForce: null, testInhNoNeedAdj: false, inhNoDrawCalls: 0,
  });

```

Run: `node tests/state_modules.js`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` for `tax-year.js`).

- [ ] **Step 2: Create the four modules**

`src/us/core/tax-year.js`:
```js
// The calendar year the tax code is evaluated from. A live binding so tests can pin it
// (window.__test_setCurrentYear). No DOM access.

export let currentYear = new Date().getFullYear();

export function assignCurrentYear(next) {
  currentYear = next;
}
```

`src/us/core/cliff-plan-store.js`:
```js
// The kept cliff plan and what it was made for (refreshCliffPlan / planForState in main.js). Declared as
// one object so every module that plans or reads the plan shares it. No DOM access.
export const cliffPlanStore = {
  plan: null, // the kept plan (null with the guard off)
  key: null, // JSON of the state it was made for
  report: null, // the keep-rule table
  forState: null, // the state object refreshCliffPlan() planned for
  // What else the kept plan was made under (refreshCliffPlan keeps it while all of these are unchanged),
  // and whether plan / report hold a computed plan (false after a test hook set the plan by hand).
  year: null,
  overrides: null,
  computed: false,
  computes: 0, // computeCliffPlan calls from refreshCliffPlan (tests)
};
```

`src/us/core/optimizer-state.js`:
```js
// State the Roth / multi-lever optimizers share with the engine. No DOM access.

export const ROTH_PER_YEAR_EVAL_BUDGET = 8000; // simulate() calls, hard cap for the whole run (shared across every lever/smooth-branch in one call)

export const optimizerState = {
  // Per-age overrides applied by the optimizers ("Apply" writes them; a mapped 0 or no entry means no override that year).
  rothBracketByAge: null,
  withdrawalMixByAge: null,
  // Last completed optimizeMultiLever() run shown in the result card — { opt, options, savings } or null before the first
  // run this session. Read by applyMultiLeverSchedule() so "Apply" writes exactly what the table is currently showing.
  lastMultiLeverRun: null,
  // The budget optimizeMultiLever reads; only the test hook __test_setOptimizerBudget changes it (tests/solver_gap.js runs a
  // slow reference with a larger budget).
  rothPerYearEvalBudget: ROTH_PER_YEAR_EVAL_BUDGET,
};
```

`src/us/core/test-hooks.js`:
```js
// Test-only counters and switches the engine reads or bumps; the window.__test_* hooks in main.js set them.
// Kept in one object so the engine does not own test state. No DOM access.
export const testHooks = {
  irmaaInYearCalls: 0, // how many times healthcareCost priced an in-year appeal candidate
  inhTakeCount: 0, // takeInherited calls that get past the null gate
  testInhForce: null, // add x to ledger slot `slot`'s scheduled draw in projection year `year` (the identity tests)
  testInhNoNeedAdj: false, // switch off the need-without-the-draw step (the exact-restore test)
  inhNoDrawCalls: 0, // evaluations of that step
};
```

Run: `node tests/state_modules.js`
Expected: `state_modules OK`.

- [ ] **Step 3: Record the occurrence counts**

The rename script in Step 5 must change exactly (occurrences minus the one declaration) of each name. Before touching `src/us/main.js`, run and write down the numbers:

```bash
for n in cliffPlan cliffPlanKey cliffPlanReport cliffPlanState cliffPlanYear cliffPlanOverrides cliffPlanComputed cliffPlanComputes rothBracketOverrideByAge withdrawalMixOverrideByAge lastMultiLeverRun rothPerYearEvalBudget irmaaInYearCalls inhTakeCount testInhForce testInhNoNeedAdj inhNoDrawCalls; do printf "%s=%s " $n $(grep -ow "$n" src/us/main.js | wc -l); done; echo
grep -nE "[{,][[:space:]]*(cliffPlan[A-Za-z]*|rothBracketOverrideByAge|withdrawalMixOverrideByAge|lastMultiLeverRun|rothPerYearEvalBudget|irmaaInYearCalls|inhTakeCount|testInhForce|testInhNoNeedAdj|inhNoDrawCalls)[[:space:]]*[,}]" src/us/main.js
```
Expected: the first line lists the counts (as of this plan: `cliffPlan=9`-ish occurrences, `cliffPlanKey=6 cliffPlanReport=5 cliffPlanState=4 cliffPlanYear=7 cliffPlanOverrides=5 cliffPlanComputed=4 cliffPlanComputes=3 rothBracketOverrideByAge=16 withdrawalMixOverrideByAge=14 lastMultiLeverRun=6 rothPerYearEvalBudget=3 irmaaInYearCalls=5 inhTakeCount=4 testInhForce=9 testInhNoNeedAdj=3 inhNoDrawCalls=4`; use the numbers you see, not these); the second command (object-literal shorthand check) must print nothing. If it prints a line, handle that site by hand as `name: <replacement>`.

- [ ] **Step 4: Delete the declarations**

Delete these declaration lines from `src/us/main.js` (Edit tool; keep the comment lines that sit above them only if they describe something other than the variable: the comments for `lastMultiLeverRun`, `rothPerYearEvalBudget`, the cliff-plan block and the test counters have been moved into the new modules, so delete those comments with their declaration):

1. `  let currentYear = new Date().getFullYear();` (keep the three comment lines above it, they describe `rmdStartAge`; change "so `currentYear` is a closure variable tests can pin" to "so `currentYear` (from `core/tax-year.js`) is a live binding tests can pin").
2. The whole cliff-plan declaration: from the comment `  // Cliff plan: the kept plan (null with the guard off), ...` through `    cliffPlanComputes = 0; // computeCliffPlan calls from refreshCliffPlan (tests)`. Keep the following `const cliffPlanCache = new Map(), ...` statement.
3. `  let rothBracketOverrideByAge = null;`, `  let withdrawalMixOverrideByAge = null;`, and the `lastMultiLeverRun` comment plus `  let lastMultiLeverRun = null;`.
4. `  const ROTH_PER_YEAR_EVAL_BUDGET = 8000; ...` (the whole line), and the comment plus `  let rothPerYearEvalBudget = ROTH_PER_YEAR_EVAL_BUDGET;`.
5. `  // E3, test-only ...` plus `  let irmaaInYearCalls = 0;`; `  let inhTakeCount = 0;` (keep the comment above it up to "...never penalized, ... Counter (tests): calls that get past the null gate." but end that sentence before "Counter (tests):"); the two comments plus `  let testInhForce = null;`, `  let testInhNoNeedAdj = false;`, `  let inhNoDrawCalls = 0;`.

- [ ] **Step 5: Rename the references with the scope-aware script**

Write `rename-to-store.js` in the session's scratchpad directory with the Write tool:

```js
// Usage: node rename-to-store.js FILE name=replacement ...
// Replaces whole-word identifiers that are not property names (not preceded by "." or an identifier character).
const fs = require('fs');

const [, , file, ...pairs] = process.argv;
let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
for (const pair of pairs) {
  const [name, replacement] = pair.split('=');
  const re = new RegExp('(?<![\\w$.])' + name + '(?![\\w$])', 'g');
  const count = (text.match(re) || []).length;
  text = text.replace(re, () => replacement);
  console.log(`${name} -> ${replacement}: ${count} replacements`);
}
fs.writeFileSync(file, text);
```

Run it once on `src/us/main.js`:

```bash
node <scratchpad>/rename-to-store.js src/us/main.js \
  cliffPlanKey=cliffPlanStore.key cliffPlanReport=cliffPlanStore.report cliffPlanState=cliffPlanStore.forState \
  cliffPlanYear=cliffPlanStore.year cliffPlanOverrides=cliffPlanStore.overrides cliffPlanComputed=cliffPlanStore.computed \
  cliffPlanComputes=cliffPlanStore.computes cliffPlan=cliffPlanStore.plan \
  rothBracketOverrideByAge=optimizerState.rothBracketByAge withdrawalMixOverrideByAge=optimizerState.withdrawalMixByAge \
  lastMultiLeverRun=optimizerState.lastMultiLeverRun rothPerYearEvalBudget=optimizerState.rothPerYearEvalBudget \
  irmaaInYearCalls=testHooks.irmaaInYearCalls inhTakeCount=testHooks.inhTakeCount testInhForce=testHooks.testInhForce \
  testInhNoNeedAdj=testHooks.testInhNoNeedAdj inhNoDrawCalls=testHooks.inhNoDrawCalls
```

Expected: each line's count equals the Step 3 count for that name minus 1 (the deleted declaration). A different number means a name appears where it should not be rewritten (a comment, a string): inspect `git diff -U0 src/us/main.js | grep '^[-+]'` and fix by hand.

- [ ] **Step 6: Wire the imports and the two remaining writes**

Add these import lines at the top of `src/us/main.js`, directly below the `tax-factors.js` import (US only; Canada has none of these):

```js
import { currentYear, assignCurrentYear } from './core/tax-year.js';
import { cliffPlanStore } from './core/cliff-plan-store.js';
import { optimizerState } from './core/optimizer-state.js';
import { testHooks } from './core/test-hooks.js';
```

Rewrite the one remaining write of the live binding: `window.__test_setCurrentYear = (y) => { currentYear = y; };` -> `window.__test_setCurrentYear = (y) => { assignCurrentYear(y); };`.

Run `npm run build`. Expected: `built 2 planners into dist`.

- [ ] **Step 7: Guards and review the diff**

Run: `node tests/closure_names.js && node scripts/sync-shared.js --check && node tests/state_modules.js`
Expected: all OK. `closure_names` is the guard for any name this task removed but did not rewrite.

Run: `git diff -U0 src/us/main.js | grep '^[-+]' | grep -v '^[-+][-+]' | sed -n '1,400p' | cut -c1-140` and read it: every removed line is a declaration, a comment moved into a module, or a line containing one of the renamed identifiers; every added line is an import or the same line with the new name. A hunk that changes anything else is a mistake.

- [ ] **Step 8: Full suite and commit**

Run (background): `npm test > /tmp/stage1-t7.log 2>&1; echo "exit $?" >> /tmp/stage1-t7.log`. Expected `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add src/us tests/state_modules.js
git commit -m "State: US-only state (tax year, cliff plan, optimizer state, test hooks) moves to src/us/core" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, the regenerated inventory, and a performance check

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-10-modular-build-design.md`, `docs/superpowers/inventory/closure-us.md`, `docs/superpowers/inventory/closure-canada.md`

- [ ] **Step 1: Regenerate the inventory and check it against the expectation**

Run: `npm run analyze`
Expected summary lines: `US: ... 24 mutable ...` and `Canada: ... 25 mutable ...` (US had 55 and moved 31; Canada had 38 and moved 13). Open the "Mutable top-level bindings" table of `docs/superpowers/inventory/closure-us.md`: it must no longer list `state`, `mode`, the chart preferences, `scenarios`, `histTaxFactors`, `currentYear`, the `cliffPlan*` variables, the override maps or the test-hook counters. If the numbers differ, find which binding is still listed and say so in the commit message; do not adjust the expectation.

- [ ] **Step 2: Update `CLAUDE.md`**

Use the Edit tool.

1. In "Files", add these bullets directly after the `scripts/analyze-closure.js` bullet:
```
- `src/shared/` — code both planners import. `src/shared/core/` is DOM-free and importable in plain Node: `store.js` (`state`, `mode`, `scenarios`, `compareIds`), `chart-prefs.js` (the chart display preferences), `tax-factors.js` (`histTaxFactors`). `src/shared/ui/storage.js` holds the storage keys and the localStorage probe. `src/us/core/` holds US-only state (`tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`). `src/package.json` makes `src/` ES modules and defines the `#country/*` alias (below).
- `tests/state_modules.js` (the state modules in plain Node), `tests/country_contract.js` (the `#country` seam contract), `tests/closure_names.js` (no undeclared name in either `main.js`).
```
2. Replace the three lines
```
- `chartView`/`mode`/`logScale`/`mcPathCount`/`chartShiftMode`/
  `chartGapPartner` (declared together near `normalizeState`) are all
  plain closure variables, not `state` fields — chart-display preferences
```
with
```
- `chartView`/`mode`/`logScale`/`mcPathCount`/`chartShiftMode`/
  `chartGapPartner` (live bindings exported by `src/shared/core/chart-prefs.js`
  and `store.js`; assign them through `assign<Name>`) are all
  plain module variables, not `state` fields — chart-display preferences
```
3. Add a new section directly before "## US vs. Canada: same shape, different names, not a find-and-replace":
```
## Shared state and country seams (stage 1 of the module split)

- **Cross-module mutable state lives in modules, not in the closure.** `state`, `mode`, `scenarios` and `compareIds` are in
  `src/shared/core/store.js`; the nine chart preferences in `chart-prefs.js`; `histTaxFactors` in `tax-factors.js`. `main.js` and
  the shared fragments import them and read them as before. **To change one, call its `assign<Name>` function** (`assignState`,
  `assignMode`, `assignLogScale`, ...): assigning to an import is a build error (`Cannot assign to import`). The names are
  `assign…` because `set…` is taken by UI handlers (`setMode`, `setChartView`) that do more than assign. A new binding that
  more than one future module will write belongs in one of these modules (or a new one next to them), not in `main.js`.
- **US-only state** is in `src/us/core/`: `cliffPlanStore` (`.plan`, `.key`, `.report`, `.forState`, `.year`, `.overrides`,
  `.computed`, `.computes`: the fields the "Per-year solver and the cliff plan" bullet above calls `cliffPlan`, `cliffPlanKey`,
  `cliffPlanReport`, `cliffPlanState`, `cliffPlanYear`, `cliffPlanOverrides`, `cliffPlanComputed`, `cliffPlanComputes`),
  `optimizerState` (`.rothBracketByAge` = the older `rothBracketOverrideByAge`, `.withdrawalMixByAge` =
  `withdrawalMixOverrideByAge`, `.lastMultiLeverRun`, `.rothPerYearEvalBudget`), `testHooks` (the test-only counters) and
  `currentYear` (`assignCurrentYear`).
- **Country seams: shared code imports country code as `#country/<name>`.** `src/package.json` maps it to `src/us/<name>.js` or
  `src/canada/<name>.js`; `scripts/build.js` passes the planner's name as the esbuild condition (a build without it fails with
  `Could not resolve "#country/..."`), and plain Node resolves it with `--conditions=us|canada`. Both countries must provide
  the module and export the same names; `tests/country_contract.js` checks this and only accepts named imports
  (`import { a, b } from '#country/<name>'`). The first seam is `#country/storage-key`, used by `src/shared/ui/storage.js`.
  To add a seam: create `src/us/<name>.js` and `src/canada/<name>.js`, import from `#country/<name>` in shared code, run
  `node tests/country_contract.js`.
- **Checks that guard this:** `tests/closure_names.js` fails on any name a `main.js` uses without declaring (esbuild does not
  report that; stage 1 edits remove declarations), `npm run analyze` regenerates `docs/superpowers/inventory/` (run it at the
  start of each later stage), and `src/**/core/` files must not touch `document`, `window`, `localStorage` or `navigator`.
```

- [ ] **Step 3: Mark stage 1 done in the spec**

In `docs/superpowers/specs/2026-10-10-modular-build-design.md`, in the staging list of section 6, replace `Designed in section 12.` at the end of the stage-1 item with `Designed in section 12; plan: docs/superpowers/plans/2026-10-12-stage1-foundations.md. DONE on branch tyler/stage1-foundations (the owner adds the merge date when merging).`

- [ ] **Step 4: Performance check against the starting tree**

The only hot-path change is that the US engine now bumps `testHooks.<counter>` (a property) where it bumped a variable. Measure it against a build of `main` taken before this branch:

```bash
git worktree add ../Fire-Planner-base main
(cd ../Fire-Planner-base && npm ci && npm run build)
node tests/bench_runs_interleaved.js --base ../Fire-Planner-base
```
Expected: the printed medians show the working tree within +5% of the base (CLAUDE.md's gate; wall-clock noise is about +-10%, so re-run once if it is over). Record the ratio in the commit message. Then clean up: `git worktree remove ../Fire-Planner-base`.

- [ ] **Step 5: Final checks and commit**

Run: `node tests/closure_analyzer.js && node tests/closure_names.js && node tests/country_contract.js && node tests/state_modules.js`
Expected: all OK. Run the full suite once more (background): `npm test > /tmp/stage1-final.log 2>&1; echo "exit $?" >> /tmp/stage1-final.log`. Expected `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add CLAUDE.md docs/superpowers
git commit -m "Docs: stage 1 shared state and country seams; regenerated closure inventory" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Definition of done

- `npm test` is green and `git diff <BASE> --stat -- tests/snapshots` is empty.
- `npm run build` produces the same two single-file planners (classic IIFE, `"use strict"` first); `dist/` stays ignored.
- The US closure inventory lists 24 mutable bindings and Canada's 25, none of them the moved ones; its unknown-names section reads `None.`.
- `tests/country_contract.js`, `tests/state_modules.js`, `tests/closure_names.js` and `tests/closure_analyzer.js` pass and are in the `npm test` chain.
- `CLAUDE.md` describes the store modules, the `assign…` rule, the US-only state objects and the `#country/*` seam; the spec marks stage 1 done.
- The interleaved benchmark shows the working tree within +5% of the pre-branch build.

## Follow-up

Stage 2 (shared fragments become modules, leaf-first, deleting `sync-shared.js` with the last) is planned from the regenerated inventory: its first inputs are the remaining module-private bindings, the deferred `theme` / `hasPersonalizedData` / `setMobileView`, and the "Shared regions" table's `(country)` entries, which are now `store.js` / `chart-prefs.js` / `tax-factors.js` imports or `#country/…` seams.
