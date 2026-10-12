# Stage 2 Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an analyzer-driven tool that moves top-level units out of the two planners' `main.js` into modules, turn the shared stylesheet and HTML partials into build-time includes, and use the tool to extract the first four dependency layers (about two thirds of the code).

**Architecture:** `scripts/lib/extraction-plan.js` computes, from the closure analyzer's model, which units can move and groups them into modules in three batches; `scripts/lib/extract-units.js` applies a batch (cuts the unit text, writes the module with the right exports and imports, fixes `main.js` and the `shared/` fragments, verifies, and writes nothing on any problem). The plan is committed once as a manifest and applied batch by batch, each batch ending with the full suite and a review. The stylesheet and the HTML partials stop being marker regions and become files the build includes.

**Tech Stack:** Node 22 (CI) / 24 (local), esbuild 0.28, espree + eslint-scope (existing, analysis only), Playwright (existing tests).

**Spec:** `docs/superpowers/specs/2026-10-10-modular-build-design.md`, section 13 (and sections 3-6, 12).

**Rehearsed:** every file and command below was run end to end in a scratch worktree of `main` at `ec1e56c`; the full `npm test` passed on the resulting tree (115 modules, 308 US and 160 Canada units moved, `main.js` down to about 9,160 US and 6,300 Canada lines).

## Global Constraints

- Output is a classic IIFE `<script>`, not `type="module"` (spec section 2). `dist/` is gitignored; edit `src/`, `shared/` and `scripts/`, never `dist/`.
- No behavior change: numeric output must not move. `tests/snapshots/*.json` stay byte-identical. `npm run snapshot:update` is not used anywhere in this plan.
- Nothing under `src/**/core/` references `document`, `window`, `localStorage` or `navigator` (spec section 3, rule 1); `src/**/ui/` is where DOM code goes.
- US and Canada never import from each other; both import from `src/shared/` (spec section 3, rule 4).
- `src/` stays plain ESM: no esbuild-only features (spec section 3, rule 5).
- Code moves verbatim: the extraction tool changes only `export` keywords and import lines, never the text of a unit. Side-effect statements are never moved (execution order).
- The build runs on Windows and Linux (CI: ubuntu-latest, Node 22). Every tool that reads sources normalizes CRLF to LF on read.
- `sync-shared.js` keeps working until the last shared region leaves `main.js`: `node scripts/sync-shared.js --check` must pass at the end of every task.
- Docs are updated in the stage that changes them (Task 11). Never `--no-verify`. Text files end with a newline. Stop after 3 failed attempts at one step and reassess.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; the commands below pass it as a second `-m`.
- Run commands in Git Bash. Node is not on the Git Bash PATH here: start each session with `export PATH="$PATH:/c/Program Files/nodejs"`. Create files that contain backslashes or regexes with the Write tool (read an existing file with the Read tool first before overwriting it), never with shell heredocs or sed: this environment's shell tool collapses double backslashes. Scratch scripts go in the session scratchpad directory, never in the repo.
- Editing `package.json`'s `test` script: use the JSON-aware command given in each task (earlier plans lost the space after `&&` with plain text replacement). After every such edit run `node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"`; it must print `ok`.

## Review Focus

Failure modes the spec implies but no happy-path test exercises, most likely first. Each has a pin in the task named.

1. **Initialization order.** A moved `const` whose initializer does real work (reads the DOM, calls a function) now runs when its module is evaluated, which is before the rest of `main.js`'s body. The planner only moves a unit when every unit it depends on has moved too, so its inputs are modules; the residual risk is a hidden dependency through a side effect. Pinned by the full suite at the end of every batch, in particular `tests/snapshot_ui.js` (it fails on any page error at load) and the golden and snapshot projections.
2. **A data block read by a generator.** `gen-state-rules`, `gen-province-rules` and `gen-benefit-rules` scrape `// NAME:begin ... // NAME:end` out of source files; moving the block must carry both markers and the generators must find it. Pinned by `tests/marker_source.js` and the "data block" cases of `tests/extract_units.js` (Tasks 2 and 4), and by `gen-*-rules --check` in the suite after batches 0 and 1.
3. **Comments lost when a region empties.** A comment inside a shared region that belongs to no unit is dropped with the region. The tool reports each case as a warning; every batch task requires the warning list to be empty or reviewed. Pinned by the `warnings` assertion in `tests/extract_units.js` and the batch steps.
4. **The built HTML changing beyond what was intended.** The partials and the stylesheet conversion must change the built files only by removing the marker comments. Pinned by the before/after diff in Task 6, step 6 (exactly 24 removed lines, nothing else).
5. **The manifest going stale.** The manifest is generated once from the current source; if `main.js` changes before a batch is applied, unit labels or text no longer match. The tool refuses (unknown unit, text mismatch between planners) and writes nothing; pinned by the refusal cases in `tests/extract_units.js`.

## File Structure

Created:
- `scripts/lib/extraction-plan.js` - `planExtraction(root, { maxLayer, names })` (Task 3).
- `scripts/lib/extract-units.js` - `applyModules(root, modules, { dryRun })` (Task 4).
- `scripts/lib/marker-source.js` - `findMarkerSource(root, country, name)` (Task 2).
- `scripts/plan-extraction.js`, `scripts/extract-units.js` - the two command-line wrappers (Tasks 3, 4).
- `scripts/extractions/names.json`, `scripts/extractions/stage2.json` - module-name overrides and the generated manifest (Task 7).
- `tests/marker_source.js`, `tests/extraction_plan.js`, `tests/extract_units.js`, `tests/core_purity.js` (Tasks 2-5).
- `src/shared/styles/styles.css`, `src/shared/partials/<name>.html` x 11 (Task 6).
- About 115 modules under `src/shared/core|ui/` and `src/<country>/core|ui/` (Tasks 8-10).
- `docs/superpowers/inventory/stage2-region-map.md` (Task 11).

Modified: `scripts/analyze-closure.js`, `scripts/lib/assemble-html.js`, `scripts/build.js`, `scripts/sync-shared.js`, the three `scripts/gen-*-rules.js`, `src/us/main.js`, `src/canada/main.js`, `src/us/index.html`, `src/canada/index.html`, `shared/*.js` fragments (shrinking), `tests/closure_analyzer.js`, `tests/closure_names.js`, `tests/assemble_html.js`, `tests/build_output.js`, `package.json`, `CLAUDE.md`, `README.md`, the spec, the three generated `docs/*-rules.md`, and the regenerated `docs/superpowers/inventory/closure-*.md`.

Deleted: `src/us/styles.css`, `src/canada/styles.css`, `shared/styles.css`, `shared/html-*.html` (Task 6); `shared/<region>.js` fragments whose region is emptied (Tasks 8-10).

---

### Task 0: Preflight

**Files:** none changed.

- [ ] **Step 1: Confirm the branch and a clean tree**

Run: `git branch --show-current && git status --short`
Expected: `tyler/stage2-fragments`, and no output from `git status`. (If the plan file shows as uncommitted, commit it first: `git add docs/superpowers && git commit -m "Plan: stage 2 extraction" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`.)

- [ ] **Step 2: Green baseline**

Run (background, about 4.5 minutes; the foreground limit is 10 minutes): `npm test > /tmp/stage2-baseline.log 2>&1; echo "exit $?" >> /tmp/stage2-baseline.log`
Expected: the last line is `exit 0`. Then `git rev-parse HEAD`; write the hash down as `BASE`.

---

### Task 1: The analyzer reports imports, undeclared names and browser-global use

**Files:**
- Modify: `scripts/analyze-closure.js`, `tests/closure_analyzer.js`

**Interfaces:**
- Produces: `analyze(code)` gains `imports: [{ local, imported, source }]`, `importDecls: [{ startLine, endLine, source }]` and, per unit, `importUses: [localName]` (the module-level import bindings that unit references).
- Produces: `undeclaredNames(code) => [{ name, line }]` for any module (names used but neither declared, imported, a built-in nor a browser global).
- Produces: `domGlobalsUsed(code) => [{ name, line }]` (browser globals such as `document` used as free names; shadowing locals, comments and strings do not count).

- [ ] **Step 1: Write the failing test**

In `tests/closure_analyzer.js`, change the second `require` line

```js
const { analyze, render } = require('../scripts/analyze-closure');
```

to

```js
const { analyze, render, undeclaredNames, domGlobalsUsed } = require('../scripts/analyze-closure');
```

and insert this block immediately before the final line `console.log('closure_analyzer OK');`:

```js
// Import bindings: which unit uses which, the import list and the declarations' line ranges.
const imp = analyze(`import { a, b as c } from './x.js';
(() => {
  const u = a + c;
  function v() {
    return 1;
  }
})();
`);
assert.deepStrictEqual(imp.imports, [
  { local: 'a', imported: 'a', source: './x.js' },
  { local: 'c', imported: 'b', source: './x.js' },
]);
assert.deepStrictEqual(imp.units.find((u) => u.label === 'u').importUses, ['a', 'c']);
assert.deepStrictEqual(imp.units.find((u) => u.label === 'v').importUses, []);
assert.deepStrictEqual(imp.importDecls, [{ startLine: 1, endLine: 1, source: './x.js' }]);

// undeclaredNames works on any module, not only an IIFE file; browser globals and imports are not "undeclared".
assert.deepStrictEqual(
  undeclaredNames("import { a } from './x.js';\nexport const f = () => a + missing + document.title;\n").map((x) => x.name),
  ['missing'],
);

// domGlobalsUsed counts free uses only (a parameter called `document` and a comment are not uses).
assert.deepStrictEqual(
  domGlobalsUsed('const f = (document) => document.title;\nexport const g = () => window.x + localStorage.y; // document\n').map((x) => x.name),
  ['window', 'localStorage'],
);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/closure_analyzer.js`
Expected: FAIL with `TypeError: undeclaredNames is not a function` (or `imp.imports` being `undefined`).

- [ ] **Step 3: Implement it in `scripts/analyze-closure.js`**

Make these five edits (each `old` string appears exactly once; use the Edit tool).

Edit 1. In the `units` map inside `analyze`, replace

```js
    dom: new Set(),
    ui: false,
    region: null,
  }));
```

with

```js
    dom: new Set(),
    importUses: new Set(), // local names of module-level import bindings this unit references
    ui: false,
    region: null,
  }));
```

Edit 2. Replace

```js
  const unknownGlobals = new Map();
  const implicitGlobalWrites = [];
  for (const ref of scopeManager.globalScope.through) {
```

with

```js
  // Module-level import bindings: which unit uses which, and the import declarations themselves.
  const moduleScope = scopeManager.scopes.find((s) => s.type === 'module');
  const imports = [];
  for (const v of moduleScope ? moduleScope.variables : []) {
    const def = v.defs[0];
    if (!def || def.type !== 'ImportBinding') continue;
    const spec = def.node;
    imports.push({
      local: v.name,
      imported: spec.type === 'ImportSpecifier' ? spec.imported.name : spec.type === 'ImportDefaultSpecifier' ? 'default' : '*',
      source: def.parent.source.value,
    });
    for (const ref of v.references) {
      const user = unitAt(ref.identifier.range[0]);
      if (user) user.importUses.add(v.name);
    }
  }
  const importDecls = ast.body
    .filter((n) => n.type === 'ImportDeclaration')
    .map((n) => ({ startLine: n.loc.start.line, endLine: n.loc.end.line, source: n.source.value }));

  const unknownGlobals = new Map();
  const implicitGlobalWrites = [];
  for (const ref of scopeManager.globalScope.through) {
```

Edit 3. In the returned `units`, replace

```js
      dom: [...u.dom].sort(),
      ui: u.ui,
```

with

```js
      dom: [...u.dom].sort(),
      importUses: [...u.importUses].sort(),
      ui: u.ui,
```

Edit 4. Replace

```js
    unknownGlobals: [...unknownGlobals.values()],
    implicitGlobalWrites,
    regions,
  };
}
```

with

```js
    unknownGlobals: [...unknownGlobals.values()],
    implicitGlobalWrites,
    regions,
    imports,
    importDecls,
  };
}

// Names a module (or a file whose code sits in an IIFE) uses without declaring or importing them and
// that are not built-ins or browser globals. [{ name, line }]
function undeclaredNames(code) {
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'module' });
  const out = [];
  for (const ref of scopeManager.globalScope.through) {
    const name = ref.identifier.name;
    if (DOM_GLOBALS.has(name) || KNOWN_GLOBALS.has(name)) continue;
    out.push({ name, line: ref.identifier.loc.start.line });
  }
  return out;
}
```

Edit 5. Replace

```js
module.exports = { analyze, render };
```

with

