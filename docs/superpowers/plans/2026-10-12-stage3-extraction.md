# Stage 3 Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every DOM-free unit out of the two planners' `main.js` into modules (the tax code, the withdrawal helpers, the year-loop engine and the pure helpers around them), with the extraction tool extended for what the stage 2 layers could not do: mutable bindings that belong to one function, DOM-free-only selection, shared code that reaches country code, and module-graph cycles between a shared region and country code.

**Architecture:** The stage 2 tool (`scripts/lib/extraction-plan.js` plans, `scripts/lib/extract-units.js` applies) gains four things. (1) A `let` written by exactly one function and no statement moves with that function; any other mutable binding is reported and blocks what depends on it. (2) `coreOnly` leaves every unit that touches the DOM, or imports a `ui/` module, in `main.js`. (3) A country seam: a shared module may use the country units named in `seam`, importing them from `#country/core/seam`, a facade each country gets (`src/<country>/core/seam.js`) that re-exports those names. (4) Where a shared region and a country run would import each other as whole modules, their units get modules of their own, then nodes from one region or run are joined again wherever that closes no cycle. Plus the stage 2 final-review fixes (side-effect and bare imports, namespace imports refused, block comments, staged writes, paths under `src/`).

**Tech Stack:** Node 22 (CI) / 24 (local), esbuild 0.28, espree + eslint-scope (analysis only), Playwright (existing tests).

**Spec:** `docs/superpowers/specs/2026-10-10-modular-build-design.md`, section 14 (and sections 3-6, 12, 13).

**Rehearsed:** every file and command below was run end to end in scratch worktrees of `24fbfb9` (the spec commit this branch starts from). The full suite passed on the resulting tree (84 steps; the two tool unit tests were rewritten for the new behavior and pass), and the built planners were statement-identical to the pre-stage build (816 US and 538 Canada statements, none missing, none new). The plan moves 74 US and 52 Canada units into 38 modules in six batches; `main.js` goes from 9,164 / 6,303 to 4,839 / 4,091 lines. Timing (the interleaved gates, one process): no US state above +5% once a noisy reading was repeated at 21 rounds, Canada ratios 0.84 to 1.04. The spec's earlier estimate (about 90 and 68 units) did not count the units that call country code; the seam is what makes these 74 and 52 possible, and the rest are UI state and UI code.

## Global Constraints

- Output is a classic IIFE `<script>`, not `type="module"` (spec section 2). `dist/` is gitignored; edit `src/`, `shared/` and `scripts/`, never `dist/`.
- No behavior change: numeric output must not move. `tests/snapshots/*.json` stay byte-identical. `npm run snapshot:update` is not used anywhere in this plan.
- Nothing under `src/**/core/` references `document`, `window`, `localStorage` or `navigator`, calls a DOM method on an element, or imports from a `ui/` directory (Task 3 turns the last two into a test); `src/**/ui/` is where DOM code goes.
- US and Canada never import from each other; both import from `src/shared/`. Shared code reaches country code only through `#country/core/seam` (spec section 14).
- `src/` stays plain ESM: no esbuild-only features.
- Code moves verbatim: the extraction tool changes only `export` keywords and import lines, never the text of a unit. Side-effect statements are never moved (execution order). The eight mutable bindings that need a decision (`theme`, `sidebarCollapsed`, `hadSavedState`, `infoBubbleBtn`, `reviewingFieldId`, `setMobileView`, `undoSnapshot`, `wizardStep`) and everything that depends on them stay in `main.js`.
- The build runs on Windows and Linux (CI: ubuntu-latest, Node 22). Every tool that reads sources normalizes CRLF to LF on read.
- `sync-shared.js` keeps working until the last shared region leaves `main.js`: `node scripts/sync-shared.js --check` must pass at the end of every task.
- Docs are updated in the stage that changes them (Task 9). Never `--no-verify`. Text files end with a newline. Stop after 3 failed attempts at one step and reassess.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; the commands below pass it as a second `-m`.
- Run commands in Git Bash. Node is not on the Git Bash PATH here: start each session with `export PATH="$PATH:/c/Program Files/nodejs"`. Create files that contain backslashes or regexes with the Write tool (read an existing file with the Read tool first before overwriting), never with shell heredocs or sed: this environment's shell tool collapses double backslashes. Scratch scripts go in the session scratchpad directory, never in the repo.
- Editing `package.json`'s `test` script: this plan does not need to. If you must, use a JSON-aware edit and run `node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"`; it must print `ok`.

## Review Focus

Failure modes the spec implies but no happy-path test exercises, most likely first. Each has a pin in the task named.

1. **A silent initialization-order change.** esbuild rewrites a module's top-level `const` and `let` as `var` when it bundles, so a moved initializer that reads something defined later does not throw a temporal-dead-zone error: it reads `undefined`. The planner moves a unit only when everything it depends on is a module, and module import order follows dependencies, but a hidden dependency through a side effect would not be seen. Pinned by `scripts/compare-builds.js` (every statement of the built planners compared with the pre-stage build, Tasks 4-8), by the snapshots, and by `tests/snapshot_ui.js`, which fails on any page error at load.
2. **Core code that reaches DOM code through an import.** The analyzer sees only `main.js`, so a unit that calls a function an earlier stage moved into a `ui/` module looks DOM-free. The planner treats a unit that imports from a `ui/` path as ui; `tests/core_purity.js` (Task 3) fails on a core file that imports from `ui/` or calls a DOM method.
3. **The seam facades drifting apart.** `#country/core/seam` must export the same names in both countries, and each name must be a country unit. The applier throws if the two facades differ; `tests/country_contract.js` checks the result after every batch.
4. **A mutable binding that moves away from one of its writers.** A `let` moves only with its single writer function; the applier refuses a module that declares a binding assigned outside it. Pinned by the refusal cases of `tests/extract_units.js` and by the planner's `bindings.needsDecision` list, which must stay the eight UI bindings.
5. **Speed.** `taxFor` and the withdrawal helpers are the hottest code in the app, and they now sit in other modules. The bundle puts them in one scope, so nothing should change; pinned by the interleaved timing gate in Task 8 (at most +5%).

## File Structure

Created:
- `scripts/compare-builds.js` - statement-by-statement comparison of two trees' built planners (Task 4).
- `scripts/extractions/stage3.json` - the generated manifest: 38 modules in 6 batches, the seam names, the mutable-binding report (Task 4).
- About 38 modules under `src/shared/core/`, `src/us/core/`, `src/canada/core/`, plus `src/us/core/seam.js` and `src/canada/core/seam.js` (Tasks 5-7).
- `docs/superpowers/inventory/stage3-region-map.md` (Task 9).

Modified: `scripts/lib/extraction-plan.js`, `scripts/lib/extract-units.js`, `scripts/lib/country-contract.js`, `scripts/plan-extraction.js`, `scripts/extract-units.js`, `tests/extraction_plan.js`, `tests/extract_units.js`, `tests/core_purity.js`, `src/shared/core/money-format.js`, `src/shared/ui/money-format.js`, `src/us/main.js`, `src/canada/main.js`, `shared/*.js` fragments (shrinking or deleted), `CLAUDE.md`, the spec, the regenerated `docs/superpowers/inventory/closure-*.md`.

---

### Task 0: Preflight

**Files:** none changed.

- [ ] **Step 1: Confirm the branch and a clean tree**

Run: `git branch --show-current && git status --short`
Expected: `tyler/stage3-higher-layers`, and no output from `git status`. (If the plan file shows as uncommitted, commit it first: `git add docs/superpowers && git commit -m "Plan: stage 3 extraction" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`.)

- [ ] **Step 2: Green baseline**

Run (background, about 5 minutes; the foreground limit is 10 minutes): `npm test > /tmp/stage3-baseline.log 2>&1; echo "exit $?" >> /tmp/stage3-baseline.log`
Expected: the last line is `exit 0`. Then `git rev-parse HEAD`; write the hash down as `BASE`.

---

### Task 1: The planner: mutable bindings, DOM-free only, the seam, cycles, fewer modules

**Files:**
- Modify: `scripts/lib/extraction-plan.js` (replace the whole file), `scripts/plan-extraction.js` (replace the whole file), `tests/extraction_plan.js`, `tests/extract_units.js` (one fixture edit)

**Interfaces:**
- Consumes: `analyze(code)` from `scripts/analyze-closure.js` (units with `label`, `names`, `kind`, `deps`, `ui`, `importUses`, `region`, `regionKind`; the model's `mutables` `{ name, declaredIn, line, writers }`, `imports`, `order`).
- Produces: `planExtraction(root, { maxLayer = Infinity, maxBatch = 2, coreOnly = false, seam = [], names = {} })` returning `{ modules, seam, bindings, stats }`. `modules[i]` is `{ path, owner, depth, batch, ui, regions, units: { us, canada } }` as in stage 2. `seam` is the option's list. `bindings.<country>` is `{ colocated: [{ declaredIn, writer }], needsDecision: [{ names, declaredIn, writers }] }`. Task 4 generates the manifest with it; Task 2's `applyModules` consumes `modules`.

- [ ] **Step 1: Update the two test files (they fail first)**

In `tests/extraction_plan.js` make three edits with the Edit tool, then append the new block:

1. In `US_EXTRA`, replace
```js
  '  function bump() {',
  '    counter++;',
  '  }',
```
with
```js
  '  function bump() {',
  '    counter++;',
  '  }',
  '  function reset() {',
  '    counter = 0;',
  '  }',
```
(`counter` now has two writers, which keeps it, `bump` and `reset` in `main.js`; a binding with one writer would move.)

2. Replace the comment line `  // A binding assigned elsewhere (`counter`, written by bump) and its writer stay, and so does a side-effect statement.` with `  // A binding with two writers (`counter`, written by bump and reset) and its writers stay, and so does a side-effect statement.`

3. Replace the assertion `assert.ok(!planned.includes('counter') && !planned.includes('bump'), 'a mutable binding and its writer must stay');` with `assert.ok(!planned.includes('counter') && !planned.includes('bump') && !planned.includes('reset'), 'a shared mutable binding and its writers must stay');`

4. Insert this block directly above the final line `  console.log('extraction_plan OK');`:

```js

  // ---- stage 3: mutable bindings, DOM-free only, seams, cycles between a shared region and country code
  const planOf = (usLines, caLines, options, files = {}) => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-plan-'));
    made.push(r);
    write(r, 'src/package.json', '{ "private": true, "type": "module" }\n');
    const wrap = (lines) =>
      [...lines.filter((l) => l.startsWith('import ')), '(() => {', ...lines.filter((l) => !l.startsWith('import ')), '})();', ''].join('\n');
    write(r, 'src/us/main.js', wrap(usLines));
    write(r, 'src/canada/main.js', wrap(caLines));
    for (const [rel, text] of Object.entries(files)) write(r, rel, text);
    return planExtraction(r, options);
  };
  const countryUnits = (plan, country) => plan.modules.filter((m) => m.owner === country).flatMap((m) => m.units[country]);
  const NONE = [];

  // One writer function and no statement writer: the declaration moves with its writer, and a reader comes along.
  const colocate = [
    '  let counter = 0;',
    '  function bump() {',
    '    counter++;',
    '  }',
    '  function peek() {',
    '    return counter;',
    '  }',
  ];
  let p = planOf(colocate, NONE, { coreOnly: true });
  assert.deepStrictEqual(countryUnits(p, 'us').sort(), ['bump', 'counter', 'peek']);
  assert.deepStrictEqual(p.bindings.us.colocated, [{ declaredIn: 'counter', writer: 'bump' }]);
  assert.deepStrictEqual(p.bindings.us.needsDecision, []);
  assert.strictEqual(p.modules.length, 1, 'the binding and its writer are one module');

  // Two writers, or a statement writer: nothing that touches the binding moves, and the binding is reported.
  p = planOf(
    [
      '  let level = 0;',
      '  function up() {',
      '    level++;',
      '  }',
      '  function down() {',
      '    level--;',
      '  }',
      '  let mode = 0;',
      '  function pure() {',
      '    return 1;',
      '  }',
      '  mode = 2;',
    ],
    NONE,
    {},
  );
  assert.deepStrictEqual(countryUnits(p, 'us'), ['pure']);
  assert.deepStrictEqual(
    p.bindings.us.needsDecision.map((b) => ({ names: b.names, writers: b.writers.map((w) => (w.startsWith('statement@') ? 'statement' : w)) })),
    [
      { names: ['level'], writers: ['down', 'up'] },
      { names: ['mode'], writers: ['statement'] },
    ],
  );

  // coreOnly leaves a unit that touches the DOM, and a unit that depends on it.
  const dom = ["  function paint() {", "    document.title = 'x';", '  }', '  function viaPaint() {', '    paint();', '  }', '  function pure() {', '    return 1;', '  }'];
  assert.deepStrictEqual(countryUnits(planOf(dom, NONE, { coreOnly: true }), 'us'), ['pure']);
  assert.deepStrictEqual(countryUnits(planOf(dom, NONE, {}), 'us').sort(), ['paint', 'pure', 'viaPaint']);
  assert.ok(planOf(dom, NONE, {}).modules.some((m) => m.ui && m.path.includes('/ui/')), 'DOM code goes under ui/ when it is moved');

  // A unit that imports from a ui/ module is ui code, although its own text touches no browser global.
  const viaImport = ["  function usesUi() {", '    return helperUi();', '  }', '  function pure() {', '    return 1;', '  }'];
  const withImport = (lines) => ["import { helperUi } from './ui/thing.js';", ...lines];
  const uiFile = { 'src/us/ui/thing.js': 'export const helperUi = () => 2;\n' };
  p = planOf(withImport(viaImport), NONE, { coreOnly: true }, uiFile);
  assert.deepStrictEqual(countryUnits(p, 'us'), ['pure']);

  // A path an earlier stage already made is never reused.
  p = planOf(['  function rate() {', '    return 1;', '  }'], NONE, {}, { 'src/us/core/rate.js': 'export const x = 1;\n' });
  assert.deepStrictEqual(p.modules.map((m) => m.path), ['src/us/core/rate-2.js']);

  // maxBatch caps the batch number; maxLayer is unlimited by default.
  const chain = ['  const a = 1;', '  const b = a + 1;', '  const c = b + 1;', '  const d = c + 1;'];
  p = planOf(chain, NONE, { maxBatch: 1 });
  assert.ok(p.modules.every((m) => m.batch <= 1));
  assert.deepStrictEqual(countryUnits(p, 'us').sort(), ['a', 'b', 'c', 'd']);

  // A shared region may use a country unit only through the seam names, and only when the names exist in both planners.
  const seamUs = [
    '  // @@shared:calls begin',
    '  function callTax(n) {',
    '    return taxFor(n) + 1;',
    '  }',
    '  // @@shared:calls end',
    '  function taxFor(n) {',
    '    return n * 2;',
    '  }',
  ];
  const seamCa = seamUs.map((l) => l.replace('n * 2', 'n * 3'));
  const seamFiles = { 'shared/calls.js': seamUs.slice(1, 4).join('\n') + '\n' };
  assert.deepStrictEqual(countryUnits(planOf(seamUs, seamCa, {}, seamFiles), 'us'), ['taxFor']);
  p = planOf(seamUs, seamCa, { seam: ['taxFor'] }, seamFiles);
  assert.deepStrictEqual(p.seam, ['taxFor']);
  assert.ok(p.modules.some((m) => m.owner === 'shared' && m.units.us.includes('callTax')), 'the shared unit moves through the seam');
  assert.throws(() => planOf(seamUs, seamCa, { seam: ['nope'] }, seamFiles), /seam name nope/);

  // A shared region and a country run that would import each other as whole modules are split until they do not.
  const cycUs = (n) => [
    '  // @@shared:pair begin',
    '  function f(n) {',
    '    return g(n) + 1;',
    '  }',
    '  function h(n) {',
    '    return n + 1;',
    '  }',
    '  // @@shared:pair end',
    '  function g(n) {',
    `    return h(n) * ${n};`,
    '  }',
    '  function k(n) {',
    '    return f(n) - 1;',
    '  }',
  ];
  const pairFiles = { 'shared/pair.js': cycUs(2).slice(1, 7).join('\n') + '\n' };
  p = planOf(cycUs(2), cycUs(3), { seam: ['g'] }, pairFiles);
  const sharedModules = p.modules.filter((m) => m.owner === 'shared');
  assert.deepStrictEqual(sharedModules.map((m) => m.units.us).sort(), [['f'], ['h']], 'f and h are in modules of their own');
  assert.deepStrictEqual(countryUnits(p, 'us').sort(), ['g', 'k']);
```

In `tests/extract_units.js` make the same first edit (add `reset` after `bump` in `US_EXTRA`; the extraction itself is unchanged by it, and the existing refusal case for `counter` keeps working).

- [ ] **Step 2: Run the planner test to see it fail**

Run: `node tests/extraction_plan.js`
Expected: FAIL (an assertion error: the old planner returns no `bindings`, and its default layer limit and mutable rule differ).

- [ ] **Step 3: Replace the planner**

Write `scripts/lib/extraction-plan.js` with exactly this content (Write tool):

```js
'use strict';
// Plans which top-level units can move out of src/<country>/main.js into modules (spec section 13).
//
// planExtraction(root, { maxLayer, maxBatch, coreOnly, names }) returns { modules, stats, bindings }:
//   modules: [{ path, owner: 'shared' | 'us' | 'canada', batch, depth, ui, units: { us: [label], canada: [label] } }]
//
// A unit is movable when it is not a side-effect statement, sits in layer <= maxLayer (the longest chain of
// dependencies down to a leaf, leaf = 0; no limit by default), is not a DOM-touching unit when coreOnly is set,
// is not a declaration of a mutable binding that stays behind (see below), and every unit it depends on is
// movable too (a fixpoint).
//
// Mutable bindings (spec section 14): a `let` whose every name is written by one and the same function, and by no
// side-effect statement, is private state of that function; its declaration moves into the function's module
// (the two are movable only together). Any other mutable binding (several writers, or a statement writer) is
// reported in `bindings.<country>.needsDecision` and nothing that depends on it moves. A unit inside an @@shared region only moves when it is movable in both
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
  // mutable bindings, grouped by the unit that declares them
  const bindings = new Map();
  for (const m of model.mutables) {
    if (!bindings.has(m.declaredIn)) bindings.set(m.declaredIn, { declaredIn: m.declaredIn, names: [], writerSets: [] });
    const b = bindings.get(m.declaredIn);
    b.names.push(m.name);
    b.writerSets.push([...m.writers].sort());
  }
  const colocated = new Map(); // declaring unit -> its single writer function
  const needsDecision = [];
  for (const b of bindings.values()) {
    const first = b.writerSets[0];
    const same = b.writerSets.every((w) => w.length === first.length && w.every((x, i) => x === first[i]));
    const writer = same && first.length === 1 && byLabel.get(first[0]).kind !== 'statement' ? first[0] : null;
    if (writer) colocated.set(b.declaredIn, writer);
    else needsDecision.push({ names: b.names, declaredIn: b.declaredIn, writers: [...new Set(b.writerSets.flat())].sort() });
  }
  const blockedBindings = new Set(needsDecision.map((b) => b.declaredIn));
  const importSource = new Map(model.imports.map((i) => [i.local, path.resolve(root, 'src', country, i.source)]));
  const countryDir = path.join(root, 'src', country) + path.sep;
  return {
    model,
    byLabel,
    depth: (label) => depthOfComp.get(compOf.get(label)),
    blockedBindings,
    importSource,
    colocated,
    needsDecision,
    // country code a unit reaches through an import (a module an earlier stage created), other than the allowed seam names
    importsCountryCode: (u, allowed) => u.importUses.some((n) => !allowed.has(n) && (importSource.get(n) || '').startsWith(countryDir)),
    // a unit that imports a ui/ module is ui code, whatever its own text does (the analyzer sees only main.js)
    importsUi: (u) => u.importUses.some((n) => /[\\/]ui[\\/]/.test(importSource.get(n) || '')),
  };
}

function existingModules(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  walk(path.join(root, 'src'));
  return out;
}

function planExtraction(root, { maxLayer = Infinity, maxBatch = 2, coreOnly = false, seam = [], names = {} } = {}) {
  const seamNames = new Set(seam);
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const owner = (c, u) => (u.regionKind === 'shared' ? 'shared' : c);
  const uiUnit = (c, u) => u.ui || info[c].importsUi(u);
  const isUi = (c, u) =>
    owner(c, u) === 'shared' ? COUNTRIES.some((cc) => uiUnit(cc, info[cc].byLabel.get(u.label) || u)) : uiUnit(c, u);

  for (const name of seamNames) {
    for (const c of COUNTRIES) {
      const u = info[c].byLabel.get(name);
      const imported = (info[c].importSource.get(name) || '').startsWith(path.join(root, 'src', c) + path.sep);
      if ((!u || owner(c, u) === 'shared') && !imported) throw new Error(`seam name ${name} must be a country unit or a country import in ${c}/main.js`);
    }
  }
  const movable = Object.fromEntries(COUNTRIES.map((c) => [c, new Set()]));
  const candidates = {};
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) {
      if (u.kind === 'statement') continue;
      if (info[c].depth(u.label) > maxLayer) continue;
      if (info[c].blockedBindings.has(u.label)) continue;
      if (coreOnly && uiUnit(c, u)) continue;
      movable[c].add(u.label);
    }
    candidates[c] = movable[c].size;
  }
  // a colocated declaration and its writer function are partners: each is movable only with the other
  const partnerOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  for (const c of COUNTRIES) {
    for (const [declarer, writer] of info[c].colocated) {
      partnerOf[c].set(declarer, writer);
      partnerOf[c].set(writer, declarer);
    }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      for (const label of [...movable[c]]) {
        const u = info[c].byLabel.get(label);
        let ok = u.deps.every((d) => movable[c].has(d));
        const partner = partnerOf[c].get(label);
        if (ok && partner) ok = movable[c].has(partner) && owner(c, info[c].byLabel.get(partner)) === owner(c, u);
        if (ok && owner(c, u) === 'shared') {
          ok =
            u.deps.every((d) => owner(c, info[c].byLabel.get(d)) === 'shared' || seamNames.has(d)) &&
            !info[c].importsCountryCode(u, seamNames) &&
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
    for (const u of info[c].model.units) if (u.regionKind === 'data' && uiUnit(c, u)) dataSideUi.set(`${c}:${u.region}`, true);
  }

  // Group into module nodes, then into the module graph. A country run or a shared region can pull units of different
  // layers into one node and so close a cycle between a shared and a country module; the units of such nodes get
  // nodes of their own and the graph is built again (what remains cyclic is a real cycle between units).
  const fine = new Set();
  const build = () => {
  const nodes = []; // { owner, region?, units: { us: [], canada: [] } }
  const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const sharedByKey = new Map();
  let runSeq = 0;
  for (const c of COUNTRIES) {
    const units = [...info[c].model.units].sort((a, b) => a.startLine - b.startLine);
    let run = null;
    for (const u of units) {
      const isMovable = movable[c].has(u.label);
      const side = (u.regionKind === 'data' ? dataSideUi.get(`${c}:${u.region}`) : isUi(c, u)) ? 'ui' : 'core';
      if (isMovable && owner(c, u) === 'shared') {
        const key = fine.has(u.label) ? `${u.region}|${side}|${u.label}` : `${u.region}|${side}`;
        let node = sharedByKey.get(key);
        if (!node) {
          node = { owner: 'shared', region: u.region, group: `${u.region}|${side}`, units: { us: [], canada: [] } };
          sharedByKey.set(key, node);
          nodes.push(node);
        }
        node.units[c].push(u.label);
        nodeOf[c].set(u.label, node);
      } else if (isMovable && fine.has(u.label)) {
        if (!run) run = { id: runSeq++, core: null, ui: null };
        const node = { owner: c, group: `${c}#${run.id}|${side}`, units: { us: [], canada: [] } };
        node.units[c].push(u.label);
        nodes.push(node);
        nodeOf[c].set(u.label, node);
      } else if (isMovable) {
        if (!run) run = { id: runSeq++, core: null, ui: null };
        if (!run[side]) {
          run[side] = { owner: c, group: `${c}#${run.id}|${side}`, units: { us: [], canada: [] } };
          nodes.push(run[side]);
        }
        run[side].units[c].push(u.label);
        nodeOf[c].set(u.label, run[side]);
      } else if (u.kind !== 'statement') {
        run = null; // a unit that stays behind starts a new topic; side-effect statements stay but do not
      }
    }
  }

  return { nodes, nodeOf };
  };
  // The module graph of a set of nodes: an edge for every dependency between two nodes.
  const graphOf = ({ nodes, nodeOf }) => {
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
  for (const c of COUNTRIES) {
    for (const [declarer, writer] of info[c].colocated) {
      const a = nodeOf[c].get(declarer);
      const b = nodeOf[c].get(writer);
      if (a && b && a !== b) edges[index.get(a)].add(index.get(b));
    }
  }
  return { nodes, nodeOf, edges, index, comps: stronglyConnected(nodes.length, edges) };
  };
  let built = graphOf(build());
  for (;;) {
    const bad = built.comps.find((comp) => new Set(comp.map((v) => built.nodes[v].owner)).size > 1);
    if (!bad) break;
    const before = fine.size;
    for (const v of bad) for (const c of COUNTRIES) built.nodes[v].units[c].forEach((l) => fine.add(l));
    if (fine.size === before) throw new Error(`module cycle across owners between units: ${bad.map((v) => built.nodes[v].units.us.concat(built.nodes[v].units.canada).slice(0, 4).join(',')).join(' ; ')}`);
    built = graphOf(build());
  }
  // Fewer, larger modules: nodes that came from one region or one run are joined again when that closes no new cycle.
  const cyclic = (b) => b.comps.filter((comp) => comp.length > 1);
  const crossOwner = (b) => cyclic(b).some((comp) => new Set(comp.map((v) => b.nodes[v].owner)).size > 1);
  {
    const groups = new Map();
    for (const n of built.nodes) {
      if (!groups.has(n.group)) groups.set(n.group, []);
      groups.get(n.group).push(n);
    }
    for (const list of groups.values()) {
      const keep = list[0];
      for (const n of list.slice(1)) {
        const saved = { us: [...keep.units.us], canada: [...keep.units.canada] };
        COUNTRIES.forEach((c) => keep.units[c].push(...n.units[c]));
        const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map([...built.nodeOf[c]].map(([l, x]) => [l, x === n ? keep : x]))]));
        const trial = graphOf({ nodes: built.nodes.filter((x) => x !== n), nodeOf });
        if (!crossOwner(trial) && cyclic(trial).length <= cyclic(built).length) built = trial;
        else COUNTRIES.forEach((c) => (keep.units[c] = saved[c]));
      }
    }
  }
  const { nodes, nodeOf, edges, index, comps } = built;
  const compId = new Map();
  comps.forEach((comp, i) => comp.forEach((v) => compId.set(v, i)));
  const merged = comps.map((comp) => {
    const members = comp.map((v) => nodes[v]);
    const owners = new Set(members.map((m) => m.owner));
    if (owners.size > 1) throw new Error('module cycle across owners');
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
  const used = new Set(existingModules(root)); // a new module never takes the path of one an earlier stage made
  const modules = merged.map((m, i) => {
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    const ui = countries.some((c) => m.units[c].some((l) => uiUnit(c, info[c].byLabel.get(l))));
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
    return { path: p, owner: m.owner, depth: depth[i], batch: Math.min(depth[i], maxBatch), ui, regions: m.regions, units: m.units };
  });
  modules.sort((a, b) => a.batch - b.batch || a.depth - b.depth || a.path.localeCompare(b.path));

  const total = (c) => info[c].model.units.length;
  const moved = (c) => modules.filter((m) => m.owner === 'shared' || m.owner === c).reduce((s, m) => s + m.units[c].length, 0);
  return {
    modules,
    seam: [...seamNames],
    bindings: Object.fromEntries(
      COUNTRIES.map((c) => [
        c,
        {
          colocated: [...info[c].colocated].map(([declaredIn, writer]) => ({ declaredIn, writer })),
          needsDecision: info[c].needsDecision,
        },
      ]),
    ),
    stats: Object.fromEntries(COUNTRIES.map((c) => [c, { units: total(c), candidates: candidates[c], movable: moved(c) }])),
  };
}

module.exports = { planExtraction, kebab };
```

- [ ] **Step 4: Replace the command-line wrapper**

Write `scripts/plan-extraction.js` with exactly this content:

```js
#!/usr/bin/env node
'use strict';
// Prints the extraction plan (the manifest of modules and their batches) as JSON.
//   node scripts/plan-extraction.js [--max-layer=N] [--max-batch=N] [--core-only] > scripts/extractions/<stage>.json
// --max-layer: only units this many layers above a leaf or lower (default: no limit).
// --max-batch: modules deeper than this share the last batch (default 2).
// --seam=a,b: country units that shared modules may import through #country/core/seam (the same names in both planners).
// --core-only: leave every unit that touches the DOM, or depends on one, in main.js.
// Module names can be overridden in scripts/extractions/names.json: "shared:<region>" or "<country>:<first unit label>".
const fs = require('fs');
const path = require('path');
const { planExtraction } = require('./lib/extraction-plan');

const root = path.join(__dirname, '..');
const namesFile = path.join(root, 'scripts', 'extractions', 'names.json');
const names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
const number = (flag) => {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? Number(arg.split('=')[1]) : undefined;
};
const options = { names, coreOnly: process.argv.includes('--core-only') };
const seamArg = process.argv.find((a) => a.startsWith('--seam='));
if (seamArg) options.seam = seamArg.split('=')[1].split(',');
if (number('--max-layer') !== undefined) options.maxLayer = number('--max-layer');
if (number('--max-batch') !== undefined) options.maxBatch = number('--max-batch');
process.stdout.write(`${JSON.stringify(planExtraction(root, options), null, 2)}\n`);
```

- [ ] **Step 5: Run the tests**

Run: `node tests/extraction_plan.js && node tests/extract_units.js && node tests/marker_source.js && node tests/closure_analyzer.js`
Expected: `extraction_plan OK`, `extract_units OK`, `marker_source OK` and the analyzer's OK line. (`extract_units.js` still uses the stage 2 applier here and passes; Task 2 extends both.)

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/extraction-plan.js scripts/plan-extraction.js tests/extraction_plan.js tests/extract_units.js
git commit -m "Tooling: the extraction planner moves single-writer bindings, selects DOM-free units, allows a country seam and splits cross-owner cycles" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The applier: the seam, side-effect and bare imports, block comments, staged writes

**Files:**
- Modify: `scripts/lib/extract-units.js` (replace the whole file), `scripts/extract-units.js` (replace the whole file), `scripts/lib/country-contract.js` (three small edits), `tests/extract_units.js`

**Interfaces:**
- Consumes: Task 1's `planExtraction` (the tests plan with `{ seam }` and apply the result).
- Produces: `applyModules(root, modules, { dryRun = false, seam = [] })` returning `{ modules, moved, deletedRegions, seam: { us: [names], canada: [names] }, warnings }`. A shared module that uses a country unit imports it from `'#country/core/seam'`; `src/<country>/core/seam.js` is written (or extended) with one `export { names } from './module.js';` line per source module; both facades must export the same names or nothing is written. The CLI passes `manifest.seam`.

- [ ] **Step 1: Add the new applier tests (they fail first)**

In `tests/extract_units.js` make two edits with the Edit tool.

1. Directly under the line `const { applyModules } = require('../scripts/lib/extract-units');` add `const { checkCountryContract } = require('../scripts/lib/country-contract');`.

2. Insert this block directly above the final line `  console.log('extract_units OK');`:

```js

  // ---- stage 3: side-effect imports, bare specifiers, namespace imports, block comments, staged writes, paths
  const mainWith = (importLines, body, tail = '  window.__out = 1;') => [...importLines, '(() => {', ...body, tail, '})();', ''].join('\n');
  const twoPlanners = (usImports, usBody, caImports = usImports, caBody = usBody, tail) => {
    const r = newRoot();
    write(r, 'src/us/main.js', mainWith(usImports, usBody, tail));
    write(r, 'src/canada/main.js', mainWith(caImports, caBody, tail));
    return r;
  };
  const leftovers = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? leftovers(full) : e.name.endsWith('.extract-tmp') ? [full] : [];
    });

  // a bare side-effect import stays in main.js, and nothing is left from the staged writes
  root = twoPlanners(["import './effect.js';"], ['  function one() {', '    return 1;', '  }'], ["import './effect.js';"], ['  function one() {', '    return 1;', '  }']);
  write(root, 'src/us/effect.js', 'window.__fx = 1;\n');
  write(root, 'src/canada/effect.js', 'window.__fx = 1;\n');
  applyModules(root, [{ path: 'src/us/core/one.js', owner: 'us', units: { us: ['one'], canada: [] } }]);
  assert.ok(read(root, 'src/us/main.js').startsWith("import './effect.js';\n(() => {\n"), read(root, 'src/us/main.js').split('\n').slice(0, 3).join('|'));
  assert.deepStrictEqual(leftovers(root), []);

  // a namespace import cannot be moved, and a module path outside src/ is refused
  const nsImport = ["import * as store from '../shared/core/store.js';"];
  const nsBody = ['  function base() {', '    return store.state.base;', '  }'];
  refuse(() => twoPlanners(nsImport, nsBody), one('src/us/core/b.js', 'us', ['base']), /namespace import/);
  refuse(fixture, one('lib/x.js', 'us', ['isEven']), /must lie under src/);

  // block comments above a unit travel with it
  root = twoPlanners(
    [],
    ['  /* one-line note */', '  function a() {', '    return 1;', '  }', '  /**', '   * the b function', '   */', '  function b() {', '    return 2;', '  }'],
  );
  applyModules(root, [{ path: 'src/us/core/ab.js', owner: 'us', units: { us: ['a', 'b'], canada: [] } }]);
  assert.ok(read(root, 'src/us/core/ab.js').includes('/* one-line note */') && read(root, 'src/us/core/ab.js').includes('the b function'));
  assert.ok(!read(root, 'src/us/main.js').includes('note */') && !read(root, 'src/us/main.js').includes('the b function'));

  // ---- the country seam
  const countryPackage = '{ "private": true, "type": "module", "imports": { "#country/*": { "us": "./us/*.js", "canada": "./canada/*.js" } } }\n';
  const SEAM_REGION = ['  // @@shared:calls begin', '  function callTax(n) {', '    return taxFor(n) + 1;', '  }', '  // @@shared:calls end'];
  const seamMain = (rate) => mainWith([], [...SEAM_REGION, '  function taxFor(n) {', `    return n * ${rate};`, '  }'], '  window.__out = callTax(5);');
  const seamFixture = () => {
    const r = newRoot();
    write(r, 'src/package.json', countryPackage);
    write(r, 'src/us/main.js', seamMain(2));
    write(r, 'src/canada/main.js', seamMain(3));
    write(r, 'shared/calls.js', SEAM_REGION.slice(1, -1).join('\n') + '\n');
    return r;
  };
  const runWith = async (r, country) => {
    const result = await esbuild.build({
      entryPoints: [path.join(r, 'src', country, 'main.js')],
      bundle: true,
      write: false,
      format: 'iife',
      logLevel: 'silent',
      outfile: 'out.js',
      conditions: [country],
    });
    const window = {};
    vm.runInNewContext(result.outputFiles[0].text, { window });
    return window.__out;
  };
  root = seamFixture();
  assert.deepStrictEqual([await runWith(root, 'us'), await runWith(root, 'canada')], [11, 16]);
  const seamPlan = planExtraction(root, { seam: ['taxFor'] });
  assert.throws(() => applyModules(root, seamPlan.modules), /not a seam name/, 'without the seam list a shared module cannot use country code');
  const seamReport = applyModules(root, seamPlan.modules, { seam: ['taxFor'] });
  assert.deepStrictEqual(seamReport.seam, { us: ['taxFor'], canada: ['taxFor'] });
  assert.strictEqual(read(root, 'src/us/core/seam.js'), "export { taxFor } from './tax-for.js';\n");
  assert.ok(read(root, 'src/shared/core/calls.js').startsWith("import { taxFor } from '#country/core/seam';"), read(root, 'src/shared/core/calls.js'));
  assert.deepStrictEqual([await runWith(root, 'us'), await runWith(root, 'canada')], [11, 16]);
  assert.deepStrictEqual(await checkCountryContract(path.join(root, 'src')), []);

  // a shared region and country code that would import each other as whole modules are split, and still behave
  const PAIR_REGION = ['  // @@shared:pair begin', '  function f(n) {', '    return g(n) + 1;', '  }', '  function h(n) {', '    return n + 1;', '  }', '  // @@shared:pair end'];
  const pairMain = (m) => mainWith([], [...PAIR_REGION, '  function g(n) {', `    return h(n) * ${m};`, '  }', '  function k(n) {', '    return f(n) - 1;', '  }'], '  window.__out = k(5);');
  root = newRoot();
  write(root, 'src/package.json', countryPackage);
  write(root, 'src/us/main.js', pairMain(2));
  write(root, 'src/canada/main.js', pairMain(3));
  write(root, 'shared/pair.js', PAIR_REGION.slice(1, -1).join('\n') + '\n');
  assert.deepStrictEqual([await runWith(root, 'us'), await runWith(root, 'canada')], [12, 18]);
  applyModules(root, planExtraction(root, { seam: ['g'] }).modules, { seam: ['g'] });
  assert.deepStrictEqual([await runWith(root, 'us'), await runWith(root, 'canada')], [12, 18]);
  assert.deepStrictEqual(leftovers(root), []);
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node tests/extract_units.js`
Expected: FAIL (the stage 2 applier drops the side-effect import and has no `seam` option).

- [ ] **Step 3: Replace the applier**

Write `scripts/lib/extract-units.js` with exactly this content:

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
// throws and writes nothing (the files are staged next to their targets and renamed into place at the end).
//
// Country seam (spec section 14): a shared module may use a country unit only through the names listed in `seam`.
// It then imports them from '#country/core/seam', and each country gets a facade, src/<country>/core/seam.js,
// that re-exports those names from the module that holds them. Both facades must export the same names.
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
    while (start - 1 > floor) {
      const above = lines[start - 2];
      if (/^\s*\/\//.test(above) && !SHARED_MARK.test(above) && !DATA_END.test(above)) {
        start--; // a "// NAME:end" marker belongs to the unit above it
        continue;
      }
      if (/^\s*\/\*/.test(above) && /\*\/\s*$/.test(above)) {
        start--; // a one-line block comment
        continue;
      }
      if (/\*\/\s*$/.test(above)) {
        let k = start - 1; // line number of the closing line
        while (k > floor && !/\/\*/.test(lines[k - 1])) k--;
        if (k > floor && /^\s*\/\*/.test(lines[k - 1])) {
          start = k;
          continue;
        }
      }
      break;
    }
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

const SEAM_KEY = 'seam:#country/core/seam';
const SEAM_FILE = 'core/seam.js';

function applyModules(root, modules, { dryRun = false, seam = [] } = {}) {
  const seamSet = new Set(seam);
  const facade = { us: new Map(), canada: new Map() }; // seam name -> absolute path of the module that holds it
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const warnings = [];
  const files = new Map(); // absolute path -> text (null = delete)

  // ---- 1. which module takes which unit, per country
  const moduleOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const seenPaths = new Set();
  for (const m of modules) {
    if (seenPaths.has(m.path)) throw new Error(`module path used twice: ${m.path}`);
    seenPaths.add(m.path);
    if (!path.resolve(root, m.path).startsWith(path.join(root, 'src') + path.sep)) throw new Error(`${m.path}: module paths must lie under src/`);
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
        if (m) {
          const viaSeam = m.owner === 'shared' && target.owner !== 'shared';
          for (const name of use.names) {
            if (viaSeam) {
              if (!seamSet.has(name)) throw new Error(`${m.path}: "${u.label}" uses country code "${name}", which is not a seam name`);
              facade[c].set(name, path.join(root, target.path));
              addNeed(m, c, SEAM_KEY, name, name);
            } else addNeed(m, c, path.join(root, target.path), name, name);
          }
        } else {
          const key = path.join(root, target.path);
          if (!mainImports[c].has(key)) mainImports[c].set(key, new Set());
          use.names.forEach((n) => mainImports[c].get(key).add(n));
        }
      }
      if (m) {
        for (const local of u.importUses) {
          const imp = impByLocal.get(local);
          if (imp.imported === '*') throw new Error(`${m.path}: "${u.label}" uses the namespace import "${local}", which is not supported`);
          const bare = !imp.source.startsWith('.');
          if (bare) {
            addNeed(m, c, `bare:${imp.source}`, local, imp.imported);
            continue;
          }
          const abs = path.resolve(ci.mainDir, imp.source);
          const inCountry = COUNTRIES.some((cc) => abs.startsWith(path.join(root, 'src', cc) + path.sep));
          if (m.owner === 'shared' && inCountry) {
            if (!seamSet.has(local) || imp.imported !== local) {
              throw new Error(`${m.path}: "${u.label}" uses "${local}" from ${imp.source}, which is country code and not a seam name`);
            }
            facade[c].set(local, abs);
            addNeed(m, c, SEAM_KEY, local, local);
            continue;
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
      for (const [target, names] of needs.get(m)?.[c] || new Map()) {
        const files = target === SEAM_KEY ? [...names.keys()].map((n) => facade[c].get(n)) : [target];
        for (const file of files) {
          const t = modules.find((x) => path.join(root, x.path) === file);
          if (t && t !== m) edges.get(m).add(t);
        }
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
      const source = target === SEAM_KEY ? '#country/core/seam' : target.startsWith('bare:') ? target.slice(5) : relImport(abs, target);
      importLines.push(importLine(specs, source));
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
    const bound = new Set(ci.model.imports.map((i) => i.source));
    const sideEffectOnly = [...new Set(decls.map((d) => d.source))].filter((src) => !bound.has(src));
    const importBlock = [...sideEffectOnly.map((src) => `import '${src}';`), ...[...bySource].map(([source, specs]) => importLine(specs, source))];
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
  for (const r of ca.regions) {
    if (!us.regions.some((x) => x.name === r.name)) throw new Error(`region ${r.name} exists in canada/main.js but not in us/main.js`);
  }
  for (const name of deleted) {
    if (us.regions.some((r) => r.name === name) || ca.regions.some((r) => r.name === name)) {
      throw new Error(`region ${name} was emptied in only one planner`);
    }
    files.set(path.join(fragmentDir, `${name}.js`), null);
  }

  // the country seam facades
  const facadeNames = {};
  for (const c of COUNTRIES) {
    const seamFile = path.join(root, 'src', c, SEAM_FILE);
    const targets = new Map(); // name -> absolute module path
    if (fs.existsSync(seamFile)) {
      for (const [, list, from] of readText(seamFile).matchAll(/^export \{ ([^}]+) \} from '([^']+)';$/gm)) {
        for (const name of list.split(',').map((x) => x.trim())) targets.set(name, path.resolve(path.dirname(seamFile), from));
      }
    }
    facade[c].forEach((target, name) => targets.set(name, target));
    facadeNames[c] = [...targets.keys()].sort();
    if (!targets.size) continue;
    const byModule = new Map();
    for (const [name, target] of targets) {
      if (!byModule.has(target)) byModule.set(target, []);
      byModule.get(target).push(name);
    }
    const lines = [...byModule]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([target, names]) => `export { ${names.sort().join(', ')} } from '${relImport(seamFile, target)}';`);
    const text = `${lines.join('\n')}\n`;
    if (!fs.existsSync(seamFile) || readText(seamFile) !== text) files.set(seamFile, text);
  }
  if (JSON.stringify(facadeNames.us) !== JSON.stringify(facadeNames.canada)) {
    throw new Error(`the country seam facades differ: us exports ${facadeNames.us.join(', ')}; canada exports ${facadeNames.canada.join(', ')}`);
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
    const staged = [];
    try {
      for (const [file, text] of files) {
        if (text === null) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.extract-tmp`, text);
        staged.push(file);
      }
    } catch (err) {
      staged.forEach((file) => fs.rmSync(`${file}.extract-tmp`, { force: true }));
      throw err;
    }
    staged.forEach((file) => fs.renameSync(`${file}.extract-tmp`, file));
    for (const [file, text] of files) if (text === null) fs.rmSync(file, { force: true });
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
    seam: facadeNames,
    warnings,
  };
}