```js
// Browser globals (document, window, localStorage, ...) a module uses without declaring them. [{ name, line }]
// Resolved through scope analysis, so comments, strings and shadowing local names are not counted.
function domGlobalsUsed(code) {
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'module' });
  return scopeManager.globalScope.through
    .filter((ref) => DOM_GLOBALS.has(ref.identifier.name))
    .map((ref) => ({ name: ref.identifier.name, line: ref.identifier.loc.start.line }));
}

module.exports = { analyze, render, undeclaredNames, domGlobalsUsed };
```

- [ ] **Step 4: Verify**

Run: `node tests/closure_analyzer.js && node tests/closure_names.js && node scripts/analyze-closure.js && git status --short docs/superpowers/inventory`
Expected: `closure_analyzer OK`, `closure_names OK`, the two summary lines of the CLI, and no output from `git status` (the new fields must not change the committed reports).

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze-closure.js tests/closure_analyzer.js
git commit -m "Tooling: the closure analyzer reports imports, undeclared names and browser-global use" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The generators find their data blocks wherever they live

The rules generators scrape `// NAME:begin ... // NAME:end` blocks out of `main.js`. Once a block is extracted into a module they must find it there.

**Files:**
- Create: `scripts/lib/marker-source.js`, `tests/marker_source.js`
- Modify: `scripts/gen-state-rules.js`, `scripts/gen-province-rules.js`, `scripts/gen-benefit-rules.js`, `package.json`

**Interfaces:**
- Produces: `findMarkerSource(root, country, name) => { file, text }`: the one file under `src/<country>/` that contains `// <name>:begin` on a line of its own; `file` is repo-relative with forward slashes; `text` has CRLF normalized and any leading `export ` removed so the block can be evaluated as a script. Throws unless exactly one file matches.

- [ ] **Step 1: Write the failing test**

Create `tests/marker_source.js`:

```js
// Tests for scripts/lib/marker-source.js (plain Node, fixture trees in tmp).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findMarkerSource } = require('../scripts/lib/marker-source');

const made = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-source-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}

try {
  const BLOCK = ['  // RULES:begin', '  export const RULES = { a: 1 };', '  // RULES:end', ''].join('\n');

  // The block can sit in main.js or in a module; `export` is removed so the text can be evaluated as a script.
  let root = tree({ 'src/us/main.js': `(() => {\n${BLOCK}})();\n`, 'src/us/core/other.js': 'export const x = 1;\n' });
  let found = findMarkerSource(root, 'us', 'RULES');
  assert.strictEqual(found.file, 'src/us/main.js');
  assert.ok(found.text.includes('  const RULES = { a: 1 };') && !found.text.includes('export'));

  root = tree({ 'src/us/main.js': '(() => {})();\n', 'src/us/core/rules.js': BLOCK });
  found = findMarkerSource(root, 'us', 'RULES');
  assert.strictEqual(found.file, 'src/us/core/rules.js');
  assert.strictEqual(found.text, BLOCK.replace('export ', ''));

  // A comment that merely mentions the marker is not a marker; the other planner's files are not searched.
  root = tree({
    'src/us/main.js': '// the block between `RULES:begin` and `RULES:end`\n',
    'src/canada/main.js': BLOCK,
  });
  assert.throws(() => findMarkerSource(root, 'us', 'RULES'), /expected exactly one file under src\/us\/ .* found 0/);
  assert.strictEqual(findMarkerSource(root, 'canada', 'RULES').file, 'src/canada/main.js');

  // Two files with the same marker is an error, not a guess.
  root = tree({ 'src/us/main.js': BLOCK, 'src/us/core/rules.js': BLOCK });
  assert.throws(() => findMarkerSource(root, 'us', 'RULES'), /found 2/);

  console.log('marker_source OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/marker_source.js`
Expected: FAIL with `Cannot find module '../scripts/lib/marker-source'`.

- [ ] **Step 3: Implement the helper**

Create `scripts/lib/marker-source.js`:

```js
'use strict';
// Finds the source file that holds a `// NAME:begin ... // NAME:end` data block (STATE_RULES, PROVINCE_RULES, ...)
// under src/<country>/, wherever it lives (main.js, or a module once the block was extracted), and returns its text
// with any leading `export ` removed so the block can be evaluated as a plain script.
const fs = require('fs');
const path = require('path');

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function findMarkerSource(root, country, name) {
  const begin = new RegExp(`^\\s*// ${name}:begin\\s*$`, 'm');
  const hits = listJsFiles(path.join(root, 'src', country)).filter((file) => begin.test(fs.readFileSync(file, 'utf8')));
  if (hits.length !== 1) {
    throw new Error(`expected exactly one file under src/${country}/ with "// ${name}:begin", found ${hits.length}`);
  }
  const text = fs.readFileSync(hits[0], 'utf8').replace(/\r\n/g, '\n').replace(/^(\s*)export /gm, '$1');
  return { file: path.relative(root, hits[0]).split(path.sep).join('/'), text };
}

module.exports = { findMarkerSource };
```

Run: `node tests/marker_source.js`
Expected: `marker_source OK`.

- [ ] **Step 4: Point the three generators at it**

Write `patch-gens.js` in the session scratchpad directory (Write tool), then run it once from the repo root.

```js
// Points the three rules generators at whichever file holds their marker block.
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const gens = [
  { file: 'gen-state-rules.js', country: 'us', name: 'STATE_RULES', old: 'src/us/main.js' },
  { file: 'gen-province-rules.js', country: 'canada', name: 'PROVINCE_RULES', old: 'src/canada/main.js' },
  { file: 'gen-benefit-rules.js', country: 'canada', name: 'BENEFIT_RULES', old: 'src/canada/main.js' },
];
for (const g of gens) {
  const file = path.join(root, 'scripts', g.file);
  let s = fs.readFileSync(file, 'utf8');
  const rep = (from, to) => {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`${g.file}: expected 1 of ${from.slice(0, 70)}, found ${n}`);
    s = s.split(from).join(to);
  };
  rep(`const PLANNER = path.join(root, '${g.old}');`, `const { findMarkerSource } = require('./lib/marker-source');\nconst SOURCE = findMarkerSource(root, '${g.country}', '${g.name}');`);
  rep(`const html = norm(fs.readFileSync(PLANNER, 'utf8'));`, `const html = norm(SOURCE.text);`);
  rep(`'${g.name} markers not found in ${g.old}'`, '`' + g.name + ' markers not found in ${SOURCE.file}`');
  rep('in `' + g.old + '`; do not edit by hand.\');', 'in `\' + SOURCE.file + \'`; do not edit by hand.\');');
  fs.writeFileSync(file, s);
}
console.log('patched', gens.length);
```

Run: `node <scratchpad>/patch-gens.js`
Expected: `patched 3`.

Then update the comment at the top of each generator that names `src/us/main.js` / `src/canada/main.js` as the place the block lives: change `in src/us/main.js` to `in the planner source under src/us/` (and `src/canada/main.js` to `the planner source under src/canada/`) in the header comment of each of the three files (Edit tool; read each file's first ten lines first).

- [ ] **Step 5: Verify nothing changed yet and wire the test in**

Run: `node scripts/gen-state-rules.js --check && node scripts/gen-province-rules.js --check && node scripts/gen-benefit-rules.js --check`
Expected: all three exit 0 (the blocks are still in `main.js`, so the generators find them there and the docs are unchanged).

Add the test to the chain and check the spacing:

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));const parts=p.scripts.test.split(' && ');const i=parts.indexOf('node tests/state_modules.js');if(i<0)throw new Error('anchor missing');parts.splice(i+1,0,'node tests/marker_source.js');p.scripts.test=parts.join(' && ');fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"
git diff --stat package.json
```
Expected: `ok`, and `package.json | 2 +-`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/marker-source.js scripts/gen-state-rules.js scripts/gen-province-rules.js scripts/gen-benefit-rules.js tests/marker_source.js package.json
git commit -m "Tooling: the rules generators find their data blocks in whichever source file holds them" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The extraction planner

**Files:**
- Create: `scripts/lib/extraction-plan.js`, `scripts/plan-extraction.js`, `tests/extraction_plan.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `analyze` from Task 1 (`units[].label/names/kind/deps/ui/region/regionKind/importUses/startLine`, `mutables`, `imports`, `order`).
- Produces: `planExtraction(root, { maxLayer = 3, names = {} }) => { modules, stats }`.
  - `modules`: `[{ path, owner: 'shared' | 'us' | 'canada', depth, batch, ui, regions: [regionName], units: { us: [label], canada: [label] } }]`, sorted by batch, then depth, then path. `batch` is `min(depth, 2)`: modules in batch 0 import nothing from other planned modules, batch 1 only from batch 0, batch 2 from either.
  - `stats`: `{ us: { units, candidates, movable }, canada: { ... } }`.
  - `names` overrides module file names: `"<country>:<first unit label>"` for a country module, `"shared:<region>:core"` / `"shared:<region>:ui"` / `"shared:<region>"` for a shared one.
- Produces: `kebab(string)`.
- Produces: `node scripts/plan-extraction.js [--max-layer=N]` prints the plan as JSON, applying `scripts/extractions/names.json` when it exists.

- [ ] **Step 1: Write the failing test**

Create `tests/extraction_plan.js`:

```js
// Tests for scripts/lib/extraction-plan.js (plain Node, a fixture tree in tmp).
// The fixture is a miniature of the real layout: two planners with one shared region and some country code.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planExtraction, kebab } = require('../scripts/lib/extraction-plan');

const made = [];
function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

const SHARED_REGION = [
  '  // @@shared:helpers begin',
  '  // doubles a number',
  '  const twice = (n) => n * 2;',
  '  function addBase(n) {',
  '    return n + state.base;',
  '  }',
  '  // @@shared:helpers end',
];
const mainText = (rate, extra) =>
  [
    "import { state } from '../shared/core/store.js';",
    '(() => {',
    ...SHARED_REGION,
    '  // the country rate',
    `  const rate = ${rate};`,
    '  function tax(n) {',
    '    return twice(n) * rate + addBase(0);',
    '  }',
    ...extra,
    '  window.__out = tax(5);',
    '})();',
    '',
  ].join('\n');
const US_EXTRA = [
  '  let counter = 0;',
  '  function bump() {',
  '    counter++;',
  '  }',
  '  function isEven(n) {',
  '    return n === 0 ? true : isOdd(n - 1);',
  '  }',
  '  function isOdd(n) {',
  '    return n === 0 ? false : isEven(n - 1);',
  '  }',
];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-plan-'));
  made.push(root);
  write(root, 'src/package.json', '{ "private": true, "type": "module" }\n');
  write(root, 'src/shared/core/store.js', 'export const state = { base: 3 };\n');
  write(root, 'src/us/main.js', mainText('0.1', US_EXTRA));
  write(root, 'src/canada/main.js', mainText('0.2', []));
  write(root, 'shared/helpers.js', SHARED_REGION.slice(1, -1).join('\n') + '\n');
  return root;
}

try {
  assert.strictEqual(kebab('01-LIST_MAX'), 'list-max');
  assert.strictEqual(kebab('selfEmploymentTax'), 'self-employment-tax');

  const root = fixture();
  const plan = planExtraction(root, { maxLayer: 3 });
  const byPath = Object.fromEntries(plan.modules.map((m) => [m.path, m]));
  assert.deepStrictEqual(
    Object.keys(byPath).sort(),
    ['src/canada/core/rate.js', 'src/shared/core/helpers.js', 'src/us/core/is-even.js', 'src/us/core/rate.js'],
  );
  // The shared region becomes one shared module, with the same units in both planners.
  assert.deepStrictEqual(byPath['src/shared/core/helpers.js'].units, { us: ['twice', 'addBase'], canada: ['twice', 'addBase'] });
  assert.strictEqual(byPath['src/shared/core/helpers.js'].owner, 'shared');
  assert.deepStrictEqual(byPath['src/shared/core/helpers.js'].regions, ['helpers']);
  // Country code that depends on it comes in a later batch than it.
  assert.deepStrictEqual(byPath['src/us/core/rate.js'].units.us, ['rate', 'tax']);
  assert.ok(byPath['src/us/core/rate.js'].batch > byPath['src/shared/core/helpers.js'].batch);
  // Two functions that call each other are one cycle, so one module.
  assert.deepStrictEqual(byPath['src/us/core/is-even.js'].units.us.sort(), ['isEven', 'isOdd']);
  // A binding assigned elsewhere (`counter`, written by bump) and its writer stay, and so does a side-effect statement.
  const planned = JSON.stringify(plan.modules);
  assert.ok(!planned.includes('counter') && !planned.includes('bump'), 'a mutable binding and its writer must stay');
  assert.ok(!planned.includes('__out') && !planned.includes('statement@'), 'a side-effect statement must stay');
  // Names can be overridden.
  const renamed = planExtraction(root, { maxLayer: 3, names: { 'shared:helpers': 'math', 'us:rate': 'us-rate' } });
  assert.ok(renamed.modules.some((m) => m.path === 'src/shared/core/math.js'));
  assert.ok(renamed.modules.some((m) => m.path === 'src/us/core/us-rate.js'));
  // maxLayer limits how deep a unit may sit: `tax` depends on `twice`, so layer 0 holds only leaves.
  const shallow = planExtraction(root, { maxLayer: 0 });
  assert.ok(!JSON.stringify(shallow.modules).includes('"tax"'), 'a unit above the layer limit stays');

  console.log('extraction_plan OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/extraction_plan.js`
Expected: FAIL with `Cannot find module '../scripts/lib/extraction-plan'`.

- [ ] **Step 3: Implement the planner**

Create `scripts/lib/extraction-plan.js`:

```js
'use strict';
// Plans which top-level units can move out of src/<country>/main.js into modules (spec section 13).
//
// planExtraction(root, { maxLayer, names }) returns { modules, stats }:
//   modules: [{ path, owner: 'shared' | 'us' | 'canada', batch, depth, ui, units: { us: [label], canada: [label] } }]
//
// A unit is movable when it is not a side-effect statement, sits in layer <= maxLayer (the longest chain of
// dependencies down to a leaf, leaf = 0), does not declare a binding that is assigned elsewhere, and every unit it
// depends on is movable too (a fixpoint). A unit inside an @@shared region only moves when it is movable in both
// planners, depends only on shared units, and imports nothing from a country directory. Movable units are grouped
// into modules (a shared region = one module; a run of consecutive country-only units = one module); modules that
// import each other are merged, and the module graph is layered into batches by depth.
const fs = require('fs');
const path = require('path');
const { analyze } = require('../analyze-closure');

const COUNTRIES = ['us', 'canada'];

const kebab = (s) =>
  s
    .replace(/^\d+-/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

function stronglyConnected(nodeCount, edges) {
  let index = 0;
  const stack = [];
  const meta = new Map();
  const components = [];
  const visit = (v) => {
    const m = { index, low: index, onStack: true };
    index++;
    meta.set(v, m);
    stack.push(v);
    for (const w of edges[v]) {
      if (!meta.has(w)) {
        visit(w);
        m.low = Math.min(m.low, meta.get(w).low);
      } else if (meta.get(w).onStack) m.low = Math.min(m.low, meta.get(w).index);
    }
    if (m.low === m.index) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        meta.get(w).onStack = false;
        comp.push(w);
      } while (w !== v);
      components.push(comp);
    }
  };
  for (let v = 0; v < nodeCount; v++) if (!meta.has(v)) visit(v);
  return components; // dependencies first
}

function loadCountry(root, country) {
  const code = fs.readFileSync(path.join(root, 'src', country, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const model = analyze(code);
  const byLabel = new Map(model.units.map((u) => [u.label, u]));
  const compOf = new Map();
  model.order.forEach((comp, i) => comp.forEach((l) => compOf.set(l, i)));
  const depthOfComp = new Map();
  model.order.forEach((comp, i) => {
    let d = 0;
    for (const l of comp) for (const dep of byLabel.get(l).deps) {
      const j = compOf.get(dep);
      if (j !== i) d = Math.max(d, depthOfComp.get(j) + 1);
    }
    depthOfComp.set(i, d);
  });
  const mutableDeclarers = new Set(model.mutables.map((m) => m.declaredIn));
  const importSource = new Map(model.imports.map((i) => [i.local, path.resolve(root, 'src', country, i.source)]));
  const countryDir = path.join(root, 'src', country) + path.sep;
  return {
    model,
    byLabel,
    depth: (label) => depthOfComp.get(compOf.get(label)),
    mutableDeclarers,
    importsCountryCode: (u) => u.importUses.some((n) => (importSource.get(n) || '').startsWith(countryDir)),
  };
}

function planExtraction(root, { maxLayer = 3, names = {} } = {}) {
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const owner = (c, u) => (u.regionKind === 'shared' ? 'shared' : c);
  const isUi = (c, u) =>
    owner(c, u) === 'shared' ? COUNTRIES.some((cc) => info[cc].byLabel.get(u.label)?.ui) : u.ui;

  const movable = Object.fromEntries(COUNTRIES.map((c) => [c, new Set()]));
  const candidates = {};
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) {
      if (u.kind === 'statement') continue;
      if (info[c].depth(u.label) > maxLayer) continue;
      if (info[c].mutableDeclarers.has(u.label)) continue;
      movable[c].add(u.label);
    }
    candidates[c] = movable[c].size;
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      for (const label of [...movable[c]]) {
        const u = info[c].byLabel.get(label);
        let ok = u.deps.every((d) => movable[c].has(d));
        if (ok && owner(c, u) === 'shared') {
          ok =
            u.deps.every((d) => owner(c, info[c].byLabel.get(d)) === 'shared') &&
            !info[c].importsCountryCode(u) &&
            COUNTRIES.every((cc) => movable[cc].has(label));
        }
        if (!ok) {
          movable[c].delete(label);
          changed = true;
        }
      }
    }
  }

  // A data block (// NAME:begin ... // NAME:end, read by scripts/gen-*-rules.js) moves whole or not at all.
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      const blocks = new Map();
      for (const u of info[c].model.units) {
        if (u.regionKind !== 'data') continue;
        if (!blocks.has(u.region)) blocks.set(u.region, []);
        blocks.get(u.region).push(u.label);
      }
      for (const labels of blocks.values()) {
        if (labels.some((l) => !movable[c].has(l)) && labels.some((l) => movable[c].has(l))) {
          labels.forEach((l) => movable[c].delete(l));
          changed = true;
        }
      }
    }
  }
  const dataSideUi = new Map(); // "country:block" -> true when any unit of the block is ui
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) if (u.regionKind === 'data' && u.ui) dataSideUi.set(`${c}:${u.region}`, true);
  }

  // Group into module nodes.
  const nodes = []; // { owner, region?, units: { us: [], canada: [] } }
  const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const sharedByKey = new Map();
  for (const c of COUNTRIES) {
    const units = [...info[c].model.units].sort((a, b) => a.startLine - b.startLine);
    let run = null;
    for (const u of units) {
      const isMovable = movable[c].has(u.label);
      const side = (u.regionKind === 'data' ? dataSideUi.get(`${c}:${u.region}`) : isUi(c, u)) ? 'ui' : 'core';
      if (isMovable && owner(c, u) === 'shared') {
        const key = `${u.region}|${side}`;
        let node = sharedByKey.get(key);
        if (!node) {
          node = { owner: 'shared', region: u.region, units: { us: [], canada: [] } };
          sharedByKey.set(key, node);
          nodes.push(node);
        }
        node.units[c].push(u.label);
        nodeOf[c].set(u.label, node);
      } else if (isMovable) {
        if (!run) run = { core: null, ui: null };
        if (!run[side]) {
          run[side] = { owner: c, units: { us: [], canada: [] } };
          nodes.push(run[side]);
        }
        run[side].units[c].push(u.label);
        nodeOf[c].set(u.label, run[side]);
      } else if (u.kind !== 'statement') {
        run = null; // a unit that stays behind starts a new topic; side-effect statements stay but do not
      }
    }
  }

  // Module graph, merging modules that import each other.
  const index = new Map(nodes.map((n, i) => [n, i]));
  const edges = nodes.map(() => new Set());
  for (const n of nodes) {
    for (const c of COUNTRIES) {
      for (const label of n.units[c]) {
        for (const d of info[c].byLabel.get(label).deps) {
          const target = nodeOf[c].get(d);
          if (target && target !== n) edges[index.get(n)].add(index.get(target));
        }
      }
    }
  }
  const comps = stronglyConnected(nodes.length, edges);
  const compId = new Map();
  comps.forEach((comp, i) => comp.forEach((v) => compId.set(v, i)));
  const merged = comps.map((comp) => {
    const members = comp.map((v) => nodes[v]);
    const owners = new Set(members.map((m) => m.owner));
    if (owners.size > 1) throw new Error(`module cycle across owners: ${[...owners].join(', ')}`);
    const unitsOf = (c) =>
      members
        .flatMap((m) => m.units[c])
        .sort((a, b) => info[c].byLabel.get(a).startLine - info[c].byLabel.get(b).startLine);
    return { owner: members[0].owner, regions: members.map((m) => m.region).filter(Boolean), units: { us: unitsOf('us'), canada: unitsOf('canada') } };
  });
  const mergedEdges = merged.map(() => new Set());
  edges.forEach((targets, v) => targets.forEach((w) => { if (compId.get(v) !== compId.get(w)) mergedEdges[compId.get(v)].add(compId.get(w)); }));

  // Depth of each merged module (comps are already dependencies-first).
  const depth = merged.map(() => 0);
  merged.forEach((m, i) => mergedEdges[i].forEach((w) => { depth[i] = Math.max(depth[i], depth[w] + 1); }));

  // Names and paths.
  const used = new Set();
  const modules = merged.map((m, i) => {
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    const ui = countries.some((c) => m.units[c].some((l) => info[c].byLabel.get(l).ui));
    const first = m.owner === 'shared' ? null : info[m.owner].byLabel.get(m.units[m.owner][0]);
    const side = ui ? 'ui' : 'core';
    const base =
      m.owner === 'shared'
        ? names[`shared:${m.regions[0]}:${side}`] || names[`shared:${m.regions[0]}`] || kebab(m.regions[0])
        : names[`${m.owner}:${m.units[m.owner][0]}`] || kebab(first.names[0] || m.units[m.owner][0]);
    const dir = m.owner === 'shared' ? 'src/shared' : `src/${m.owner}`;
    let p = `${dir}/${ui ? 'ui' : 'core'}/${base}.js`;
    for (let n = 2; used.has(p); n++) p = `${dir}/${ui ? 'ui' : 'core'}/${base}-${n}.js`;
    used.add(p);
    return { path: p, owner: m.owner, depth: depth[i], batch: Math.min(depth[i], 2), ui, regions: m.regions, units: m.units };
  });
  modules.sort((a, b) => a.batch - b.batch || a.depth - b.depth || a.path.localeCompare(b.path));

  const total = (c) => info[c].model.units.length;
  const moved = (c) => modules.filter((m) => m.owner === 'shared' || m.owner === c).reduce((s, m) => s + m.units[c].length, 0);
  return {
    modules,
    stats: Object.fromEntries(COUNTRIES.map((c) => [c, { units: total(c), candidates: candidates[c], movable: moved(c) }])),
  };
}

module.exports = { planExtraction, kebab };
```

Run: `node tests/extraction_plan.js`
Expected: `extraction_plan OK`.

- [ ] **Step 4: The command-line wrapper**

Create `scripts/plan-extraction.js`:

```js
#!/usr/bin/env node
'use strict';
// Prints the extraction plan (the manifest of modules and their batches) as JSON.
//   node scripts/plan-extraction.js [--max-layer=3] > scripts/extractions/stage2.json
// Module names can be overridden in scripts/extractions/names.json: "shared:<region>" or "<country>:<first unit label>".
const fs = require('fs');
const path = require('path');
const { planExtraction } = require('./lib/extraction-plan');

const root = path.join(__dirname, '..');
const namesFile = path.join(root, 'scripts', 'extractions', 'names.json');
const names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
const layerArg = process.argv.find((a) => a.startsWith('--max-layer='));
const plan = planExtraction(root, { maxLayer: layerArg ? Number(layerArg.split('=')[1]) : 3, names });
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
```

Run: `node scripts/plan-extraction.js > /tmp/plan-check.json && node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log(p.modules.length, JSON.stringify(p.stats))" /tmp/plan-check.json`
Expected: `115 {"us":{"units":693,"candidates":349,"movable":308},"canada":{"units":443,"candidates":208,"movable":160}}` (the module count is 115 only with the names file of Task 7 absent or present; the stats are the check). If the numbers differ, the source has changed since this plan was written: stop and report.

- [ ] **Step 5: Wire in and commit**

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));const parts=p.scripts.test.split(' && ');const i=parts.indexOf('node tests/marker_source.js');if(i<0)throw new Error('anchor missing');parts.splice(i+1,0,'node tests/extraction_plan.js');p.scripts.test=parts.join(' && ');fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"
node tests/extraction_plan.js
git add scripts/lib/extraction-plan.js scripts/plan-extraction.js tests/extraction_plan.js package.json
git commit -m "Tooling: the extraction planner (movable units, modules, batches)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `ok`, `extraction_plan OK`.

---

### Task 4: The extraction tool