module.exports = { applyModules };
```

- [ ] **Step 4: Replace the command-line wrapper**

Write `scripts/extract-units.js` with exactly this content:

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
  const report = applyModules(root, modules, { dryRun, seam: manifest.seam || [] });
  console.log(`${dryRun ? '[dry run] ' : ''}batch ${batch}: ${report.modules.length} modules; units moved: us ${report.moved.us}, canada ${report.moved.canada}`);
  if (report.deletedRegions.length) console.log(`regions removed: ${report.deletedRegions.join(', ')}`);
  if (report.seam.us.length) console.log('seam names: ' + report.seam.us.join(', '));
  report.warnings.forEach((w) => console.log(`warning: ${w}`));
} catch (err) {
  console.error(`extraction failed, nothing was written: ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 5: Let the country-contract check build seam modules**

A country's seam facade imports modules that import `#country/...` themselves, so the check's own bundling must resolve the alias. In `scripts/lib/country-contract.js` make three edits.

Replace `async function exportsOf(file) {` with `async function exportsOf(file, country) {`.

Replace
```js
    logLevel: 'silent',
  });
  return Object.values(result.metafile.outputs)[0].exports;
```
with
```js
    logLevel: 'silent',
    conditions: [country], // a seam module's own imports may use #country themselves (through shared code)
  });
  return Object.values(result.metafile.outputs)[0].exports;
```