**Files:**
- Create: `scripts/lib/extract-units.js`, `scripts/extract-units.js`, `tests/extract_units.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `planExtraction` (Task 3), `analyze` and `undeclaredNames` (Task 1).
- Produces: `applyModules(root, modules, { dryRun = false }) => { modules: [{ path, owner, units, exports }], moved: { us, canada }, deletedRegions: [name], warnings: [text] }`. `modules` are manifest entries (`path`, `owner`, `units`). Throws, writing nothing, when: a unit does not exist, is a side-effect statement, is in two modules, declares a binding assigned outside its module, a shared unit is not in a shared region or reads differently in the two planners, a module depends on a unit that stays in `main.js`, a module imports country code from shared code, the modules import each other in a cycle, a `// NAME:begin`/`end` data block would be split, the module path exists, or the result has an undeclared name or a wrong unit count.
- Produces: `node scripts/extract-units.js --manifest <file> --batch <n> [--dry-run]`.

- [ ] **Step 1: Write the failing test**

Create `tests/extract_units.js`:

```js
// Tests for scripts/lib/extract-units.js (plain Node, fixture trees in tmp).
// The fixtures are miniatures of the real layout: two planners, one shared region, some country code. After every
// extraction the planners are bundled the way the build does and must produce what they produced before.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { planExtraction } = require('../scripts/lib/extraction-plan');
const { applyModules } = require('../scripts/lib/extract-units');

const made = [];
function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const newRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-units-'));
  made.push(root);
  write(root, 'src/package.json', '{ "private": true, "type": "module" }\n');
  write(root, 'src/shared/core/store.js', 'export const state = { base: 3 };\n');
  return root;
};

const SHARED_REGION = [
  '  // @@shared:helpers begin',
  '  // doubles a number',
  '  const twice = (n) => n * 2;',
  '  function addBase(n) {',
  '    return n + state.base;',
  '  }',
  '  // @@shared:helpers end',
];
const mainText = (rate, extra) =>
  [
    "import { state } from '../shared/core/store.js';",
    '(() => {',
    ...SHARED_REGION,
    '  // the country rate',
    `  const rate = ${rate};`,
    '  function tax(n) {',
    '    return twice(n) * rate + addBase(0);',
    '  }',
    ...extra,
    '  window.__out = tax(5);',
    '})();',
    '',
  ].join('\n');
const US_EXTRA = [
  '  let counter = 0;',
  '  function bump() {',
  '    counter++;',
  '  }',
  '  function isEven(n) {',
  '    return n === 0 ? true : isOdd(n - 1);',
  '  }',
  '  function isOdd(n) {',
  '    return n === 0 ? false : isEven(n - 1);',
  '  }',
];
function fixture() {
  const root = newRoot();
  write(root, 'src/us/main.js', mainText('0.1', US_EXTRA));
  write(root, 'src/canada/main.js', mainText('0.2', []));
  write(root, 'shared/helpers.js', SHARED_REGION.slice(1, -1).join('\n') + '\n');
  return root;
}

// A data block (// NAME:begin ... // NAME:end) with two units, plus a user of it.
const dataMain = (extra) =>
  [
    '(() => {',
    '  // RULES:begin',
    '  const A = 1;',
    '  const B = A + 1;',
    '  // RULES:end',
    '  function useRules() {',
    '    return A + B;',
    '  }',
    ...extra,
    '  window.__out = useRules();',
    '})();',
    '',
  ].join('\n');
function dataFixture() {
  const root = newRoot();
  write(root, 'src/us/main.js', dataMain([]));
  write(root, 'src/canada/main.js', dataMain([]));
  return root;
}

// Bundles a planner the way the build does and returns what it leaves in window.__out.
async function run(root, country) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src', country, 'main.js')],
    bundle: true,
    write: false,
    format: 'iife',
    logLevel: 'silent',
    outfile: 'out.js',
  });
  const window = {};
  vm.runInNewContext(result.outputFiles[0].text, { window });
  return window.__out;
}
const both = async (root) => ({ us: await run(root, 'us'), canada: await run(root, 'canada') });

(async () => {
  // ---- applying a plan keeps the programs' behavior and writes the expected files
  let root = fixture();
  const before = await both(root);
  const plan = planExtraction(root, { maxLayer: 3 });
  const report = applyModules(root, plan.modules);
  assert.deepStrictEqual(report.deletedRegions, ['helpers']);
  assert.deepStrictEqual(report.warnings, []);
  assert.deepStrictEqual(report.moved, { us: 6, canada: 4 });
  assert.strictEqual(
    read(root, 'src/shared/core/helpers.js'),
    [
      "import { state } from './store.js';",
      '',
      '  // doubles a number',
      '  export const twice = (n) => n * 2;',
      '  export function addBase(n) {',
      '    return n + state.base;',
      '  }',
      '',
    ].join('\n'),
  );
  assert.strictEqual(
    read(root, 'src/us/core/rate.js'),
    [
      "import { addBase, twice } from '../../shared/core/helpers.js';",
      '',
      '  // the country rate',
      '  const rate = 0.1;',
      '  export function tax(n) {',
      '    return twice(n) * rate + addBase(0);',
      '  }',
      '',
    ].join('\n'),
  );
  const usMain = read(root, 'src/us/main.js');
  assert.ok(usMain.startsWith("import { tax } from './core/rate.js';\n(() => {"), usMain.split('\n').slice(0, 3).join('|'));
  assert.ok(usMain.includes('let counter = 0;') && usMain.includes('function bump()'), 'units that stay are untouched');
  assert.ok(!usMain.includes('@@shared:helpers'), 'the emptied region is gone from main.js');
  assert.ok(!fs.existsSync(path.join(root, 'shared/helpers.js')), 'and its fragment');
  assert.deepStrictEqual(await both(root), before);

  // ---- a dry run writes nothing
  root = fixture();
  const dry = applyModules(root, planExtraction(root, { maxLayer: 3 }).modules, { dryRun: true });
  assert.strictEqual(dry.modules.length, 4);
  assert.ok(!fs.existsSync(path.join(root, 'src/shared/core/helpers.js')) && fs.existsSync(path.join(root, 'shared/helpers.js')));

  // ---- a data block travels with both of its markers
  root = dataFixture();
  const dataBefore = await both(root);
  applyModules(root, [{ path: 'src/us/core/rules.js', owner: 'us', units: { us: ['A', 'B'], canada: [] } }]);
  const rulesModule = read(root, 'src/us/core/rules.js');
  assert.ok(rulesModule.includes('// RULES:begin') && rulesModule.includes('// RULES:end'), rulesModule);
  assert.ok(!read(root, 'src/us/main.js').includes('RULES:'), 'no marker is left behind');
  assert.deepStrictEqual((await both(root)).us, dataBefore.us);

  // ---- refusals: each throws and writes nothing
  const refuse = (setup, modules, pattern) => {
    const r = setup();
    const snapshot = [read(r, 'src/us/main.js'), read(r, 'src/canada/main.js')];
    assert.throws(() => applyModules(r, modules), pattern);
    assert.deepStrictEqual([read(r, 'src/us/main.js'), read(r, 'src/canada/main.js')], snapshot, 'nothing is written on a refusal');
  };
  const statementLabel = (r) => `statement@${read(r, 'src/us/main.js').split('\n').findIndex((l) => l.includes('window.__out')) + 1}`;
  const one = (p, owner, us, canada = []) => [{ path: p, owner, units: { us, canada } }];
  refuse(fixture, one('src/us/core/x.js', 'us', [statementLabel(fixture())]), /side-effect statement/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['counter']), /assigned outside its module/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['tax']), /depends on "(rate|twice|addBase)", which stays/);
  refuse(fixture, one('src/shared/core/h.js', 'shared', ['twice'], ['addBase']), /shared unit lists differ/);
  refuse(fixture, one('src/shared/core/store.js', 'shared', ['twice'], ['twice']), /already exists/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['nope']), /has no unit "nope"/);
  refuse(
    fixture,
    [
      { path: 'src/us/core/a.js', owner: 'us', units: { us: ['isEven'], canada: [] } },
      { path: 'src/us/core/b.js', owner: 'us', units: { us: ['isOdd'], canada: [] } },
    ],
    /module import cycle/,
  );
  refuse(
    () => {
      const r = fixture();
      write(r, 'src/canada/main.js', read(r, 'src/canada/main.js').replace('n * 2', 'n * 3'));
      return r;
    },
    one('src/shared/core/h.js', 'shared', ['twice'], ['twice']),
    /differs between the two planners/,
  );
  refuse(
    dataFixture,
    [
      { path: 'src/us/core/a.js', owner: 'us', units: { us: ['A'], canada: [] } },
      { path: 'src/us/core/b.js', owner: 'us', units: { us: ['B'], canada: [] } },
    ],
    /data block RULES is split/,
  );

  console.log('extract_units OK');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/extract_units.js`
Expected: FAIL with `Cannot find module '../scripts/lib/extract-units'`.

- [ ] **Step 3: Implement the tool**

Create `scripts/lib/extract-units.js`:

```js
'use strict';
// Moves top-level units out of src/<country>/main.js into modules (spec section 13).
//
// applyModules(root, modules, { dryRun }) takes the modules of a plan (see extraction-plan.js):
//   [{ path: 'src/shared/core/pct.js', owner: 'shared' | 'us' | 'canada', units: { us: [label], canada: [label] } }]
// and, for each module, cuts its units (with the contiguous comment lines directly above each one, and a
// following `// NAME:end` data marker) out of main.js, writes the module with `export` on the names used elsewhere
// and the imports it needs, and adds to main.js the imports it now needs. A shared module is cut from both
// planners (the text must be identical) and its @@shared region fragment under shared/ is updated or deleted.
//
// Side-effect statements are never moved. Everything is verified before anything is written; on any problem it
// throws and writes nothing.
const fs = require('fs');
const path = require('path');
const { analyze, undeclaredNames } = require('../analyze-closure');

const COUNTRIES = ['us', 'canada'];
const SHARED_MARK = /^\s*\/\/ @@shared:(\S+) (begin|end)\s*$/;
const DATA_END = /^\s*\/\/ ([A-Z][A-Z_]*):end\s*$/;
const posix = (p) => p.split(path.sep).join('/');

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function loadCountry(root, country) {
  const file = path.join(root, 'src', country, 'main.js');
  const text = readText(file);
  const lines = text.split('\n');
  const model = analyze(text);
  const units = [...model.units].sort((a, b) => a.startLine - b.startLine);
  for (let i = 1; i < units.length; i++) {
    if (units[i].startLine <= units[i - 1].endLine) {
      throw new Error(`${country}: units "${units[i - 1].label}" and "${units[i].label}" share a source line`);
    }
  }
  const byLabel = new Map(units.map((u) => [u.label, u]));
  const chunks = new Map(); // label -> { start, end } (1-based, inclusive)
  units.forEach((u, i) => {
    const floor = i > 0 ? units[i - 1].endLine : 0;
    let start = u.startLine;
    while (
      start - 1 > floor &&
      /^\s*\/\//.test(lines[start - 2]) &&
      !SHARED_MARK.test(lines[start - 2]) &&
      !DATA_END.test(lines[start - 2]) // a "// NAME:end" marker belongs to the unit above it
    ) start--;
    let end = u.endLine;
    if (DATA_END.test(lines[end] || '')) end++; // the "// NAME:end" marker right after the unit
    chunks.set(u.label, { start, end });
  });
  return { country, file, lines, model, units, byLabel, chunks, mainDir: path.dirname(file) };
}

const chunkLines = (info, label) => {
  const { start, end } = info.chunks.get(label);
  return info.lines.slice(start - 1, end);
};

// "  const x = 1;" -> "  export const x = 1;" (the first line that is not a comment)
function addExport(lines) {
  const out = [...lines];
  const i = out.findIndex((l) => !/^\s*\/\//.test(l));
  const m = /^(\s*)((?:async\s+)?function\b|const\b|let\b|var\b|class\b)/.exec(out[i]);
  if (!m) throw new Error(`cannot export, unexpected declaration start: ${out[i].trim().slice(0, 60)}`);
  out[i] = out[i].replace(m[0], `${m[1]}export ${m[2]}`);
  return out;
}

const relImport = (fromFile, toFile) => {
  const rel = posix(path.relative(path.dirname(fromFile), toFile));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

function specText(spec) {
  return spec.imported === spec.local ? spec.local : `${spec.imported} as ${spec.local}`;
}

function importLine(specs, source) {
  return `import { ${specs.map(specText).join(', ')} } from '${source}';`;
}

function applyModules(root, modules, { dryRun = false } = {}) {
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const warnings = [];
  const files = new Map(); // absolute path -> text (null = delete)

  // ---- 1. which module takes which unit, per country
  const moduleOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const seenPaths = new Set();
  for (const m of modules) {
    if (seenPaths.has(m.path)) throw new Error(`module path used twice: ${m.path}`);
    seenPaths.add(m.path);
    if (fs.existsSync(path.join(root, m.path))) throw new Error(`${m.path} already exists`);
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    for (const c of countries) {
      if (!m.units[c] || !m.units[c].length) throw new Error(`${m.path}: no units for ${c}`);
      for (const label of m.units[c]) {
        const u = info[c].byLabel.get(label);
        if (!u) throw new Error(`${m.path}: ${c} has no unit "${label}"`);
        if (u.kind === 'statement') throw new Error(`${m.path}: "${label}" is a side-effect statement`);
        if (moduleOf[c].has(label)) throw new Error(`${c}: unit "${label}" is in two modules`);
        if (m.owner === 'shared' && u.regionKind !== 'shared') throw new Error(`${m.path}: "${label}" is not in a shared region`);
        moduleOf[c].set(label, m);
      }
    }
  }
  for (const c of COUNTRIES) {
    const declarers = new Set(info[c].model.mutables.map((x) => x.declaredIn));
    const writers = new Map(info[c].model.mutables.map((x) => [x.declaredIn, x.writers]));
    for (const [label, m] of moduleOf[c]) {
      if (!declarers.has(label)) continue;
      const outside = writers.get(label).filter((w) => moduleOf[c].get(w) !== m);
      if (outside.length) throw new Error(`${c}: "${label}" declares a binding assigned outside its module (${outside.join(', ')})`);
    }
  }

  // ---- 2. shared units must read identically in both planners
  for (const m of modules.filter((x) => x.owner === 'shared')) {
    if (m.units.us.join('\n') !== m.units.canada.join('\n')) throw new Error(`${m.path}: shared unit lists differ between planners`);
    for (const label of m.units.us) {
      const a = chunkLines(info.us, label).join('\n');
      const b = chunkLines(info.canada, label).join('\n');
      if (a !== b) throw new Error(`${m.path}: unit "${label}" differs between the two planners`);
    }
  }

  // ---- 3. what each module imports and exports
  const exportsNeeded = new Map(modules.map((m) => [m, new Set()]));
  const needs = new Map(); // module -> country -> Map(targetAbs -> Map(local -> imported))
  const addNeed = (m, c, target, local, imported) => {
    if (!needs.has(m)) needs.set(m, {});
    const byTarget = (needs.get(m)[c] = needs.get(m)[c] || new Map());
    if (!byTarget.has(target)) byTarget.set(target, new Map());
    byTarget.get(target).set(local, imported);
  };
  const mainImports = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()])); // targetAbs -> Set(names)

  for (const c of COUNTRIES) {
    const ci = info[c];
    const impByLocal = new Map(ci.model.imports.map((i) => [i.local, i]));
    for (const u of ci.units) {
      const m = moduleOf[c].get(u.label);
      for (const use of u.uses) {
        const target = moduleOf[c].get(use.unit);
        if (m && !target) throw new Error(`${m.path}: "${u.label}" depends on "${use.unit}", which stays in ${c}/main.js`);
        if (!target || target === m) continue;
        for (const name of use.names) exportsNeeded.get(target).add(name);
        if (m) for (const name of use.names) addNeed(m, c, path.join(root, target.path), name, name);
        else {
          const key = path.join(root, target.path);
          if (!mainImports[c].has(key)) mainImports[c].set(key, new Set());
          use.names.forEach((n) => mainImports[c].get(key).add(n));
        }
      }
      if (m) {
        for (const local of u.importUses) {
          const imp = impByLocal.get(local);
          const abs = path.resolve(ci.mainDir, imp.source);
          const otherCountry = COUNTRIES.find((cc) => cc !== c);
          if (m.owner === 'shared' && (abs.startsWith(path.join(root, 'src', c) + path.sep) || abs.startsWith(path.join(root, 'src', otherCountry) + path.sep))) {
            throw new Error(`${m.path}: "${u.label}" uses "${local}" from ${imp.source}, which is country code`);
          }
          addNeed(m, c, abs, local, imp.imported);
        }
      }
    }
  }
  const sameNeeds = (m) => {
    const render = (c) => JSON.stringify([...(needs.get(m)?.[c] || new Map())].map(([t, names]) => [t, [...names]]).sort());
    return render('us') === render('canada');
  };
  for (const m of modules.filter((x) => x.owner === 'shared')) {
    if (!sameNeeds(m)) throw new Error(`${m.path}: its imports differ between the two planners`);
  }

  // module import cycle check
  const edges = new Map(modules.map((m) => [m, new Set()]));
  for (const m of modules) {
    for (const c of m.owner === 'shared' ? COUNTRIES : [m.owner]) {
      for (const target of (needs.get(m)?.[c] || new Map()).keys()) {
        const t = modules.find((x) => path.join(root, x.path) === target);
        if (t && t !== m) edges.get(m).add(t);
      }
    }
  }
  const state = new Map();
  const walk = (m, trail) => {
    if (state.get(m) === 'done') return;
    if (state.get(m) === 'open') throw new Error(`module import cycle: ${[...trail, m].map((x) => x.path).join(' -> ')}`);
    state.set(m, 'open');
    edges.get(m).forEach((t) => walk(t, [...trail, m]));
    state.set(m, 'done');
  };
  modules.forEach((m) => walk(m, []));

  // ---- 4. write the modules
  for (const m of modules) {
    const c0 = m.owner === 'shared' ? 'us' : m.owner;
    const abs = path.join(root, m.path);
    const importLines = [];
    const byTarget = needs.get(m)?.[c0] || new Map();
    for (const [target, names] of [...byTarget].sort((a, b) => a[0].localeCompare(b[0]))) {
      const specs = [...names].map(([local, imported]) => ({ local, imported })).sort((a, b) => a.local.localeCompare(b.local));
      importLines.push(importLine(specs, relImport(abs, target)));
    }
    const body = [];
    for (const label of m.units[c0]) {
      let lines = chunkLines(info[c0], label);
      const u = info[c0].byLabel.get(label);
      if (u.names.some((n) => exportsNeeded.get(m).has(n))) lines = addExport(lines);
      body.push(...lines);
    }
    const text = [...importLines, ...(importLines.length ? [''] : []), ...body, ''].join('\n');
    // a data block's begin and end markers must travel together
    for (const name of new Set([...text.matchAll(/^\s*\/\/ ([A-Z][A-Z_]*):(begin|end)\s*$/gm)].map((x) => x[1]))) {
      const count = (kind) => [...text.matchAll(new RegExp(`^\\s*// ${name}:${kind}\\s*$`, 'gm'))].length;
      if (count('begin') !== count('end')) throw new Error(`${m.path}: data block ${name} is split`);
    }
    const bad = undeclaredNames(text);
    if (bad.length) throw new Error(`${m.path}: undeclared names ${bad.map((b) => `${b.name} (line ${b.line})`).join(', ')}`);
    files.set(abs, text);
  }

  // ---- 5. rewrite main.js (and the shared fragments)
  for (const c of COUNTRIES) {
    const ci = info[c];
    const remove = new Set();
    for (const [label] of moduleOf[c]) {
      const { start, end } = ci.chunks.get(label);
      for (let n = start; n <= end; n++) remove.add(n);
    }
    const remainingUnits = ci.units.filter((u) => !moduleOf[c].has(u.label));
    const usedLocals = new Set(remainingUnits.flatMap((u) => u.importUses));
    // imports: the ones still used, then the new ones
    const bySource = new Map();
    for (const imp of ci.model.imports) {
      if (!usedLocals.has(imp.local)) continue;
      if (!bySource.has(imp.source)) bySource.set(imp.source, []);
      bySource.get(imp.source).push({ local: imp.local, imported: imp.imported });
    }
    for (const [target, names] of mainImports[c]) {
      const source = relImport(ci.file, target);
      if (!bySource.has(source)) bySource.set(source, []);
      [...names].sort().forEach((n) => bySource.get(source).push({ local: n, imported: n }));
    }
    const decls = ci.model.importDecls;
    decls.forEach((d) => { for (let n = d.startLine; n <= d.endLine; n++) remove.add(n); });
    const importBlock = [...bySource].map(([source, specs]) => importLine(specs, source));
    const insertAt = decls.length ? decls[0].startLine : 1;
    const out = [];
    ci.lines.forEach((line, i) => {
      const n = i + 1;
      if (n === insertAt) out.push(...importBlock);
      if (!remove.has(n)) out.push(line);
    });
    files.set(ci.file, out.join('\n'));
  }

  // fragments: drop regions that lost every unit, refresh the others from the US planner
  const mainText = Object.fromEntries(COUNTRIES.map((c) => [c, files.get(info[c].file)]));
  const regionsOf = (text) => {
    const lines = text.split('\n');
    const regions = [];
    let open = null;
    lines.forEach((line, i) => {
      const m = SHARED_MARK.exec(line);
      if (!m) return;
      if (m[2] === 'begin') open = { name: m[1], begin: i, contentStart: i + 1 };
      else if (open) { regions.push({ ...open, end: i }); open = null; }
    });
    return { lines, regions };
  };
  const fragmentDir = path.join(root, 'shared');
  const deleted = new Set();
  for (const c of COUNTRIES) {
    const { lines, regions } = regionsOf(mainText[c]);
    const removeLine = new Set();
    for (const r of regions) {
      const content = lines.slice(r.contentStart, r.end);
      if (content.every((l) => l.trim() === '' || /^\s*\/\//.test(l))) {
        const leftovers = content.filter((l) => l.trim() !== '');
        if (leftovers.length) warnings.push(`${c}: region ${r.name} was emptied; dropped ${leftovers.length} comment line(s) that belonged to no unit`);
        for (let n = r.begin; n <= r.end; n++) removeLine.add(n);
        deleted.add(r.name);
      }
    }
    files.set(info[c].file, lines.filter((_, i) => !removeLine.has(i)).join('\n'));
  }
  const us = regionsOf(files.get(info.us.file));
  const ca = regionsOf(files.get(info.canada.file));
  for (const r of us.regions) {
    const content = us.lines.slice(r.contentStart, r.end).join('\n');
    const other = ca.regions.find((x) => x.name === r.name);
    if (!other) throw new Error(`region ${r.name} exists in us/main.js but not in canada/main.js`);
    if (ca.lines.slice(other.contentStart, other.end).join('\n') !== content) throw new Error(`region ${r.name} differs between the planners after the move`);
    const frag = path.join(fragmentDir, `${r.name}.js`);
    const newText = content + '\n';
    if (!fs.existsSync(frag) || readText(frag) !== newText) files.set(frag, newText);
  }
  for (const name of deleted) {
    if (us.regions.some((r) => r.name === name)) throw new Error(`region ${name} was emptied in only one planner`);
    files.set(path.join(fragmentDir, `${name}.js`), null);
  }

  // ---- 6. verify the result
  for (const c of COUNTRIES) {
    const text = files.get(info[c].file);
    const bad = undeclaredNames(text);
    if (bad.length) throw new Error(`${c}/main.js: undeclared names after the move: ${bad.map((b) => `${b.name} (line ${b.line})`).join(', ')}`);
    const after = analyze(text).units.length;
    if (after !== info[c].units.length - moduleOf[c].size) {
      throw new Error(`${c}/main.js: expected ${info[c].units.length - moduleOf[c].size} units after the move, found ${after}`);
    }
  }

  if (!dryRun) {
    for (const [file, text] of files) {
      if (text === null) fs.rmSync(file, { force: true });
      else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
    }
  }
  return {
    modules: modules.map((m) => ({
      path: m.path,
      owner: m.owner,
      units: (m.owner === 'shared' ? m.units.us : m.units[m.owner]).length,
      exports: [...exportsNeeded.get(m)].sort(),
    })),
    moved: Object.fromEntries(COUNTRIES.map((c) => [c, moduleOf[c].size])),
    deletedRegions: [...deleted].sort(),
    warnings,
  };
}

module.exports = { applyModules };
```

Run: `node tests/extract_units.js`
Expected: `extract_units OK`. If an assertion about file text fails, fix the tool (not the expectation) unless the expectation is plainly wrong, and say which in the report.

- [ ] **Step 4: The command-line wrapper**

Create `scripts/extract-units.js`:

```js
#!/usr/bin/env node
'use strict';
// Moves the units of one batch of an extraction plan out of src/<country>/main.js into modules.
//   node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 0 [--dry-run]
// Writes nothing unless every check passes. See scripts/lib/extract-units.js.
const fs = require('fs');
const path = require('path');
const { applyModules } = require('./lib/extract-units');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const manifestFile = value('--manifest');
const batch = Number(value('--batch'));
if (!manifestFile || Number.isNaN(batch)) {
  console.error('usage: node scripts/extract-units.js --manifest <file> --batch <n> [--dry-run]');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestFile), 'utf8'));