and replace `exportsByCountry[country] = await exportsOf(file);` with `exportsByCountry[country] = await exportsOf(file, country);`.

- [ ] **Step 6: Run the tests**

Run: `node tests/extract_units.js && node tests/extraction_plan.js && node tests/country_contract.js`
Expected: `extract_units OK`, `extraction_plan OK`, `country_contract OK`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/extract-units.js scripts/extract-units.js scripts/lib/country-contract.js tests/extract_units.js
git commit -m "Tooling: the extraction tool imports country code through a seam facade, carries side-effect imports and block comments, stages its writes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Core guards, and `attachMoneyPreview` moves to `ui/`

**Files:**
- Modify: `src/shared/core/money-format.js`, `src/shared/ui/money-format.js`, `tests/core_purity.js` (replace the whole file)

`src/shared/core/money-format.js` still holds `attachMoneyPreview` (stage 2 left it in `core/`): it sets `type` and `inputMode` on, and adds a listener to, an element it is handed, and no browser global names that. The new guard in this task would fail on it, so the helper moves first.

- [ ] **Step 1: Move the helper**

Write `relocate-money.js` in the session scratchpad directory (Write tool), then run it from the repo root:

```js
// One-off: moves attachMoneyPreview (the DOM part of money-format) from src/shared/core/ to src/shared/ui/.
// Run from the repo root. Text moves verbatim.
const fs = require('fs');
const coreFile = 'src/shared/core/money-format.js';
const uiFile = 'src/shared/ui/money-format.js';
const lines = fs.readFileSync(coreFile, 'utf8').replace(/\r\n/g, '\n').split('\n');
const start = lines.findIndex((l) => l.startsWith('  // Dollar-amount fields (class="money")'));
if (start < 0) throw new Error('the attachMoneyPreview comment block was not found');
const moved = lines.slice(start).join('\n').replace(/\n+$/, '');
let core = lines.slice(0, start);
// the first line is a stray note about `ids`; it belongs to the field wiring, not to money formatting
if (/`ids` \(the plain numeric inputs\) is derived from FIELDS above\./.test(core[0])) core = core.slice(1);
fs.writeFileSync(coreFile, `${core.join('\n').replace(/\n+$/, '')}\n`);
const ui = fs.readFileSync(uiFile, 'utf8').replace(/\r\n/g, '\n');
const importLine = "import { attachMoneyPreview } from '../core/money-format.js';\n\n";
if (!ui.startsWith(importLine)) throw new Error('unexpected start of the ui module');
fs.writeFileSync(uiFile, `${moved}\n${ui.slice(importLine.length)}`);
console.log(`moved ${moved.split('\n').length} lines to ${uiFile}`);
```

Run: `node <scratchpad>/relocate-money.js`
Expected: `moved 63 lines to src/shared/ui/money-format.js`. `git diff --stat` shows the two money-format files only; `src/shared/core/money-format.js` now holds `money` and `compact` only.

- [ ] **Step 2: Replace the purity guard**

Write `tests/core_purity.js` with exactly this content:

```js
// Files under src/**/core/ must not touch the DOM or browser storage (spec section 3, rule 1): they have to be
// importable in plain Node. Uses scope analysis, so comments, strings and local names that happen to be called
// `window` or `document` do not count. Three more rules (spec section 14):
//  - a core file calls no DOM method on an element it is handed (a global-free helper can still be DOM code);
//  - a core file imports nothing from a ui/ directory (core code cannot depend on DOM code);
//  - the same holds for the '#country/...' seam: a country's seam file lives in core/ and re-exports core names only.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { domGlobalsUsed } = require('../scripts/analyze-closure');

const root = path.join(__dirname, '..');
const DOM_METHODS = /\.(addEventListener|removeEventListener|setSelectionRange|appendChild|removeChild|setAttribute|removeAttribute|querySelector|querySelectorAll|classList|innerHTML|textContent|getBoundingClientRect)\b/;
const IMPORT_SOURCE = /(?:from|import)\s*['"]([^'"]+)['"]/g;

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
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = coreFiles(path.join(root, 'src'));
assert.ok(files.length > 0, 'expected core/ files');
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const code = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const used = domGlobalsUsed(code);
  assert.deepStrictEqual(
    used.map((u) => `${u.name} (line ${u.line})`),
    [],
    `${rel} is under core/ but uses browser globals (move it to ui/)`,
  );
  const text = stripComments(code);
  const method = DOM_METHODS.exec(text);
  assert.ok(!method, `${rel} is under core/ but calls a DOM method (${method && method[0]}); move it to ui/`);
  for (const [, source] of text.matchAll(IMPORT_SOURCE)) {
    const target = source.startsWith('.') ? path.resolve(path.dirname(file), source) : source;
    const segments = target.split(/[\\/]/);
    assert.ok(!segments.includes('ui'), `${rel} is under core/ but imports ${source}, a ui/ module`);
  }
}
console.log(`core_purity OK (${files.length} core files)`);
```