const modules = manifest.modules.filter((m) => m.batch === batch);
if (!modules.length) {
  console.error(`no modules in batch ${batch}`);
  process.exit(2);
}
const dryRun = args.includes('--dry-run');
try {
  const report = applyModules(root, modules, { dryRun });
  console.log(`${dryRun ? '[dry run] ' : ''}batch ${batch}: ${report.modules.length} modules; units moved: us ${report.moved.us}, canada ${report.moved.canada}`);
  if (report.deletedRegions.length) console.log(`regions removed: ${report.deletedRegions.join(', ')}`);
  report.warnings.forEach((w) => console.log(`warning: ${w}`));
} catch (err) {
  console.error(`extraction failed, nothing was written: ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 5: Wire in and commit**

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));const parts=p.scripts.test.split(' && ');const i=parts.indexOf('node tests/extraction_plan.js');if(i<0)throw new Error('anchor missing');parts.splice(i+1,0,'node tests/extract_units.js');p.scripts.test=parts.join(' && ');fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"
node tests/extract_units.js
git add scripts/lib/extract-units.js scripts/extract-units.js tests/extract_units.js package.json
git commit -m "Tooling: the extraction tool (cut units into modules, fix imports and exports, verify, write nothing on error)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `ok`, `extract_units OK`.

---

### Task 5: Guards for the module world

**Files:**
- Modify: `tests/closure_names.js` (rewrite), `tests/build_output.js`, `package.json`
- Create: `tests/core_purity.js`

**Interfaces:**
- Produces: `tests/closure_names.js` covers every `src/**/*.js` file (not just the two `main.js`).
- Produces: `tests/core_purity.js` fails when a file under `src/**/core/` uses a browser global.
- Produces: `tests/build_output.js`' escape guard counts every source file a planner can bundle (it used to compare against `main.js` alone, which stops being true once code moves out of `main.js`).

- [ ] **Step 1: Rewrite `tests/closure_names.js`**

Read the file first (Read tool), then replace its whole content with:

```js
// Every source file under src/ must reference only names it declares or imports (or built-ins and browser
// globals). esbuild does not report an undeclared identifier (it fails at runtime), so this is the guard for
// edits that move or remove declarations, which the module split does constantly.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { undeclaredNames } = require('../scripts/analyze-closure');

const srcDir = path.join(__dirname, '..', 'src');
function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = jsFiles(srcDir);
assert.ok(files.length >= 3, 'expected to find the source files');
for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file).split(path.sep).join('/');
  const bad = undeclaredNames(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  assert.deepStrictEqual(
    bad.map((b) => `${b.name} (line ${b.line})`),
    [],
    `${rel} references names that are not declared or imported`,
  );
}
console.log(`closure_names OK (${files.length} files)`);
```

Run: `node tests/closure_names.js`
Expected: `closure_names OK (N files)` with N around 15 at this point.

- [ ] **Step 2: Create `tests/core_purity.js`**

```js
// Files under src/**/core/ must not touch the DOM or browser storage (spec section 3, rule 1): they have to be
// importable in plain Node. Uses scope analysis, so comments, strings and local names that happen to be called
// `window` or `document` do not count.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { domGlobalsUsed } = require('../scripts/analyze-closure');

const root = path.join(__dirname, '..');
function coreFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'core' ? allJs(full) : coreFiles(full);
    return [];
  });
}
function allJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return allJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = coreFiles(path.join(root, 'src'));
assert.ok(files.length > 0, 'expected core/ files');
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const used = domGlobalsUsed(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  assert.deepStrictEqual(
    used.map((u) => `${u.name} (line ${u.line})`),
    [],
    `${rel} is under core/ but uses browser globals (move it to ui/)`,
  );
}
console.log(`core_purity OK (${files.length} core files)`);
```

Run: `node tests/core_purity.js`
Expected: `core_purity OK (N core files)` (N is 7 at this point: the stage 1 modules).

- [ ] **Step 3: Prove both guards bite**

(a) Append `export const leak = missingName + 1;` as a new last line of `src/shared/core/tax-factors.js`, run `node tests/closure_names.js`. Expected: FAIL naming `src/shared/core/tax-factors.js references names that are not declared or imported`. Remove the line (`git checkout src/shared/core/tax-factors.js`).
(b) Append `export const el = document.title;` as a new last line of `src/shared/core/store.js`, run `node tests/core_purity.js`. Expected: FAIL naming `src/shared/core/store.js is under core/ but uses browser globals (move it to ui/)`. Remove the line (`git checkout src/shared/core/store.js`).
Run `git status --short src` afterwards; expected: no output.

- [ ] **Step 4: Make the escape guard count every bundled source**

In `tests/build_output.js`, replace

```js
const escapeCount = (text) => (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
for (const [dir, name] of [['us', 'Planner_US.html'], ['canada', 'Planner_Canada.html']]) {
  const built = fs.readFileSync(path.join(dist, name), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', dir, 'main.js'), 'utf8');
  assert.ok(
    escapeCount(built) <= escapeCount(source),
```

with

```js
const escapeCount = (text) => (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
// Everything the planner can bundle: its own files and the shared ones (the code lives in modules, not only main.js).
const jsText = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsText(full);
    return entry.name.endsWith('.js') ? fs.readFileSync(full, 'utf8') : '';
  }).join('\n');
for (const [dir, name] of [['us', 'Planner_US.html'], ['canada', 'Planner_Canada.html']]) {
  const built = fs.readFileSync(path.join(dist, name), 'utf8');
  const source = `${jsText(path.join(__dirname, '..', 'src', dir))}\n${jsText(path.join(__dirname, '..', 'src', 'shared'))}`;
  assert.ok(
    escapeCount(built) <= escapeCount(source),
```

Run: `npm run build && node tests/build_output.js`
Expected: `built 2 planners into dist` and `build output OK`.

- [ ] **Step 5: Wire in and commit**

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));const parts=p.scripts.test.split(' && ');const i=parts.indexOf('node tests/extract_units.js');if(i<0)throw new Error('anchor missing');parts.splice(i+1,0,'node tests/core_purity.js');p.scripts.test=parts.join(' && ');fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"
node tests/closure_names.js && node tests/core_purity.js && node tests/build_output.js
git add tests/closure_names.js tests/core_purity.js tests/build_output.js package.json
git commit -m "Tests: undeclared-name guard covers every source file; core/ purity guard; escape guard counts all bundled sources" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The stylesheet and the HTML partials become build-time includes

**Files:**
- Modify: `scripts/lib/assemble-html.js`, `tests/assemble_html.js`, `scripts/build.js`, `scripts/sync-shared.js`, `src/us/index.html`, `src/canada/index.html`
- Create: `src/shared/styles/styles.css`, `src/shared/partials/*.html` (11 files)
- Delete: `src/us/styles.css`, `src/canada/styles.css`, `shared/styles.css`, `shared/html-*.html` (11 files)

**Interfaces:**
- Produces: `assembleHtml({ shell, css, js, partials = {} })`. In the shell, a line `<!-- @@include name -->` (any indentation) is replaced by the text of `partials[name]` without its final newline; an unknown name throws `the shell includes "name", which is not a partial`.
- Produces: `scripts/build.js` reads `src/shared/styles/styles.css` once and every `src/shared/partials/<name>.html`, and passes them to `assembleHtml`.
- Produces: `sync-shared.js` handles `main.js` regions only.

- [ ] **Step 1: Write the failing test**

In `tests/assemble_html.js`, insert this block immediately before the final line `console.log('assemble_html OK');`:

```js
// An include line is replaced by the partial's text (without its final newline); the include line's own
// indentation is dropped because the partial carries its own.
const withInclude = '<body>\n    <!-- @@include card -->\n</body>\n<style>{{css}}</style><script>{{js}}</script>\n';
const included = assembleHtml({ shell: withInclude, css: '\n', js: '\n', partials: { card: '  <div>\n    one\n  </div>\n' } });
assert.ok(included.startsWith('<body>\n  <div>\n    one\n  </div>\n</body>\n'), JSON.stringify(included));
assert.ok(!included.includes('@@include'), 'the include line is gone');

// A partial's text is inserted literally ($&, $1 and friends stay as they are).
assert.ok(assembleHtml({ shell: withInclude, css: '\n', js: '\n', partials: { card: '<i>$&$1</i>\n' } }).includes('<i>$&$1</i>'));

// An include of an unknown partial is an error, never silently dropped.
assert.throws(() => assembleHtml({ shell: withInclude, css: '\n', js: '\n' }), /includes "card", which is not a partial/);
```

Run: `node tests/assemble_html.js`
Expected: FAIL (the include line is left in the output, so the first new assertion fails).

- [ ] **Step 2: Implement it**

Read `scripts/lib/assemble-html.js` (Read tool), then replace its whole content with:

```js
'use strict';
// Splices a planner's stylesheet, script and shared HTML partials into its HTML shell.
//
// The shell holds the markup plus two placeholders: {{css}} inside <style> and {{js}} inside <script>, and
// include lines, `<!-- @@include name -->`, each replaced by the text of partials[name] (a file under
// src/shared/partials/). css, js and each partial are passed as read from disk (each ends with a newline); the
// shell supplies the newline that follows the placeholder or include line.

const PLACEHOLDER = /\{\{(css|js)\}\}/g;
const INCLUDE = /^[ \t]*<!-- @@include (\S+) -->[ \t]*$/gm;

const count = (text, token) => text.split(token).length - 1;
const dropFinalNewline = (text) => text.replace(/\n$/, '');

function assembleHtml({ shell, css, js, partials = {} }) {
  const withPartials = shell.replace(INCLUDE, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(partials, name)) throw new Error(`the shell includes "${name}", which is not a partial`);
    return dropFinalNewline(partials[name]);
  });
  for (const token of ['{{css}}', '{{js}}']) {
    const found = count(withPartials, token);
    if (found !== 1) throw new Error(`shell must contain ${token} exactly once, found ${found}`);
  }
  if (/<\/style/i.test(css)) throw new Error('stylesheet contains "</style", which would end the <style> element early');
  const safeCss = dropFinalNewline(css);
  const safeJs = dropFinalNewline(js).replace(/<\/(script)/gi, '<\\/$1');
  // One pass with a function replacer: inserted text is never re-scanned, and `$&`, `$1` and friends
  // inside the code stay literal (a string replacement would interpret them).
  return withPartials.replace(PLACEHOLDER, (_, which) => (which === 'css' ? safeCss : safeJs));
}

module.exports = { assembleHtml };
```

Run: `node tests/assemble_html.js`
Expected: `assemble_html OK`.

- [ ] **Step 3: Teach the build about them**

In `scripts/build.js`, replace

```js
async function buildAll() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const { dir, file } of PLANNERS) {
    const src = path.join(root, 'src', dir);
    const html = assembleHtml({
      shell: read(path.join(src, 'index.html')),
      css: read(path.join(src, 'styles.css')),
      js: await bundleJs(path.join(src, 'main.js'), dir),
    });
```

with

```js
// The shared HTML partials (src/shared/partials/<name>.html), keyed by name.
function readPartials() {
  const dir = path.join(root, 'src', 'shared', 'partials');
  return Object.fromEntries(
    fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => [f.replace(/\.html$/, ''), read(path.join(dir, f))]),
  );
}

async function buildAll() {
  fs.mkdirSync(outDir, { recursive: true });
  const css = read(path.join(root, 'src', 'shared', 'styles', 'styles.css'));
  const partials = readPartials();
  for (const { dir, file } of PLANNERS) {
    const src = path.join(root, 'src', dir);
    const html = assembleHtml({
      shell: read(path.join(src, 'index.html')),
      css,
      partials,
      js: await bundleJs(path.join(src, 'main.js'), dir),
    });
```

In `scripts/sync-shared.js`, replace

```js
// Each planner is split into a markup shell, a stylesheet and a script; markers live in all three.
const KINDS = ['index.html', 'styles.css', 'main.js'];
```

with

```js
// Only the planner scripts carry shared regions now: the stylesheet and the HTML partials are build-time
// includes (src/shared/styles, src/shared/partials), and shared script code is moving into modules.
const KINDS = ['main.js'];
```

(Do not build or run the sync check yet: the files they read do not exist until the next step.)

- [ ] **Step 4: Snapshot the current build, convert the sources**

Run: `node scripts/build.js --out /tmp/dist-before`
Expected: `built 2 planners into ...dist-before`.

Write `convert-partials.js` in the session scratchpad directory (Write tool):

```js
// One-off: turns the shared stylesheet and HTML partial regions into build-time includes.
//   src/<country>/styles.css (one shared region)        -> src/shared/styles/styles.css
//   <!-- @@shared:html-X begin --> ... end --> in index.html -> <!-- @@include X --> + src/shared/partials/X.html
// Run from the repo root.
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
const MARK = /^(\s*)<!-- @@shared:(html-\S+) (begin|end) -->\s*$/;

const partials = new Map(); // name -> content (what lies between the markers)
for (const country of ['us', 'canada']) {
  const file = `src/${country}/index.html`;
  const lines = read(file).split('\n');
  const out = [];
  let open = null;
  for (const line of lines) {
    const m = MARK.exec(line);
    if (m && m[3] === 'begin') {
      open = { name: m[2].replace(/^html-/, ''), indent: m[1], content: [] };
    } else if (m && m[3] === 'end') {
      const text = open.content.join('\n');
      if (partials.has(open.name) && partials.get(open.name) !== text) throw new Error(`${open.name} differs between the planners`);
      partials.set(open.name, text);
      out.push(`${open.indent}<!-- @@include ${open.name} -->`);
      open = null;
    } else if (open) open.content.push(line);
    else out.push(line);
  }
  if (open) throw new Error(`${file}: region ${open.name} never ends`);
  write(file, out.join('\n'));
}
for (const [name, text] of partials) {
  const fragment = read(`shared/html-${name}.html`);
  if (fragment !== `${text}\n`) throw new Error(`shared/html-${name}.html does not match the planners`);
  write(`src/shared/partials/${name}.html`, `${text}\n`);
  fs.rmSync(path.join(root, `shared/html-${name}.html`));
}

const css = read('src/us/styles.css');
if (css !== read('src/canada/styles.css')) throw new Error('the two stylesheets differ');
const cssLines = css.split('\n');
if (!/@@shared:styles begin/.test(cssLines[0]) || !/@@shared:styles end/.test(cssLines[cssLines.length - 2])) throw new Error('unexpected stylesheet markers');
const body = cssLines.slice(1, -2).join('\n');
if (read('shared/styles.css') !== `${body}\n`) throw new Error('shared/styles.css does not match the stylesheets');
write('src/shared/styles/styles.css', `${body}\n`);
for (const f of ['src/us/styles.css', 'src/canada/styles.css', 'shared/styles.css']) fs.rmSync(path.join(root, f));
console.log(`partials: ${partials.size}; stylesheet: ${body.split('\n').length} lines`);
```

Run from the repo root: `node <scratchpad>/convert-partials.js`
Expected: `partials: 11; stylesheet: 258 lines`. Then `ls src/shared/partials` lists `chartRotateHint.html fieldSearch.html ltcEnabled.html medicalInflation.html propertyTaxGrowth.html retireAssets.html sankeyCard.html spendingTiersGroup.html timelineGroupState.html tornadoChart.html undoToast.html`, and `grep -c "@@shared" src/us/index.html` prints `0`.

- [ ] **Step 5: Build again and compare**

Run: `node scripts/sync-shared.js --check && node scripts/build.js --out /tmp/dist-after`
Expected: `shared regions OK (43 regions x 2 planners)` and the build line.

- [ ] **Step 6: The built HTML must differ only by the removed marker comments**

Run:
```bash
for f in Planner_US.html Planner_Canada.html; do
  echo "$f: lines changed that are not shared-marker comments: $(diff /tmp/dist-before/$f /tmp/dist-after/$f | grep '^[<>]' | grep -vc '@@shared:')"
  echo "$f: marker lines removed: $(diff /tmp/dist-before/$f /tmp/dist-after/$f | grep -c '^< .*@@shared:')   lines added: $(diff /tmp/dist-before/$f /tmp/dist-after/$f | grep -c '^>')"
done
```
Expected, for both files: `lines changed that are not shared-marker comments: 0`, `marker lines removed: 24   lines added: 0` (22 HTML markers and 2 stylesheet markers). Anything else means the conversion altered the output: stop and find out why.

- [ ] **Step 7: Full suite and commit**

Run (background): `npm test > /tmp/stage2-t6.log 2>&1; echo "exit $?" >> /tmp/stage2-t6.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add -A scripts src shared tests
git commit -m "Build: the shared stylesheet and HTML partials become build-time includes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git status --short
```
Expected: no output from the last command.

---

### Task 7: Generate and commit the extraction manifest

**Files:**
- Create: `scripts/extractions/names.json`, `scripts/extractions/stage2.json`

- [ ] **Step 1: Write the names file**

Create `scripts/extractions/names.json` (Write tool) with exactly:

```json
{
  "canada:countKids": "benefit-helpers",
  "canada:progressiveTax": "federal-tax-constants",
  "canada:routeSurplus": "year-modes",
  "us:normalizeUsStreams": "normalize-lists",
  "us:routeSurplus": "year-modes",
  "us:SENIOR_DEDUCTION_LAST_YEAR": "federal-deductions",
  "us:SS_EARNINGS_TEST_2026": "ss-earnings-test",
  "canada:clampLifeExpectancyA": "fields",
  "canada:DIVIDEND_GROSS_UP, FEDERAL_ELIGIBLE_DTC": "credits-and-gross-up",
  "canada:provinceTaxTreatmentNote": "oas-and-rrif",
  "canada:RRIF_PENSION_AGE": "gis-and-rrif",
  "us:acaExpectedPct": "aca-and-magi-iteration",
  "us:niitTax": "niit-and-rmd",
  "us:returnStatusA": "irmaa-lookback",
  "us:seniorDeduction": "itemized-deduction",
  "us:WITHDRAWAL_MIX_CANDIDATES": "withdrawal-mix-and-roth-accounts",
  "canada:HOME_BUYERS_AMOUNT": "list-amounts-and-home-buyers",
  "canada:retirementContributions": "income-and-housing-per-year",
  "us:additionalMedicareTax": "payroll-and-plan-limits",
  "us:NO_PLAN": "cliff-plan-lines",
  "us:ROTH_PER_YEAR_CANDIDATES": "roth-per-year",
  "us:STREAM_OUT": "income-streams-and-lumps",
  "us:taxableSocialSecurity": "social-security-and-child-credits",
  "shared:01-LIST_MAX": "lists-and-children",
  "shared:ids": "field-wiring",
  "shared:03-hadSavedState": "money-format",
  "shared:04-isEstimateCountable": "estimates-and-warnings",
  "shared:05-pct": "basics",
  "shared:06-histTaxFactors": "year-factors",
  "shared:07-mortgagePayment:core": "spending-and-loans",
  "shared:07-mortgagePayment:ui": "chart-colors",
  "shared:11-makeProjectedExpense": "bond-ladder",
  "shared:12-standardYearSource": "year-sources",
  "shared:13-simulate": "monte-carlo-paths",
  "shared:19-layoutSankeyColumn": "sankey-layout",
  "shared:20-renderTable:core": "chart-hover",
  "shared:20-renderTable:ui": "chart-render",
  "shared:21-writeStorageNow:core": "scenario-helpers",
  "shared:21-writeStorageNow:ui": "scenario-export",
  "shared:22-exportCsv": "dyn-field-helpers",
  "shared:25-setMcPathCount": "landscape-fullscreen",
  "shared:26-setChartView": "topbar-and-undo",
  "shared:29-dismissFirstRunBanner": "first-run-ui"
}
```

- [ ] **Step 2: Generate the manifest and check it**

Run:
```bash
node scripts/plan-extraction.js > scripts/extractions/stage2.json
node -e "
const m = require('./scripts/extractions/stage2.json');
const batches = {};
for (const x of m.modules) batches[x.batch] = (batches[x.batch] || 0) + 1;
console.log('modules', m.modules.length, JSON.stringify(batches), JSON.stringify(m.stats));
"
```
Expected: `modules 115 {"0":66,"1":25,"2":24} {"us":{"units":693,"candidates":349,"movable":308},"canada":{"units":443,"candidates":208,"movable":160}}`.

Check the names took effect: `grep -c '"path"' scripts/extractions/stage2.json` prints `115`, and `grep '"path"' scripts/extractions/stage2.json | grep -c "federal-deductions\|state-rules\|sankey-layout\|year-factors\|benefit-helpers"` prints `5`.

- [ ] **Step 3: Dry-run all three batches' first pass**

Run: `node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 0 --dry-run`
Expected: `[dry run] batch 0: 66 modules; units moved: us 120, canada 93` and a `regions removed:` line naming `05-pct, 08-pensionIncome, SANKEY_HUES, loanPaymentForYear, nextGuardrailMultiplier, syncPlanStatusOffsets, takeCash`; no `warning:` lines.
(Batches 1 and 2 cannot be dry-run yet: they build on batch 0's result.)

- [ ] **Step 4: Commit**

```bash
git add scripts/extractions
git commit -m "Extraction: the stage 2 manifest (115 modules in 3 batches) and module names" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Batch 0 (66 modules, the leaf layer)

**Files:**
- Create: 66 modules under `src/shared/core|ui/` and `src/<country>/core|ui/`
- Modify: `src/us/main.js`, `src/canada/main.js`, `shared/*.js` (fragments), `docs/province-tax-rules.md`, `docs/benefits-rules.md`
- Delete: the fragments of the 7 emptied regions

- [ ] **Step 1: Apply the batch**

Run: `node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 0`
Expected: `batch 0: 66 modules; units moved: us 120, canada 93`, `regions removed: 05-pct, 08-pensionIncome, SANKEY_HUES, loanPaymentForYear, nextGuardrailMultiplier, syncPlanStatusOffsets, takeCash`, and no `warning:` line. If it prints `extraction failed, nothing was written: ...`, stop and report the message (the manifest no longer matches the source).

- [ ] **Step 2: Regenerate the generated docs**

The province and benefit rule blocks moved (into `src/canada/core/province-rules.js`), which changes the footer of two generated docs.

Run: `npm run gen:states && npm run gen:provinces && npm run gen:benefits && git diff --stat docs`
Expected: two files changed, one line each (`docs/benefits-rules.md`, `docs/province-tax-rules.md`); `git diff docs | grep '^[-+]' | grep -v '^[-+][-+]'` shows only the "Generated by ..." footer lines naming `src/canada/core/province-rules.js` instead of `src/canada/main.js`.

- [ ] **Step 3: Guards**

Run: `node scripts/sync-shared.js --check && npm run build && node tests/closure_names.js && node tests/core_purity.js`
Expected: `shared regions OK (36 regions x 2 planners)`, the build line, `closure_names OK (N files)` (N around 80), `core_purity OK (N core files)`.

- [ ] **Step 4: Sizes**

Run: `wc -l src/us/main.js src/canada/main.js | head -2`
Expected: about 15,700 lines (US) and 7,900 lines (Canada), down from 17,151 and 9,975.

- [ ] **Step 5: Full suite**

Run (background): `npm test > /tmp/stage2-b0.log 2>&1; echo "exit $?" >> /tmp/stage2-b0.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add -A src shared docs
git status --short
git commit -m "Extraction batch 0: 66 modules (120 US and 93 Canada units) out of main.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: the `git status` shown before the commit lists only `src/`, `shared/` and the two `docs/` files.

---

### Task 9: Batch 1 (25 modules)

**Files:** as Task 8, for batch 1; the generated state-rules doc changes.

- [ ] **Step 1: Apply, regenerate, check**

Run:
```bash
node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 1 --dry-run
node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 1
npm run gen:states && npm run gen:provinces && npm run gen:benefits && git diff --stat docs
node scripts/sync-shared.js --check && npm run build && node tests/closure_names.js && node tests/core_purity.js
```
Expected: both extraction runs print `batch 1: 25 modules; units moved: us 121, canada 43` and `regions removed: 07-mortgagePayment, 12-standardYearSource`, no `warning:` lines. The docs diff shows one changed file (`docs/state-tax-rules.md`, one footer line: `src/us/core/state-rules.js`). Then `shared regions OK (34 regions x 2 planners)`, the build line, `closure_names OK`, `core_purity OK`.

- [ ] **Step 2: Full suite**

Run (background): `npm test > /tmp/stage2-b1.log 2>&1; echo "exit $?" >> /tmp/stage2-b1.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

- [ ] **Step 3: Commit**

```bash
git add -A src shared docs
git status --short
git commit -m "Extraction batch 1: 25 modules (121 US and 43 Canada units) out of main.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Batch 2 (24 modules)

**Files:** as Task 8, for batch 2.

- [ ] **Step 1: Apply and check**

Run:
```bash
node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 2 --dry-run
node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 2
npm run gen:states && npm run gen:provinces && npm run gen:benefits && git status --short docs
node scripts/sync-shared.js --check && npm run build && node tests/closure_names.js && node tests/core_purity.js
wc -l src/us/main.js src/canada/main.js | head -2
```
Expected: `batch 2: 24 modules; units moved: us 67, canada 24`, `regions removed: 16-decisionEndAssets, compactDecisionDelta`, no `warning:` lines; no docs changed; `shared regions OK (32 regions x 2 planners)`; the build line; both guards OK; `main.js` at about 9,160 lines (US) and 6,300 lines (Canada).

- [ ] **Step 2: Full suite**

Run (background): `npm test > /tmp/stage2-b2.log 2>&1; echo "exit $?" >> /tmp/stage2-b2.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

- [ ] **Step 3: Commit**

```bash
git add -A src shared docs
git status --short
git commit -m "Extraction batch 2: 24 modules (67 US and 24 Canada units) out of main.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Docs, the region map, and the regenerated inventory

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/superpowers/specs/2026-10-10-modular-build-design.md`, `docs/superpowers/inventory/closure-us.md`, `docs/superpowers/inventory/closure-canada.md`
- Create: `docs/superpowers/inventory/stage2-region-map.md`

- [ ] **Step 1: Regenerate the inventory**

Run: `npm run analyze`
Expected: `US: 385 units, 24 mutable, ...` and `Canada: 283 units, 25 mutable, ...` (693 - 308 and 443 - 160; the mutable counts do not change because no mutable binding was moved). Open the "Shared regions" table of `closure-us.md`: it now lists only the regions that still have units in `main.js` (32). If the unit counts differ, find out why and say so in the commit message.

- [ ] **Step 2: The region map**

Write `region-map.js` in the session scratchpad directory (Write tool), then run it from the repo root:

```js
// Writes docs/superpowers/inventory/stage2-region-map.md: where each old shared region's units went.
const fs = require('fs');
const modules = JSON.parse(fs.readFileSync('scripts/extractions/stage2.json', 'utf8')).modules;
const rows = modules.filter((m) => m.regions.length).sort((a, b) => a.regions[0].localeCompare(b.regions[0]) || a.path.localeCompare(b.path));
const out = [
  '# Stage 2: where the shared regions went',
  '',
  'Generated from `scripts/extractions/stage2.json`. Older notes name shared code by its `@@shared` region (for example',
  '`07-mortgagePayment`); this table says which module now holds the units of that region that were extracted. Units of a',
  'region that are not listed here stayed in `main.js` (the region still exists there) or were never in a region.',
  '',
  '| old shared region | module |',
  '|---|---|',
];
for (const m of rows) for (const r of m.regions) out.push(`| ${r} | ${m.path} |`);
fs.writeFileSync('docs/superpowers/inventory/stage2-region-map.md', `${out.join(String.fromCharCode(10))}${String.fromCharCode(10)}`);
console.log(`${rows.length} modules, ${out.length - 7} rows`);
```

Run: `node <scratchpad>/region-map.js`
Expected: a line like `N modules, M rows` with M at least 40.

- [ ] **Step 3: Update `CLAUDE.md`**

Use the Edit tool; every `old` string below exists exactly once in the current file.

Edit 1 (the `src/us/` Files bullet). Replace

```
- `src/us/` and `src/canada/` — each planner's source: `index.html` (markup shell with
  `{{css}}` and `{{js}}` placeholders), `styles.css`, and `main.js` (the whole app as
  one IIFE for now; it is being split into modules).
```

with

```
- `src/us/` and `src/canada/` — each planner's source: `index.html` (markup shell with
  `{{css}}` and `{{js}}` placeholders and `<!-- @@include name -->` lines) and `main.js`
  (what has not been extracted into modules yet: one IIFE plus an import block). Most of the
  code now lives in modules: `src/<country>/core|ui/` for country code and `src/shared/core|ui/`
  for code both planners use (see "Modules and the extraction tool" below).
```

Edit 2 (add Files bullets and update the tests bullet). Replace the one line

```
- `tests/state_modules.js` (the state modules in plain Node), `tests/country_contract.js` (the `#country` seam contract), `tests/closure_names.js` (no undeclared name in either `main.js`).
```

with these three bullets:

```
- `src/shared/styles/styles.css` and `src/shared/partials/*.html` — the stylesheet and the shared HTML partials. Edit them there:
  `scripts/build.js` reads them, and `assembleHtml` splices each partial in at the `<!-- @@include name -->` line of a shell.
- `scripts/plan-extraction.js` + `scripts/extract-units.js` (code in `scripts/lib/extraction-plan.js`, `extract-units.js`,
  `marker-source.js`) — the tool that moved top-level units out of `main.js` into modules. `scripts/extractions/stage2.json` is the plan
  it applied (every module with its unit labels and batch) and `names.json` the module-name overrides.
- `tests/state_modules.js` (the state modules in plain Node), `tests/country_contract.js` (the `#country` seam contract), `tests/closure_names.js` (no undeclared name in any `src/**/*.js`), `tests/core_purity.js` (no browser global in any `src/**/core/` file), `tests/extraction_plan.js` / `tests/extract_units.js` / `tests/marker_source.js` (the extraction tool and its helper, on fixture trees).
```

Edit 3 (the regions section). Replace

```
back to `shared/`) and `npm run sync` (updates the other planner). Regions live in all
three source files per planner: `main.js` (`//` markers), `styles.css` (`/* */`) and
`index.html` (`<!-- -->`). `npm test` runs
```

with

```
back to `shared/`) and `npm run sync` (updates the other planner). Regions live in each
planner's `main.js` only (`//` markers); the stylesheet and the HTML partials are build-time
includes (above). `npm test` runs
```

and replace

```
the markers to both files plus a `shared/` fragment). Marker style picks the
fragment type: `// @@shared:x begin` (JS, `shared/x.js`), `/* @@shared:x begin */`
(CSS) and `<!-- @@shared:x begin -->` (markup). The whole stylesheet is one
shared region, so a CSS change is made once. The two `runProjection` year
```

with

```
the markers to both files plus a `shared/` fragment). **New shared code goes in a
module under `src/shared/`, not in a region**: regions are what is left of the old mechanism and
shrink as units are extracted (`docs/superpowers/inventory/stage2-region-map.md` says where each
old region's units went). The two `runProjection` year
```

Edit 5 (partial names in prose). Replace

```
  between two shared markup regions (`html-medicalInflation` ends before it,
  `html-propertyTaxGrowth` starts after it) so each planner can word its label
  differently; keep it outside the shared regions.
```

with

```
  between two shared partials (`medicalInflation` ends before it,
  `propertyTaxGrowth` starts after it) so each planner can word its label
  differently; keep it outside the shared partials.
```

and replace ``inside the shared `html-spendingTiersGroup` markup region;`` with ``inside the shared `spendingTiersGroup` partial (`src/shared/partials/`);``.

Edit 6 (new section). Insert directly before the line `## US vs. Canada: same shape, different names, not a find-and-replace`:

```
## Modules and the extraction tool (stage 2 of the module split)

- **Where code lives now.** Units are top-level statements of the planner IIFE. The first four dependency layers (the
  leaves and the units that depend only on them) were moved out of `main.js` into modules: byte-identical shared code under
  `src/shared/core|ui/`, country-only code under `src/<country>/core|ui/`. A module is under `core/` when none of its units touches
  the DOM (`tests/core_purity.js` enforces it) and under `ui/` otherwise. Module names come from `scripts/extractions/names.json`;
  the first unit's name or the old region's name is used where there is no override. Module files keep the two-space indentation
  they had inside the IIFE (the tool moves text verbatim; do not reformat a module in a commit that also changes it).
- **What stayed in `main.js` and why.** Side-effect statements (listeners, test hooks, initialisation: moving them changes
  execution order), units that declare a `let` assigned from outside their module, and everything above layer 3 (the hubs: `render`,
  `syncControls`, `taxFor`, `runProjection`, `FIELDS`, `defaults`, ...), because their dependencies were not modules yet. Stage 3
  continues from the regenerated inventory (`npm run analyze`) and `node scripts/plan-extraction.js --max-layer=N`.
- **Adding or moving code.** Put new shared code in a module under `src/shared/core|ui/` and import it (relative path); new
  country code in `src/<country>/core|ui/`. Do not add `@@shared` regions. A name a module uses must be declared in it or imported
  (`tests/closure_names.js` fails otherwise: esbuild does not report an undeclared identifier). Cross-module state goes through the
  `assign…` functions described above.
- **Data blocks.** A `// NAME:begin ... // NAME:end` block (`STATE_RULES`, `MEDICAID_RULES`, `PROVINCE_RULES`, `BENEFIT_RULES`) is moved whole
  with both markers. `scripts/gen-*-rules.js` find it in whichever file holds it (`scripts/lib/marker-source.js`) and evaluate the
  text with `export` removed.
- **Using the tool again.** `node scripts/plan-extraction.js > plan.json` prints a plan for the current source;
  `node scripts/extract-units.js --manifest plan.json --batch N [--dry-run]` applies one batch and writes nothing unless every check
  passes. After a batch: `npm run gen:states && npm run gen:provinces && npm run gen:benefits`, `npm test`.
```

Verify: `grep -c "html-spendingTiersGroup\|html-medicalInflation" CLAUDE.md` prints `0`.

- [ ] **Step 4: Update `README.md`**

Replace

```
- `src/us/`, `src/canada/` — the source of each planner (`index.html`, `styles.css`, `main.js`)
```

with

```
- `src/us/`, `src/canada/` — the source of each planner (`index.html`, `main.js`, and modules under `core/` and `ui/`); `src/shared/` holds the code, the stylesheet and the HTML partials both planners use
```

Replace

```
- `shared/` + `scripts/sync-shared.js` — canonical copies of the code (JS, CSS, markup) that is identical in both planners; `npm run sync` writes them into the sources and `npm test` fails if they drift
```

with

```
- `shared/` + `scripts/sync-shared.js` — canonical copies of the script regions that are still identical in both planners' `main.js` (shrinking as code moves into `src/shared/` modules); `npm run sync` writes them into the sources and `npm test` fails if they drift
```

Replace ``Code shared by both planners lives between `@@shared:<name> begin/end` marker comments; edit the fragment in `shared/` (or edit one planner source and run `npm run sync -- --pull <file>`), then `npm run sync`.`` with ``Code shared by both planners lives in modules under `src/shared/`; the few script regions that remain between `@@shared:<name> begin/end` markers are edited in the fragment in `shared/` (or in one planner source with `npm run sync -- --pull <file>`), then `npm run sync`.``

- [ ] **Step 5: Update the spec**

In `docs/superpowers/specs/2026-10-10-modular-build-design.md`:

Replace

```
  (Canada), with two module-level cycles per planner that merge into one module each.
```

with

```
  (Canada), with two module-level cycles per planner that merge into one module each.
  Amended after the prototype: splitting every group into a `core` and a `ui` part, keeping data blocks whole and letting
  side-effect statements sit inside a run gives 115 modules in three batches (66, 25, 24); 308 US and 160 Canada units move.
```

and, in the staging list of section 6, replace `Designed in section 13.` with ``Designed in section 13; plan: docs/superpowers/plans/2026-10-12-stage2-extraction.md. DONE on branch tyler/stage2-fragments (the owner adds the merge date when merging).``

- [ ] **Step 6: Final checks and commit**

Run: `node tests/closure_analyzer.js && node tests/closure_names.js && node tests/core_purity.js && node tests/extract_units.js && node tests/extraction_plan.js && node tests/marker_source.js && node tests/assemble_html.js && node scripts/sync-shared.js --check`
Expected: all OK.

Run the full suite one last time (background): `npm test > /tmp/stage2-final.log 2>&1; echo "exit $?" >> /tmp/stage2-final.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

```bash
git add CLAUDE.md README.md docs
git status --short
git commit -m "Docs: stage 2 modules, the extraction tool and the build-time includes; regenerated inventory and region map" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: `git status` before the commit lists only `CLAUDE.md`, `README.md` and files under `docs/`.

---

## Definition of done

- `npm test` is green and `git diff <BASE> --stat -- tests/snapshots` is empty.
- `npm run build` produces the same two single-file planners (classic IIFE, `"use strict"` first); the built HTML differs from the pre-stage build only by the 24 removed marker comments.
- `src/us/main.js` is about 9,160 lines and `src/canada/main.js` about 6,300, from 17,151 and 9,975; `node scripts/sync-shared.js --check` reports 32 regions.
- 115 modules exist (66 + 25 + 24); `tests/closure_names.js` (every `src` file) and `tests/core_purity.js` pass; the three `gen-*-rules.js --check` pass.
- The manifest `scripts/extractions/stage2.json` is committed; `CLAUDE.md`, `README.md` and the spec describe the new layout; the inventory and the region map are regenerated.

## Follow-up

Stage 3 peels the higher layers (the hubs: `FIELDS`, `defaults`, `normalizeState`, `taxFor`, `runProjection`, `render`, `syncControls` and what depends on them), starting from `npm run analyze` and `node scripts/plan-extraction.js --max-layer=N`. It will need: moving side-effect statements (their execution order matters), setters for the `let` bindings that are assigned across modules (`theme`, `hasPersonalizedData`, `setMobileView`, `taxFactorInflation`, Canada's `lastRothOptimizer`, the UI timers), merging the one-unit modules by topic (the module partition here follows the old source order, not topics), and deleting `sync-shared.js` when the last region leaves `main.js`.