- [ ] **Step 3: Check the guards and the build**

Run: `npm run build && node tests/core_purity.js && node tests/closure_names.js && node tests/country_contract.js`
Expected: the build line, `core_purity OK (94 core files)`, `closure_names OK (127 files)`, `country_contract OK`. To see the new rules bite, temporarily add `el.addEventListener('x', () => {});` inside a function in a `core/` file and run `node tests/core_purity.js` (it must fail naming the file), then `git checkout -- <that file>`; do the same with `import { refreshMoneyPreviews } from '../ui/money-format.js';` at the top of a `src/shared/core/` file. Neither change may remain.

- [ ] **Step 4: Full suite**

Run (background): `npm test > /tmp/stage3-t3.log 2>&1; echo "exit $?" >> /tmp/stage3-t3.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/shared tests/core_purity.js
git commit -m "Guards: core/ files call no DOM method and import nothing from ui/; attachMoneyPreview moves to ui/" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The build comparison and the stage 3 manifest

**Files:**
- Create: `scripts/compare-builds.js`, `scripts/extractions/stage3.json`

**Interfaces:**
- Produces: `node scripts/compare-builds.js --base DIR [--head DIR]` compares the built planners of two trees (each needs a built `dist/`); exit 0 and `missing from head 0, new in head 0` per planner when the same statements appear. Tasks 5-8 run it after every batch against the base tree built here.

- [ ] **Step 1: Build the base tree**

`BASE` is the hash from Task 0 step 2 (the commit before this stage's tooling; the built output of any commit on this branch before Task 5 is the same, because Tasks 1-4 change no planner code except Task 3's helper move, which does not change the bundled statements).

Run:
```bash
git worktree add ../Fire-Planner-base BASE
(cd ../Fire-Planner-base && npm ci && npm run build)
```
Expected: `built 2 planners into dist` in the base tree.

- [ ] **Step 2: Create the comparison script**

Write `scripts/compare-builds.js` with exactly this content:

```js
#!/usr/bin/env node
'use strict';
// Compares the built planners of two trees statement by statement (a refactor must change where code lives, not what it is).
//   node scripts/compare-builds.js --base <dir-with-dist> [--head <dir-with-dist>]
// For each planner it takes the inline script, flattens the nested IIFEs, splits multi-declarator declarations and
// compares the multiset of statement texts (whitespace normalised). Exit 1 and a list of the differences otherwise.
// esbuild may drop a declaration that is unused; list such names in ALLOWED_DROPS below with the reason.
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ALLOWED_DROPS = [];
const PLANNERS = ['Planner_US.html', 'Planner_Canada.html'];

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const baseDir = value('--base');
const headDir = value('--head') || path.join(__dirname, '..');
if (!baseDir) {
  console.error('usage: node scripts/compare-builds.js --base <dir-with-dist> [--head <dir-with-dist>]');
  process.exit(2);
}

function scriptOf(dir, planner) {
  const html = fs.readFileSync(path.join(dir, 'dist', planner), 'utf8').replace(/\r\n/g, '\n');
  const open = html.lastIndexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < open) throw new Error(`${dir}/dist/${planner}: no inline script`);
  return html.slice(open + '<script>'.length, close);
}

const isIife = (stmt) => {
  if (stmt.type !== 'ExpressionStatement') return null;
  let e = stmt.expression;
  if (e.type === 'UnaryExpression') e = e.argument;
  if (e.type !== 'CallExpression') return null;
  const f = e.callee.type === 'MemberExpression' ? e.callee.object : e.callee;
  return (f.type === 'FunctionExpression' || f.type === 'ArrowFunctionExpression') && f.body.type === 'BlockStatement' ? f.body : null;
};

function statements(code) {
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'script', range: true });
  const out = [];
  const visit = (body) => {
    for (const stmt of body) {
      const inner = isIife(stmt);
      if (inner) visit(inner.body);
      else if (stmt.type === 'VariableDeclaration' && stmt.declarations.length > 1) {
        for (const d of stmt.declarations) out.push(`var ${code.slice(d.range[0], d.range[1])}`);
      } else out.push(code.slice(stmt.range[0], stmt.range[1]));
    }
  };
  visit(ast.body);
  // esbuild turns a module's top-level const and let into var when it bundles, so declarations compare as var
  return out.map((t) => t.replace(/\s+/g, ' ').replace(/;$/, '').trim().replace(/^(const|let) /, 'var '));
}

const tally = (list) => {
  const m = new Map();
  list.forEach((t) => m.set(t, (m.get(t) || 0) + 1));
  return m;
};

let failed = false;
for (const planner of PLANNERS) {
  const base = tally(statements(scriptOf(baseDir, planner)));
  const head = tally(statements(scriptOf(headDir, planner)));
  const missing = [];
  const added = [];
  for (const [t, n] of base) if ((head.get(t) || 0) < n) missing.push(t);
  for (const [t, n] of head) if ((base.get(t) || 0) < n) added.push(t);
  const allowed = (t) => ALLOWED_DROPS.some((a) => t.includes(a));
  const realMissing = missing.filter((t) => !allowed(t));
  const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`${planner}: base ${total(base)} statements, head ${total(head)}; missing from head ${missing.length}, new in head ${added.length}`);
  if (realMissing.length || added.length) {
    failed = true;
    realMissing.slice(0, 10).forEach((t) => console.log(`  missing: ${t.slice(0, 140)}`));
    added.slice(0, 10).forEach((t) => console.log(`  new:     ${t.slice(0, 140)}`));
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Check it on the unchanged tree**

Run: `npm run build && node scripts/compare-builds.js --base ../Fire-Planner-base`
Expected, exit 0:
```
Planner_US.html: base 816 statements, head 816; missing from head 0, new in head 0
Planner_Canada.html: base 538 statements, head 538; missing from head 0, new in head 0
```

- [ ] **Step 4: Generate the manifest**

Run:
```bash
node scripts/plan-extraction.js --core-only --max-batch=5 --seam=taxFor,BUCKET_STEP,runProjection,normalizeState,defaults,ESTIMATE_ALWAYS_IDS,ESTIMATE_GATED_GROUPS,TAXABLE_BASIS_KEY,housingForYear,STANDARD_MODE,BUCKET_MODE > scripts/extractions/stage3.json
node -e "const p=require('./scripts/extractions/stage3.json');const by={};p.modules.forEach(m=>by[m.batch]=(by[m.batch]||0)+1);console.log(p.modules.length,JSON.stringify(by),JSON.stringify(p.stats));for(const c of ['us','canada'])console.log(c,'colocated',p.bindings[c].colocated.length,'needsDecision:',p.bindings[c].needsDecision.map(b=>b.names.join('+')).join(', '))"
```
Expected:
```
38 {"0":3,"1":3,"2":5,"3":4,"4":2,"5":21} {"us":{"units":385,"candidates":88,"movable":74},"canada":{"units":283,"candidates":69,"movable":52}}
us colocated 12 needsDecision: theme, sidebarCollapsed, hadSavedState, infoBubbleBtn, reviewingFieldId, setMobileView, undoSnapshot, wizardStep
canada colocated 13 needsDecision: theme, sidebarCollapsed, hadSavedState, infoBubbleBtn, reviewingFieldId, setMobileView, undoSnapshot, wizardStep
```
If the numbers differ, `main.js` changed since this plan was written: stop and report, do not edit the manifest by hand.

- [ ] **Step 5: Commit**

```bash
git add scripts/compare-builds.js scripts/extractions/stage3.json
git commit -m "Extraction: the stage 3 manifest (38 modules in 6 batches) and the build comparison" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Batches 0 and 1 (6 modules)

**Files:** 6 new modules under `src/shared/core`, `src/us/core`, `src/canada/core`; `src/us/main.js`, `src/canada/main.js`; `shared/*.js` fragments.

For each of the two batches in turn (batch `N` = 0, then 1) run steps 1-3; then run step 4 once.

- [ ] **Step 1: Apply**

Run:
```bash
node scripts/extract-units.js --manifest scripts/extractions/stage3.json --batch N --dry-run
node scripts/extract-units.js --manifest scripts/extractions/stage3.json --batch N
```
Expected for `N = 0` (both runs print the same, the first with `[dry run] ` in front): `batch 0: 3 modules; units moved: us 4, canada 4`, `regions removed: 01-LIST_MAX, 06-histTaxFactors, 11-makeProjectedExpense`, `seam names: defaults, housingForYear`, and no `warning:` line. For `N = 1`: `batch 1: 3 modules; units moved: us 35, canada 25`, `seam names: defaults, housingForYear`, no regions removed, no warning. If a run prints `extraction failed, nothing was written: ...`, stop and report the message.

- [ ] **Step 2: Guards**

Run: `node scripts/sync-shared.js --check && npm run build && node tests/closure_names.js && node tests/core_purity.js && node tests/country_contract.js && node scripts/compare-builds.js --base ../Fire-Planner-base && wc -l src/us/main.js src/canada/main.js | head -2`
Expected after batch 0: `shared regions OK (29 regions x 2 planners)`, `closure_names OK (132 files)`, `core_purity OK (99 core files)`, `country_contract OK`, the two comparison lines with `missing from head 0, new in head 0`, and about 8,997 (US) and 6,136 (Canada) lines. After batch 1: 29 regions, 135 files, 102 core files, 7,296 and 5,063 lines.

- [ ] **Step 3: Commit the batch**

```bash
git add -A src shared
git status --short
git commit -m "Extraction batch N: M modules (U US and C Canada units) out of main.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
with `N`, `M`, `U`, `C` = `0`, `3`, `4`, `4` for the first commit and `1`, `3`, `35`, `25` for the second. `git status` before the commit lists only `src/` and `shared/` paths (no `docs/`: the generated rules docs do not change in this stage; `git status --short docs` prints nothing).

- [ ] **Step 4: Full suite (after both commits)**

Run (background): `npm test > /tmp/stage3-t5.log 2>&1; echo "exit $?" >> /tmp/stage3-t5.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

---

### Task 6: Batches 2, 3 and 4 (11 modules)

**Files:** as Task 5.

For each batch `N` = 2, then 3, then 4 run steps 1-3 of Task 5 with these expected values; then run its step 4 once.

| batch | modules | units moved | regions removed | seam names | after: regions / closure_names / core_purity / main.js lines |
|---|---|---|---|---|---|
| 2 | 5 | us 4, canada 2 | `drawTaxable` | `defaults, housingForYear, taxFor` | 28 / 140 files / 107 / 7,192 and 5,028 |
| 3 | 4 | us 4, canada 3 | `09-sweepExcessCash, 10-refillBondReserve, takeTaxable` | `TAXABLE_BASIS_KEY, defaults, housingForYear, taxFor` | 25 / 144 / 111 / 6,974 and 4,939 |
| 4 | 2 | us 1, canada 1 | none | `TAXABLE_BASIS_KEY, defaults, housingForYear, taxFor` | 25 / 146 / 113 / 6,901 and 4,920 |

Commit messages: `Extraction batch 2: 5 modules (4 US and 2 Canada units) out of main.js`, `Extraction batch 3: 4 modules (4 US and 3 Canada units) out of main.js`, `Extraction batch 4: 2 modules (1 US and 1 Canada units) out of main.js`.

---

### Task 7: Batch 5 (21 modules, the engine)

**Files:** as Task 5. This batch moves `runProjection`, `withdrawStandard`, `BUCKET_STEP`, the bucket orders, the Monte Carlo and sensitivity helpers and the optimizer helpers.

- [ ] **Step 1: Apply**

Run:
```bash
node scripts/extract-units.js --manifest scripts/extractions/stage3.json --batch 5 --dry-run
node scripts/extract-units.js --manifest scripts/extractions/stage3.json --batch 5
```
Expected (both): `batch 5: 21 modules; units moved: us 26, canada 17`, `regions removed: 13-simulate, 14-findMinimalSpendingCut, BUCKET_DOWN_YEAR_ORDER, simulateAtRealCagr`, `seam names: BUCKET_MODE, BUCKET_STEP, ESTIMATE_ALWAYS_IDS, ESTIMATE_GATED_GROUPS, STANDARD_MODE, TAXABLE_BASIS_KEY, defaults, housingForYear, runProjection, taxFor`, no `warning:` line.

- [ ] **Step 2: Guards**

Run: `node scripts/sync-shared.js --check && npm run build && node tests/closure_names.js && node tests/core_purity.js && node tests/country_contract.js && node scripts/compare-builds.js --base ../Fire-Planner-base && wc -l src/us/main.js src/canada/main.js | head -2`
Expected: `shared regions OK (21 regions x 2 planners)`, `closure_names OK (167 files)`, `core_purity OK (134 core files)`, `country_contract OK`, both comparison lines with `missing from head 0, new in head 0`, and 4,839 (US) and 4,091 (Canada) lines. Then `cat src/us/core/seam.js`: eight `export { ... } from './...js';` lines naming the ten seam names above (the exact module file names may differ with the module naming; the same names must appear in `src/canada/core/seam.js`).

- [ ] **Step 3: Full suite**

Run (background): `npm test > /tmp/stage3-t7.log 2>&1; echo "exit $?" >> /tmp/stage3-t7.log`
Expected: `exit 0`; `git status --short tests/snapshots` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add -A src shared
git status --short
git commit -m "Extraction batch 5: 21 modules (26 US and 17 Canada units) out of main.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
`git status` before the commit lists only `src/` and `shared/` paths.

---

### Task 8: Whole-stage verification (no commit)

**Files:** none changed.

- [ ] **Step 1: Statement-for-statement comparison**

Run: `npm run build && node scripts/compare-builds.js --base ../Fire-Planner-base`
Expected, exit 0: `Planner_US.html: base 816 statements, head 816; missing from head 0, new in head 0` and the Canada line with 538. Any difference is a failure of the stage: report it.

- [ ] **Step 2: Timing gate**

Run: `node tests/bench_runs_interleaved.js --base ../Fire-Planner-base --rounds 11` and `node tests/bench_canada.js --base ../Fire-Planner-base`
Expected: every change printed by the first command is at most +5% and every Canada ratio at most 1.05 (the gate in `CLAUDE.md`; wall-clock noise is about +-10%, which is why the two trees run interleaved in one process). In the rehearsal one US state showed +7.0% and another +5.2% at 11 rounds, and both were -2% to -3% when run again with `--rounds 21 --states ct,wa,tx`; so repeat any state above +5% that way before reporting it, and report it only if it stays above.

- [ ] **Step 3: The binding report is unchanged**

Run: `node scripts/plan-extraction.js --core-only | node -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8'));for(const c of ['us','canada'])console.log(c,p.bindings[c].needsDecision.map(b=>b.names.join('+')).join(', '))"`
Expected: both lines list exactly `theme, sidebarCollapsed, hadSavedState, infoBubbleBtn, reviewingFieldId, setMobileView, undoSnapshot, wizardStep`, in that order.

- [ ] **Step 4: Remove the base worktree**

Run: `git worktree remove --force ../Fire-Planner-base`

---

### Task 9: Docs, the region map, the regenerated inventory

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-10-modular-build-design.md`, `docs/superpowers/inventory/closure-us.md`, `docs/superpowers/inventory/closure-canada.md`
- Create: `docs/superpowers/inventory/stage3-region-map.md`

- [ ] **Step 1: Regenerate the inventory**

Run: `npm run analyze`
Expected: `US: 311 units, 23 mutable, ...` and `Canada: 231 units, 24 mutable, ...` (385 - 74 and 283 - 52 units; one mutable binding fewer in each, `taxFactorInflation`, which moved into a module with `taxIndexFactor`; the other bindings the planner calls colocatable are written by UI functions that stay). Open the "Shared regions" table of `closure-us.md`: it lists only the 21 regions that still have units in `main.js`.

- [ ] **Step 2: The region map**

Write `region-map.js` in the session scratchpad directory (Write tool), then run it from the repo root:

```js
// Writes docs/superpowers/inventory/stage3-region-map.md: where the shared regions' units went in stage 3.
const fs = require('fs');
const modules = JSON.parse(fs.readFileSync('scripts/extractions/stage3.json', 'utf8')).modules;
const rows = modules.filter((m) => m.regions.length).sort((a, b) => a.regions[0].localeCompare(b.regions[0]) || a.path.localeCompare(b.path));
const nl = String.fromCharCode(10);
const out = [
  '# Stage 3: where the shared regions went',
  '',
  'Generated from `scripts/extractions/stage3.json`. Older notes name shared code by its `@@shared` region; this table says which',
  'module now holds the units of that region that stage 3 extracted (stage 2 did the same: `stage2-region-map.md`). Units of a region',
  'that are not listed in either map stayed in `main.js` (the region still exists there) or were never in a region.',
  '',
  '| old shared region | module |',
  '|---|---|',
];
for (const m of rows) for (const r of m.regions) out.push(`| ${r} | ${m.path} |`);
fs.writeFileSync('docs/superpowers/inventory/stage3-region-map.md', `${out.join(nl)}${nl}`);
console.log(`${rows.length} modules, ${out.length - 8} rows`);
```

Run: `node <scratchpad>/region-map.js`
Expected: a line like `N modules, M rows` with M at least 10.

- [ ] **Step 3: Update `CLAUDE.md`**

Use the Edit tool. Replace the whole section from `## Modules and the extraction tool (stage 2 of the module split)` up to (not including) `## US vs. Canada: same shape, different names, not a find-and-replace` with the section below. Then, in the Files list, replace the `scripts/plan-extraction.js` + `scripts/extract-units.js` bullet's last sentence (`` `scripts/extractions/stage2.json` is the plan it applied ... ``) with: `` `scripts/extractions/stage2.json` and `stage3.json` are the plans it applied (every module with its unit labels and batch; stage 3 also records the seam names and the mutable-binding report) and `names.json` the module-name overrides. `scripts/compare-builds.js --base DIR` compares the built planners of two trees statement by statement (run it after any change that only moves code). ``

```markdown
## Modules and the extraction tool (stages 2 and 3 of the module split)

- **Where code lives now.** Units are top-level statements of the planner IIFE. Stage 2 moved the first four dependency layers, stage 3 every
  remaining DOM-free unit that does not depend on the eight UI bindings below: byte-identical shared code under `src/shared/core|ui/`,
  country-only code under `src/<country>/core|ui/`. A module is under `core/` when none of its units uses a browser global, calls a DOM method
  on an element, or imports a `ui/` module (`tests/core_purity.js` enforces all three), and under `ui/` otherwise. Module names come from
  `scripts/extractions/names.json`; the first unit's name or the old region's name is used where there is no override (a second module from the
  same region gets a `-2` suffix). Module files keep the two-space indentation they had inside the IIFE (the tool moves text verbatim; do not
  reformat a module in a commit that also changes it).
- **The country seam.** Shared code that needs a country function imports it from `#country/core/seam`, a module each country has
  (`src/us/core/seam.js`, `src/canada/core/seam.js`) that re-exports the same names: `taxFor`, `runProjection`, `defaults`, `BUCKET_STEP`,
  `BUCKET_MODE`, `STANDARD_MODE`, `ESTIMATE_ALWAYS_IDS`, `ESTIMATE_GATED_GROUPS`, `TAXABLE_BASIS_KEY` and `housingForYear`. The tool writes
  the facades; the list of allowed names is the manifest's `seam`. Adding a name means a country unit of that name in both planners.
  `tests/country_contract.js` checks that both facades export the same names. The alias is resolved by the build condition (`us`/`canada`).
- **What stayed in `main.js` and why.** Side-effect statements (listeners, test hooks, initialisation: moving them changes execution order); all
  DOM code and what depends on it (`render`, `syncControls`, the charts, the wizard, the MCP wiring); and the eight mutable bindings that have
  several writers or a statement writer (`theme`, `sidebarCollapsed`, `hadSavedState`, `infoBubbleBtn`, `reviewingFieldId`, `setMobileView`,
  `undoSnapshot`, `wizardStep`). The planner lists these in its `bindings.<country>.needsDecision`; each is decided in stage 4, either by
  combining its writers into one module with it or by giving it an `assign<Name>` state module (needed whenever a statement writes it).
- **Mutable bindings that did move.** A `let` written by exactly one function and no statement moves into that function's module; in stage 3
  that is `taxFactorInflation` (the memo of `taxIndexFactor`, in `src/shared/core/year-factors-2.js`). It is that function's private state. The
  other such bindings (the timers, tooltip elements and `lastRothOptimizer`) belong to UI functions and move with them in stage 4. A module that
  exports a `let` is read by others as a live binding; they must not assign it (esbuild: `Cannot assign to import`).
- **Adding or moving code.** Put new shared code in a module under `src/shared/core|ui/` and import it (relative path); new country code in
  `src/<country>/core|ui/`. Do not add `@@shared` regions. A name a module uses must be declared in it or imported (`tests/closure_names.js`
  fails otherwise: esbuild does not report an undeclared identifier). Cross-module state goes through the `assign…` functions described above.
  esbuild turns a module's top-level `const` and `let` into `var` when it bundles, so a use before initialization does not throw: it reads
  `undefined`. A module-level initializer must only use modules it imports.
- **Data blocks.** A `// NAME:begin ... // NAME:end` block (`STATE_RULES`, `MEDICAID_RULES`, `PROVINCE_RULES`, `BENEFIT_RULES`) is moved whole
  with both markers. `scripts/gen-*-rules.js` find it in whichever file holds it (`scripts/lib/marker-source.js`) and evaluate the text with
  `export` removed.
- **Using the tool again.** `node scripts/plan-extraction.js [--core-only] [--max-layer=N] [--max-batch=N] [--seam=a,b] > plan.json` prints a
  plan for the current source; `node scripts/extract-units.js --manifest plan.json --batch N [--dry-run]` applies one batch and writes nothing
  unless every check passes (it stages its files and renames them into place). After a batch: `node scripts/sync-shared.js --check`,
  `npm run build`, `node scripts/compare-builds.js --base <tree built before the batch>` and `npm test`. Where the units of a shared region and a
  country run would import each other as whole modules, the planner gives them modules of their own and joins what it can again; about 29 of the
  38 stage 3 modules hold one unit, and merging them by topic is follow-up work.
```

Also replace the `stage2-region-map.md` mention in the "Shared code between the planners" section (``(`docs/superpowers/inventory/stage2-region-map.md` says where each old region's units went)``) with ``(`docs/superpowers/inventory/stage2-region-map.md` and `stage3-region-map.md` say where each old region's units went)``.

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-10-10-modular-build-design.md`:

1. In section 14, "What the data showed", replace the sentence beginning `A dry estimate with that rule moves about 90 US units` (through `UI state bindings below.`) with: `The estimate with that rule alone (about 90 US and 68 Canada units) ignored the units that call country code: the shared engine calls \`taxFor\`, \`runProjection\` and a few more country units. With the seam below, stage 3 moves 74 US and 52 Canada units (38 modules); the 9 DOM-free units it leaves behind per planner belong to the UI state bindings.`
2. In section 14, "Tool changes", replace the bullet `- The comment attached to a unit stops at a blank line, ...` with `- A \`/* */\` or JSDoc block directly above a unit travels with it (the trailing-note case, a comment about the previous unit with no blank line, is cosmetic and left as it is).` and append these bullets: `- A country seam: shared modules import the country units named in the manifest's \`seam\` from \`#country/core/seam\`, a facade each country gets (section 12's alias, with a subpath).` and `- Where a shared region and a country run would import each other as whole modules, their units get modules of their own and are joined again where that closes no cycle (29 of the 38 modules still hold one unit; merging them by topic is follow-up work).`
3. In section 14, "Placement", replace the sentence about \`attachMoneyPreview\` and a "new check ... listed, not blocked" with: `A helper that calls DOM methods on an element it is handed (\`attachMoneyPreview\`) is DOM code: \`tests/core_purity.js\` fails on it in \`core/\`, and stage 3 moved it to \`src/shared/ui/money-format.js\`.` and delete the sentence `Same-topic one-unit modules are merged by topic at the end, using the name file.`
4. In section 6, the stage 3 entry: append ` DONE on branch tyler/stage3-higher-layers (the owner adds the merge date when merging).`

- [ ] **Step 5: Checks**

Run: `grep -n "stage 3 cleanup\|continues from the regenerated inventory" CLAUDE.md` (no match expected) and `npm test > /tmp/stage3-t9.log 2>&1; echo "exit $?" >> /tmp/stage3-t9.log` (background).
Expected: no match from grep; `exit 0`.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs
git status --short
git commit -m "Docs: stage 3 modules, the country seam, the extraction tool's new options; regenerated inventory and region map" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
`git status` before the commit lists only `CLAUDE.md` and `docs/` paths.
