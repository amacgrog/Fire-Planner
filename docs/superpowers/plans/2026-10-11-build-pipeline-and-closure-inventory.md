# Build Pipeline and Closure Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/` the source of truth, build the two single-file planners into a gitignored `dist/` with esbuild, publish `dist/` to GitHub Pages, and generate a machine-readable inventory of each planner's closure that the module-extraction plans will be written from.

**Architecture:** Each planner is split verbatim into a markup shell (`index.html`), a stylesheet (`styles.css`) and the existing script (`main.js`, still one IIFE). `scripts/build.js` bundles `main.js` with esbuild as a classic IIFE and splices it, the CSS and the shell together with a small standalone `assembleHtml` function. The existing marker-based `sync-shared` tooling keeps working, retargeted at the three source files. Tests are repointed from the repo-root HTML files to `dist/`. A closure analyzer (espree + eslint-scope) then reports, per top-level declaration, its dependencies, mutable bindings, DOM use, cycles and shared-region seams.

**Tech Stack:** Node 22, esbuild (bundler), espree + eslint-scope (analysis only), Playwright (existing tests), GitHub Actions Pages.

**Spec:** `docs/superpowers/specs/2026-10-10-modular-build-design.md` (stage 0 in full, plus the inventory half of stage 1).

**Scope note.** The spec's stages 1-4 (extract the shared fragments, state singletons, `core/`, `ui/`) cannot be planned task-by-task yet. Reading the code showed that the `shared/*.js` fragments are closure code: for example `simulateHistorical` assigns `histTaxFactors`, a `let` declared elsewhere in the closure, and calls the country-specific `runProjection`; the US planner has about 35 top-level mutable `let`s. Which module each piece can move to depends on the dependency graph, so Task 8 generates that graph, and the follow-up plans are written from it (see "Follow-up plans" at the end). Everything here leaves the app behaving identically and the repo shippable.

## Global Constraints

- Output is a classic IIFE `<script>`, never `type="module"` (module scripts are blocked on `file://` in some browsers).
- `dist/` is gitignored; built files are not committed. Edit `src/`, never `dist/`.
- Output is unminified by default. A `--minify` flag may exist but is not the default.
- No behavior change: `tests/snapshots/*.json` must be byte-identical to the start of this plan. `npm run snapshot:update` is not used anywhere in this plan.
- The build must run on Windows and Linux (CI is `ubuntu-latest`, Node 22).
- Docs are updated in the same stage as the code they describe (Task 7).
- Never `--no-verify`. Text files end with a newline. After 3 failed attempts at one step, stop and reassess.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; the commands below pass it as a second `-m`.
- Run commands in Git Bash (the examples use POSIX syntax).
- Do not merge to `main` between Task 1 and Task 3: until Task 3 the repo holds both the root `Planner_*.html` files and their `src/` copies.

## Review Focus

Failure modes the spec implies but no happy-path test exercises, most likely first:

1. **Code containing `$&`, `$1`, `` $` `` is mangled by `String.replace`.** The planners contain such sequences in strings and regexes. `assembleHtml` must insert text through a function replacer. Pinned by a test in Task 1.
2. **`</script` inside inlined JS ends the script early.** Must be escaped. Pinned in Task 1.
3. **Non-ASCII characters (`—`, `✕`, `→`) get turned into `\uXXXX` escapes or mojibake.** esbuild escapes them by default; the build sets `charset: 'utf8'`. Pinned by a test in Task 4.
4. **Tests run against a stale `dist/`.** `npm test` rebuilds first, and the Pages deploy job builds fresh. Pinned in Task 3.
5. **Saved scenarios do not carry over to the hosted page.** Autosave lives in `localStorage`, which is per origin: a file opened from disk and the Pages site are different origins. Users move data with the existing scenario export/import. Documented in Task 7.
6. **Sloppy-mode code breaks under strict mode.** Vitest and any real ES module run strict. Probed in Task 5 before any module work begins.

## File Structure

Created:
- `scripts/lib/assemble-html.js` - `assembleHtml({ shell, css, js })`, the standalone HTML assembly function.
- `scripts/build.js` - builds `dist/`; flags `--watch`, `--sourcemap`, `--minify`, `--raw`, `--out`.
- `scripts/analyze-closure.js` - `analyze(code)` and `render(model, title)`; writes the inventory reports.
- `src/us/{index.html,styles.css,main.js}` and `src/canada/{index.html,styles.css,main.js}` - the split planners.
- `tests/assemble_html.js` - unit tests for `assembleHtml` (plain Node).
- `tests/build_output.js` - checks the built files in `dist/`.
- `tests/closure_analyzer.js` - unit tests for the analyzer (plain Node).
- `tests/helpers/planner-path.js` - `plannerPath(file, root?)`: `dist/` in a built checkout, repo root in a pre-refactor worktree.
- `docs/superpowers/inventory/closure-us.md`, `closure-canada.md` - generated reports.

Modified: `scripts/sync-shared.js`, `scripts/gen-{state,province,benefit}-rules.js`, `package.json`, `.gitignore`, `.github/workflows/test.yml`, about 90 files under `tests/` and root `test_*.js` (path repointing), `CLAUDE.md`, `README.md`, the three generated `docs/*-rules.md`.

Deleted: root `Planner_US.html`, `Planner_Canada.html` (Task 3).

---

### Task 0: Preflight

**Files:** none changed.

- [ ] **Step 1: Confirm the toolchain**

Run: `node -v && npm -v`
Expected: Node `v22.x` (the version CI uses). If `node` is not found, install Node 22 and make sure it is on the PATH of the shell you use, then reopen the shell. (The planning session had no `node` on its PATH, so nothing in this plan has been executed yet.)

- [ ] **Step 2: Install and get a green baseline**

Run: `npm ci && npx playwright install chromium && npm test`
Expected: the whole chain passes. Note the wall-clock time. If anything fails here, stop: this plan assumes a green start.

- [ ] **Step 3: Record the starting commit**

Run: `git status --short && git rev-parse HEAD`
Expected: clean working tree. Write the printed hash down as `BASE`; the final check in "Definition of done" diffs against it.

---

### Task 1: Split the planners into sources and add `assembleHtml`

**Files:**
- Create: `scripts/lib/assemble-html.js`, `scripts/build.js`, `tests/assemble_html.js`
- Create (by the split script): `src/us/{index.html,styles.css,main.js}`, `src/canada/{index.html,styles.css,main.js}`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `assembleHtml({ shell: string, css: string, js: string }) => string`. `css` and `js` are file contents as read from disk (each ends with `\n`); the shell holds `{{css}}` once inside `<style>` and `{{js}}` once inside `<script>`.
- Produces: `node scripts/build.js [--out DIR]` writes `Planner_US.html`, `Planner_Canada.html` and `index.html` into `dist/` (or `DIR`).

- [ ] **Step 1: Write the failing test**

Create `tests/assemble_html.js`:

```js
// Unit tests for scripts/lib/assemble-html.js (plain Node, no browser).
const assert = require('assert');
const { assembleHtml } = require('../scripts/lib/assemble-html');

const shell = '<style>\n{{css}}\n</style>\n<script>{{js}}\n</script>\n';

// The final newline of each file belongs to the shell, so the output has no blank lines.
assert.strictEqual(
  assembleHtml({ shell, css: 'a{}\n', js: 'x();\n' }),
  '<style>\na{}\n</style>\n<script>x();\n</script>\n',
);

// Replacement patterns in the code stay literal.
const tricky = 'a = "$&" + "$1" + "$$" + "$`" + "$\'";\n';
assert.ok(assembleHtml({ shell, css: '\n', js: tricky }).includes(tricky.slice(0, -1)));

// "</script" inside the code would end the element early, so it is escaped (case preserved).
const escaped = assembleHtml({ shell, css: '\n', js: 's = "</script>" + "</SCRIPT>";\n' });
assert.ok(escaped.includes('s = "<\\/script>" + "<\\/SCRIPT>";'));
assert.strictEqual((escaped.match(/<\/script/gi) || []).length, 1, 'only the real closing tag remains');

// Inserted text is never re-scanned for placeholders.
assert.ok(assembleHtml({ shell, css: 'a::after{content:"{{js}}"}\n', js: 'x();\n' }).includes('content:"{{js}}"'));

// A stylesheet containing "</style" cannot be inlined safely.
assert.throws(() => assembleHtml({ shell, css: '/* </style> */\n', js: 'x();\n' }), /<\/style/);

// The shell must contain each placeholder exactly once.
assert.throws(() => assembleHtml({ shell: '<script>{{js}}</script>', css: '\n', js: '\n' }), /\{\{css\}\} exactly once, found 0/);
assert.throws(() => assembleHtml({ shell: shell + '{{js}}', css: '\n', js: '\n' }), /\{\{js\}\} exactly once, found 2/);

console.log('assemble_html OK');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/assemble_html.js`
Expected: FAIL with `Cannot find module '../scripts/lib/assemble-html'`.

- [ ] **Step 3: Implement `assembleHtml`**

Create `scripts/lib/assemble-html.js`:

```js
'use strict';
// Splices a planner's stylesheet and script into its HTML shell.
//
// The shell holds the markup plus two placeholders: {{css}} inside <style> and {{js}} inside <script>.
// css and js are passed as read from disk (each ends with a newline); the shell supplies the newline
// that follows the placeholder.

const PLACEHOLDER = /\{\{(css|js)\}\}/g;

const count = (text, token) => text.split(token).length - 1;
const dropFinalNewline = (text) => text.replace(/\n$/, '');

function assembleHtml({ shell, css, js }) {
  for (const token of ['{{css}}', '{{js}}']) {
    const found = count(shell, token);
    if (found !== 1) throw new Error(`shell must contain ${token} exactly once, found ${found}`);
  }
  if (/<\/style/i.test(css)) throw new Error('stylesheet contains "</style", which would end the <style> element early');
  const safeCss = dropFinalNewline(css);
  const safeJs = dropFinalNewline(js).replace(/<\/(script)/gi, '<\\/$1');
  // One pass with a function replacer: inserted text is never re-scanned, and `$&`, `$1` and friends
  // inside the code stay literal (a string replacement would interpret them).
  return shell.replace(PLACEHOLDER, (_, which) => (which === 'css' ? safeCss : safeJs));
}

module.exports = { assembleHtml };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/assemble_html.js`
Expected: `assemble_html OK`.

- [ ] **Step 5: Split each planner into shell, CSS and script**

This is a one-time transformation; run it from the repo root and do not commit the script. It cuts the `<style>` and `<script>` bodies out verbatim and leaves placeholders in the shell.

```bash
node - <<'EOF'
const fs = require('fs');
const STYLE_OPEN = '  <style>\n';
const STYLE_CLOSE = '\n  </style>';
const SCRIPT_OPEN = '<script>';
const SCRIPT_CLOSE = '</script>';
const once = (html, token, file) => {
  const i = html.indexOf(token);
  if (i < 0 || i !== html.lastIndexOf(token)) throw new Error(`${file}: expected exactly one ${JSON.stringify(token)}`);
  return i;
};
for (const [dir, file] of [['us', 'Planner_US.html'], ['canada', 'Planner_Canada.html']]) {
  const html = fs.readFileSync(file, 'utf8');
  const so = once(html, STYLE_OPEN, file), sc = once(html, STYLE_CLOSE, file);
  const jo = once(html, SCRIPT_OPEN, file), jc = once(html, SCRIPT_CLOSE, file);
  if (!(so < sc && sc < jo && jo < jc)) throw new Error(`${file}: unexpected order`);
  const css = html.slice(so + STYLE_OPEN.length, sc) + '\n';
  const js = html.slice(jo + SCRIPT_OPEN.length, jc);
  const shell = html.slice(0, so + STYLE_OPEN.length) + '{{css}}'
    + html.slice(sc, jo + SCRIPT_OPEN.length) + '{{js}}\n' + html.slice(jc);
  fs.mkdirSync(`src/${dir}`, { recursive: true });
  fs.writeFileSync(`src/${dir}/index.html`, shell);
  fs.writeFileSync(`src/${dir}/styles.css`, css);
  fs.writeFileSync(`src/${dir}/main.js`, js);
  console.log(`${dir}: shell ${shell.length} chars, css ${css.length}, js ${js.length}`);
}
EOF
```

Expected: two lines, `us: shell ... css ... js ...` and `canada: ...`. If `once` throws, a token appears more than once (for example the text `<script>` inside a JS comment); stop and adjust that planner's split by hand rather than loosening the check.

- [ ] **Step 6: Write the build script**

Create `scripts/build.js`:

```js
#!/usr/bin/env node
// Builds dist/Planner_US.html and dist/Planner_Canada.html from src/.
//   node scripts/build.js            build once into dist/
//   node scripts/build.js --out DIR  write into DIR instead
const fs = require('fs');
const path = require('path');
const { assembleHtml } = require('./lib/assemble-html');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'dist');

const PLANNERS = [
  { dir: 'us', file: 'Planner_US.html' },
  { dir: 'canada', file: 'Planner_Canada.html' },
];
const read = (file) => fs.readFileSync(file, 'utf8');

fs.mkdirSync(outDir, { recursive: true });
for (const { dir, file } of PLANNERS) {
  const src = path.join(root, 'src', dir);
  const html = assembleHtml({
    shell: read(path.join(src, 'index.html')),
    css: read(path.join(src, 'styles.css')),
    js: read(path.join(src, 'main.js')),
  });
  fs.writeFileSync(path.join(outDir, file), html);
}
fs.copyFileSync(path.join(root, 'index.html'), path.join(outDir, 'index.html'));
console.log(`built ${PLANNERS.length} planners into ${path.relative(root, outDir) || '.'}`);
```

- [ ] **Step 7: Prove the split is lossless**

Run: `echo "dist/" >> .gitignore && node scripts/build.js && cmp dist/Planner_US.html Planner_US.html && cmp dist/Planner_Canada.html Planner_Canada.html && echo IDENTICAL`
Expected: `built 2 planners into dist` then `IDENTICAL`. This byte-for-byte match is the proof that nothing was lost or reordered; do not continue until it prints.

- [ ] **Step 8: Wire up scripts and commit**

In `package.json`, add `"build": "node scripts/build.js",` to `scripts`, and in the `test` chain insert `node tests/assemble_html.js && ` immediately after `node scripts/gen-benefit-rules.js --check && `.

Run: `node tests/assemble_html.js && git add scripts/lib/assemble-html.js scripts/build.js tests/assemble_html.js src package.json .gitignore && git commit -m "Build: split planners into src/ shell, CSS and script; add assembleHtml and a raw build" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`
Expected: commit succeeds. The root `Planner_*.html` files are still the files the tests use.

---

### Task 2: Retarget the marker sync and the generators at `src/`

**Files:**
- Modify: `scripts/sync-shared.js`, `scripts/gen-state-rules.js`, `scripts/gen-province-rules.js`, `scripts/gen-benefit-rules.js`
- Regenerate: `docs/state-tax-rules.md`, `docs/province-tax-rules.md`, `docs/benefits-rules.md`

**Interfaces:**
- Consumes: the three source files per planner from Task 1.
- Produces: `npm run sync`, `npm run sync -- --check` and `npm run sync -- --pull src/us/main.js` operate on `src/{us,canada}/{index.html,styles.css,main.js}`. Marker regions keep their names, so `shared/` is unchanged.

- [ ] **Step 1: Edit `scripts/sync-shared.js`**

Apply these four replacements (each `old` string appears exactly once).

Replace the header's first comment line:
```js
// Keeps the code shared by Planner_US.html and Planner_Canada.html identical.
```
with:
```js
// Keeps the code shared by the US and Canada planner sources (src/us/*, src/canada/*) identical.
```

Replace:
```js
const PLANNERS = ['Planner_US.html', 'Planner_Canada.html'];
```
with:
```js
// Each planner is split into a markup shell, a stylesheet and a script; markers live in all three.
const KINDS = ['index.html', 'styles.css', 'main.js'];
const PLANNERS = ['us', 'canada'].flatMap((dir) => KINDS.map((kind) => `src/${dir}/${kind}`));
```

Replace:
```js
const pullFile = pullIdx >= 0 ? args[pullIdx + 1] : null;
```
with:
```js
const pullFile = pullIdx >= 0 ? (args[pullIdx + 1] || '').replace(/\\/g, '/') : null;
```

Replace the missing-region check:
```js
const problems = [];
for (const p of loaded) {
  const have = new Set(p.regions.map((r) => r.name));
  for (const n of names) if (!have.has(n)) problems.push(`${p.file}: missing region "${n}"`);
}
```
with:
```js
const problems = [];
for (const kind of KINDS) {
  const group = loaded.filter((p) => p.file.endsWith(`/${kind}`));
  const groupNames = new Set(group.flatMap((p) => p.regions.map((r) => r.name)));
  for (const p of group) {
    const have = new Set(p.regions.map((r) => r.name));
    for (const n of groupNames) if (!have.has(n)) problems.push(`${p.file}: missing region "${n}"`);
  }
}
```

Replace the success message so it no longer prints six "planners":
```js
  console.log(`shared regions OK (${names.size} regions x ${PLANNERS.length} planners)`);
```
with:
```js
  console.log(`shared regions OK (${names.size} regions x 2 planners)`);
```

- [ ] **Step 2: Verify the sync check passes and really reads `src/`**

Run: `node scripts/sync-shared.js --check`
Expected: `shared regions OK (... regions x 2 planners)`.

Then prove it watches the new files. Change one character inside a shared region of `src/us/main.js` (for example the `LIST_MAX` value between `// @@shared:01-LIST_MAX begin` and `end`), and run the check again.
Expected: exit 1 with `src/us/main.js: region "01-LIST_MAX" differs from shared/01-LIST_MAX.js`. Revert with `git checkout src/us/main.js`.

- [ ] **Step 3: Point the three generators at `src/`**

The generators read a rules block out of the planner and write a markdown doc. A plain textual replacement is enough, because the markers are unchanged:

```bash
sed -i 's#Planner_US\.html#src/us/main.js#g' scripts/gen-state-rules.js
sed -i 's#Planner_Canada\.html#src/canada/main.js#g' scripts/gen-province-rules.js scripts/gen-benefit-rules.js
grep -n "src/us/main.js\|src/canada/main.js" scripts/gen-*.js
```
Expected: the `PLANNER = path.join(root, 'src/us/main.js')` lines plus the error and footer strings now name the source file. `path.join` accepts the forward slashes on Windows.

- [ ] **Step 4: Regenerate the docs and check the diff is only the footer**

Run: `npm run gen:states && npm run gen:provinces && npm run gen:benefits && git diff --stat docs/`
Expected: three files changed, each by a line or two (the "Generated by ... from `...` in `...`" footer). If any table row changed, stop: the generators are reading different data than before.

Run: `node scripts/gen-state-rules.js --check && node scripts/gen-province-rules.js --check && node scripts/gen-benefit-rules.js --check`
Expected: all three exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts docs/state-tax-rules.md docs/province-tax-rules.md docs/benefits-rules.md
git commit -m "Build: point sync-shared and the rules generators at src/" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Run every test against `dist/` and remove the root planners

**Files:**
- Create: `tests/helpers/planner-path.js`, `tests/build_output.js`
- Modify: about 90 files under `tests/` and root `test_*.js`; `package.json`
- Delete: `Planner_US.html`, `Planner_Canada.html`

**Interfaces:**
- Produces: `plannerPath(file, root = <repo root>) => string` - returns `<root>/dist/<file>` if it exists, else `<root>/<file>` (so `--root` comparisons against a pre-refactor worktree keep working).
- Produces: `npm test` starts with `node scripts/build.js`.

- [ ] **Step 1: Create the path helper**

Create `tests/helpers/planner-path.js`:

```js
const fs = require('fs');
const path = require('path');

// Where a planner lives: dist/ in a built checkout, the checkout root in a pre-refactor worktree
// (tests that take `--root DIR` compare against old commits, where the file sat at the root).
function plannerPath(file, root = path.resolve(__dirname, '..', '..')) {
  const built = path.join(root, 'dist', file);
  return fs.existsSync(built) ? built : path.join(root, file);
}

module.exports = { plannerPath };
```

- [ ] **Step 2: Repoint the common path forms with a codemod**

Three literal forms cover about 100 call sites. Run once from the repo root (not committed):

```bash
node - <<'EOF'
const fs = require('fs');
const path = require('path');
const files = [
  ...fs.readdirSync('tests').filter((f) => f.endsWith('.js')).map((f) => path.join('tests', f)),
  ...fs.readdirSync('.').filter((f) => /^test_.*\.js$/.test(f)),
];
const forms = [
  [/'\.\.', 'Planner_(US|Canada)\.html'/g, "'..', 'dist', 'Planner_$1.html'"],
  [/__dirname, 'Planner_(US|Canada)\.html'/g, "__dirname, 'dist', 'Planner_$1.html'"],
  [/path\.resolve\('Planner_(US|Canada)\.html'\)/g, "path.resolve('dist', 'Planner_$1.html')"],
];
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [re, to] of forms) after = after.replace(re, to);
  if (after !== before) { fs.writeFileSync(file, after); changed++; }
}
console.log(`rewrote ${changed} of ${files.length} files`);
EOF
```
Expected: roughly 80 files rewritten.

- [ ] **Step 3: Fix the remaining sites by hand**

List what is left:

Run: `grep -rn "Planner_\(US\|Canada\)\.html" tests test_*.js | grep -v "dist\|plannerPath" | grep -v "^[^:]*:[0-9]*:\s*//"`

Each remaining line is a place where the file name is held in a variable or table and turned into a path somewhere else. Wrap the place that builds the path. Two shapes cover them all. In each file add one `require` near the top, `const { plannerPath } = require('./helpers/planner-path');` (in a root `test_*.js` file: `require('./tests/helpers/planner-path')`).

- Name resolved relative to the test directory:
  - before: `path.resolve(__dirname, '..', file)` (or `path.join(root, file)` where `root` is the repo root)
  - after: `plannerPath(file)`
- Name resolved against a `--root`/`ROOT` option (these compare against old commits, so they must keep the root fallback):
  - before: `path.join(ROOT, planner.file)`
  - after: `plannerPath(planner.file, ROOT)`
  - Files with this shape: `snapshot.js:157`, `snapshot_ui.js:123`, `historical_rates.js:42`, `plan_off_anchor.js:113`, and the six `bench_*.js` files (their literal `'Planner_US.html'` / `'Planner_Canada.html'` argument stays; wrap the join).

Files known to need this step: `bench_*`, `bond_refill`, `child_dependents`, `dividend_income`, `field_registry`, `golden`, `historical_bond_yield`, `historical_parity`, `historical_rates`, `historical_tax_indexing`, `legacy_state`, `medical_inflation`, `plan_off_anchor`, `snapshot`, `snapshot_ui`, `solver_gap`, `solver_scan`, `survivor_salary`, `survivor_symmetry`, `tax_brackets`, and root `test_children`, `test_dynamic_lists`, `test_info_tips`, `test_mobile_category_rail`, `test_spending_and_fi_widgets`. Comment-only mentions stay as they are.

- [ ] **Step 4: Add the build-output test**

Create `tests/build_output.js`:

```js
// Checks the files `npm run build` wrote to dist/ (plain Node, no browser).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dist = path.resolve(__dirname, '..', 'dist');

for (const name of ['Planner_US.html', 'Planner_Canada.html']) {
  const file = path.join(dist, name);
  assert.ok(fs.existsSync(file), `${name} is missing from dist/ (run npm run build)`);
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(!html.includes('{{css}}') && !html.includes('{{js}}'), `${name}: build placeholders left in the output`);
  assert.ok(!/<script[^>]*type=["']module["']/i.test(html), `${name}: must be a classic script, not a module`);
  assert.ok(!/<script[^>]*\ssrc=/i.test(html), `${name}: must not load an external script`);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1, `${name}: expected exactly one inline <script>`);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1]), `${name}: the inline script does not parse`);
}
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'index.html is missing from dist/');
console.log('build output OK');
```

- [ ] **Step 5: Delete the root planners and build before testing**

In `package.json`, change the start of the `test` chain from
`"test": "node scripts/sync-shared.js --check && ` to
`"test": "node scripts/build.js && node scripts/sync-shared.js --check && `,
and insert `node tests/build_output.js && ` right after `node tests/assemble_html.js && `.

Run: `git rm Planner_US.html Planner_Canada.html`

Deleting the root files is the completeness check: any test still reading them now fails with a file-not-found error.

- [ ] **Step 6: Run the suite until it is green**

Run: `npm test`
Expected on the first run: some failures for sites missed in Step 3 (messages mention `ENOENT` or `ERR_FILE_NOT_FOUND` and a `Planner_*.html` path). Fix each file and re-run just that test (`node tests/<name>.js`), then run `npm test` again. Repeat until it exits 0.

Then: `git status --short tests/snapshots`
Expected: no output (the snapshot baselines are untouched). If a baseline changed, stop: the build altered behavior.

- [ ] **Step 7: Smoke the root-level ad-hoc scripts**

Run: `node test_dynamic_lists.js && node test_info_tips.js && node test_children.js`
Expected: each exits 0 (these are not part of CI, so this is the only check they got repointed correctly).

- [ ] **Step 8: Commit**

```bash
git add -A tests test_*.js package.json
git commit -m "Tests: run every suite against dist/; remove the root Planner_*.html (src/ is the source)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(`git add -A` is scoped to the listed paths; `git status` should show nothing else pending afterwards except the staged deletions already recorded by `git rm`.)

---

### Task 4: Bundle with esbuild

**Files:**
- Modify: `scripts/build.js` (rewritten), `tests/build_output.js`, `package.json`

**Interfaces:**
- Consumes: `assembleHtml` (Task 1), `main.js` entry per planner.
- Produces: `node scripts/build.js` bundles `main.js` as an unminified `format: 'iife'`, `target: 'esnext'`, `charset: 'utf8'` script; flags `--raw` (skip esbuild, inline as written), `--sourcemap`, `--minify`, `--watch`, `--out DIR`. `npm run dev` = `node scripts/build.js --watch --sourcemap`.

- [ ] **Step 1: Check the current esbuild API and install it**

Look up the current esbuild JS build API (the `build` function with `write: false`, and the `charset` and `format: 'iife'` options) in its official documentation, using Context7 if available, before relying on the code below. Then:

Run: `npm install --save-dev --save-exact esbuild`
Expected: `package.json` gains an exact `esbuild` version under `devDependencies`.

- [ ] **Step 2: Add the guard test for non-ASCII output**

Append to `tests/build_output.js`, before the final `console.log`:

```js
// esbuild escapes non-ASCII characters to \uXXXX unless charset is utf8. The planners carry
// characters such as "—", "✕" and "→" in strings and markup; the build must keep them literal.
const escapeCount = (text) => (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
for (const [dir, name] of [['us', 'Planner_US.html'], ['canada', 'Planner_Canada.html']]) {
  const built = fs.readFileSync(path.join(dist, name), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', dir, 'main.js'), 'utf8');
  assert.ok(
    escapeCount(built) <= escapeCount(source),
    `${name}: the build introduced \\u escapes (set charset: 'utf8')`,
  );
}
```
Run: `node scripts/build.js && node tests/build_output.js`
Expected: `build output OK` (it passes now because the current build inlines the script unchanged; it guards the esbuild switch in the next step).

- [ ] **Step 3: Rewrite `scripts/build.js` with the esbuild bundle**

Replace the whole file with:

```js
#!/usr/bin/env node
// Builds dist/Planner_US.html and dist/Planner_Canada.html from src/.
//   node scripts/build.js              build once into dist/
//   node scripts/build.js --watch      rebuild whenever anything under src/ changes
//   node scripts/build.js --sourcemap  inline a source map (development; `npm run dev` uses it)
//   node scripts/build.js --minify     minify the script (not the default)
//   node scripts/build.js --raw        inline main.js exactly as written, skipping esbuild
//   node scripts/build.js --out DIR    write into DIR instead of dist/
const fs = require('fs');
const path = require('path');
const { assembleHtml } = require('./lib/assemble-html');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'dist');

const PLANNERS = [
  { dir: 'us', file: 'Planner_US.html' },
  { dir: 'canada', file: 'Planner_Canada.html' },
];
const read = (file) => fs.readFileSync(file, 'utf8');

// A classic (non-module) IIFE so the result runs from file:// in every browser.
async function bundleJs(entry) {
  if (flag('--raw')) return read(entry);
  const { build } = require('esbuild');
  const result = await build({
    entryPoints: [entry],
    outfile: path.join(outDir, 'main.js'), // never written (write: false); esbuild wants a name
    bundle: true,
    write: false,
    format: 'iife',
    target: 'esnext',
    charset: 'utf8',
    minify: flag('--minify'),
    sourcemap: flag('--sourcemap') ? 'inline' : false,
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

async function buildAll() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const { dir, file } of PLANNERS) {
    const src = path.join(root, 'src', dir);
    const html = assembleHtml({
      shell: read(path.join(src, 'index.html')),
      css: read(path.join(src, 'styles.css')),
      js: await bundleJs(path.join(src, 'main.js')),
    });
    fs.writeFileSync(path.join(outDir, file), html);
  }
  fs.copyFileSync(path.join(root, 'index.html'), path.join(outDir, 'index.html'));
  console.log(`built ${PLANNERS.length} planners into ${path.relative(root, outDir) || '.'}`);
}

if (flag('--watch')) {
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildAll().catch((err) => console.error(err.message)), 50);
  };
  fs.watch(path.join(root, 'src'), { recursive: true }, rebuild);
  buildAll().catch((err) => console.error(err.message));
} else {
  buildAll().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add the `dev` script**

In `package.json` `scripts`, add `"dev": "node scripts/build.js --watch --sourcemap",`.

- [ ] **Step 5: Build and run the whole suite**

Run: `node scripts/build.js && node tests/build_output.js && npm test`
Expected: all green. The script in `dist/` is now esbuild's output (wrapped in one extra IIFE, comments mostly dropped), so a green suite is the evidence that the bundling changed nothing observable.

Then: `git status --short tests/snapshots`
Expected: no output.

If esbuild reports it needs `outdir` instead of `outfile`, swap the option name; do not change `write: false`.

- [ ] **Step 6: Try watch mode**

Run: `npm run dev` in one terminal. In an editor, add a trailing space to any line of `src/us/styles.css` and save.
Expected: a second `built 2 planners into dist` line within about a second. Undo the change (`git checkout src/us/styles.css`) and stop the watcher.

- [ ] **Step 7: Commit**

```bash
git add scripts/build.js tests/build_output.js package.json package-lock.json
git commit -m "Build: bundle main.js with esbuild as an unminified classic IIFE; add dev watch mode" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Probe strict mode

Vitest and any real ES module run in strict mode; the planners today run sloppy. Before any module work, find out whether the app survives strict mode.

**Files:**
- Modify: `scripts/build.js`

**Interfaces:**
- Produces: the default build prefixes the script with `"use strict";` if the probe is green (otherwise this task ends with a written list of violations and no code change to the default).

- [ ] **Step 1: Add a strict switch for the probe**

In `scripts/build.js`, add this option to the `build({ ... })` call, after `charset: 'utf8',`:

```js
    banner: flag('--strict') || process.env.FIRE_BUILD_STRICT === '1' ? { js: '"use strict";' } : {},
```

- [ ] **Step 2: Run the whole suite under strict mode**

Run (Git Bash): `FIRE_BUILD_STRICT=1 npm test`
(PowerShell: `$env:FIRE_BUILD_STRICT='1'; npm test`)
Expected: either green, or failures whose page errors name a strict-mode problem.

- [ ] **Step 3: Triage any failure**

Typical strict-mode violations and their fixes (change the source only in ways that cannot alter results):
- `ReferenceError: <name> is not defined` on an assignment: an undeclared variable was being assigned (an implicit global). Declare it with `let` at the right scope.
- `ReferenceError` calling a function that was declared inside an `if`/`for` block and used outside it: hoist the declaration to the enclosing function body.
- `SyntaxError` for octal literals, duplicate parameter names or `with`: rewrite the literal or parameter.
- `TypeError: Cannot read properties of undefined` where `this` was relied on inside a plain function call: pass the value explicitly.

Fix one violation at a time, re-run the failing test, then the whole suite under `FIRE_BUILD_STRICT=1`. If a fix would change any computed number, or the third attempt at one violation fails, stop and report to the user instead of continuing.

- [ ] **Step 4: Make strict the default (only if Step 2/3 ended green)**

Replace the `banner:` line from Step 1 with:

```js
    banner: { js: '"use strict";' },
```

Run: `npm test` (without the environment variable)
Expected: green, and `git status --short tests/snapshots` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add -A src scripts
git commit -m "Build: ship the script in strict mode (matches ES-module semantics) and fix sloppy-mode violations" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
If Step 3 stopped on an unresolvable violation, skip this step, commit nothing, and leave a note in the PR describing each violation with its file and line; Task 8's report will list implicit-global assignments too.

---

### Task 6: Publish `dist/` to GitHub Pages

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Replace the workflow**

Check the current major versions of `actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages` on their release pages and use the latest major of each in place of the ones below if they differ. Write `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  golden-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright's Chromium
        run: npx playwright install --with-deps chromium

      - name: Build and run all tests
        run: npm test

  deploy:
    needs: golden-tests
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    concurrency:
      group: pages
      cancel-in-progress: false
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate what can be validated locally**

Run: `npm run build && ls dist`
Expected: `Planner_Canada.html  Planner_US.html  index.html`. This is exactly the folder the workflow uploads. (The deploy job itself only runs on a push to `main`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "CI: build and test from src/, then publish dist/ to GitHub Pages on main" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Note the one manual step for the repo owner**

Before the first deploy can succeed, the repository owner must set **Settings > Pages > Build and deployment > Source: GitHub Actions**. This cannot be done from the repo. Include it in the PR description and mention it in the Task 7 README text.

---

### Task 7: Update the living docs for the new layout

**Files:**
- Modify: `CLAUDE.md`, `README.md`

Each replacement below targets text that exists today; apply them with the Edit tool and re-read the result.

- [ ] **Step 1: `CLAUDE.md` - "What this is"**

Replace the paragraph beginning `Offline, single-file HTML FIRE` through `feature list.` with:

```markdown
Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators
for a couple or single person — one for the US, one for Canada. The source lives
in `src/<country>/` (`index.html` markup shell, `styles.css`, `main.js`);
`npm run build` (esbuild, `scripts/build.js`) assembles each into one
self-contained `dist/Planner_US.html` / `dist/Planner_Canada.html` with the CSS and
JS inlined. The built file needs no server and no network: opening it in a browser
is the whole runtime. `dist/` is gitignored and published to GitHub Pages by CI;
**edit `src/`, never `dist/`**. (Code identical in both planners is still kept in
sync by the dev-time `scripts/sync-shared.js`, which is being replaced by real
module imports; see "Shared code between the planners" and
`docs/superpowers/specs/2026-10-10-modular-build-design.md`. Plans, specs and notes
dated before 2026-10-11 describe the old layout, where `Planner_*.html` at the repo
root was the source.) See `README.md` for the full user-facing feature list.
```

- [ ] **Step 2: `CLAUDE.md` - "Files"**

Replace the bullet starting `` - `Planner_US.html` / `Planner_Canada.html` — the two apps `` (through `rename-and-fix-links exercise.`) with:

```markdown
- `src/us/` and `src/canada/` — each planner's source: `index.html` (markup shell with
  `{{css}}` and `{{js}}` placeholders), `styles.css`, and `main.js` (the whole app as
  one IIFE for now; it is being split into modules).
- `scripts/build.js` + `scripts/lib/assemble-html.js` — the build. `dist/Planner_US.html`
  and `dist/Planner_Canada.html` are its output (gitignored). **Stable filenames**:
  never rename these or create version-numbered copies — every update is a `git commit`
  to `src/`, and the built names never change.
- `scripts/analyze-closure.js` — writes `docs/superpowers/inventory/closure-*.md`, the
  per-declaration dependency inventory the module split is planned from.
```

- [ ] **Step 3: `CLAUDE.md` - "Commands"**

Replace the bullet starting `` - `npm test` — runs `tests/golden.js` `` (two lines) with:

```markdown
- `npm test` — builds `dist/` first, then runs the sync/generator checks, `tests/golden.js`
  and the rest of the chain (requires `playwright`; `npm install` first if `node_modules`
  isn't present). Must stay exact-to-the-cent.
- `npm run build` — writes `dist/`. `npm run dev` rebuilds on every change under `src/`
  with inline source maps: edit, save, refresh the browser.
```

Replace the two bullets beginning `` - Syntax-check a planner file without a browser `` and `` - No build/lint step exists `` with:

```markdown
- Syntax-check a planner without a browser: `node --check src/us/main.js` (it is plain
  JS), or load the built file in Playwright and watch `page.on('pageerror')`.
- There is no lint step. The only build step is the esbuild bundle; the delivered file
  is still a single self-contained HTML file that needs no server.
```

- [ ] **Step 4: `CLAUDE.md` - "Shared code between the planners"**

Replace the sentence `Never edit one planner's region alone: edit the fragment` through `` `npm run sync` (updates the other file). `` with:

```markdown
Never edit one planner's region alone: edit the fragment and run `npm run sync`, or
edit a planner source in place, then `npm run sync -- --pull src/us/main.js` (copies
back to `shared/`) and `npm run sync` (updates the other planner). Regions live in all
three source files per planner: `main.js` (`//` markers), `styles.css` (`/* */`) and
`index.html` (`<!-- -->`).
```

- [ ] **Step 5: `CLAUDE.md` - "Versioning"**

Replace `(the `<span>V19</span>`/`<span>V4</span>` inside the `<h1>`)` with `(the `<span>V19</span>`/`<span>V4</span>` inside the `<h1>` of `src/<country>/index.html`)`. Leave the version numbers as they are in the file.

- [ ] **Step 6: `README.md`**

In "Files", replace the three bullets for `Planner_US.html`, `Planner_Canada.html` and `shared/ + scripts/sync-shared.js` with:

```markdown
- `src/us/`, `src/canada/` — the source of each planner (`index.html`, `styles.css`, `main.js`)
- `npm run build` writes `dist/Planner_US.html` and `dist/Planner_Canada.html`, each a single self-contained file (nothing is fetched at runtime). `dist/` is not committed; it is published to GitHub Pages by CI
- `shared/` + `scripts/sync-shared.js` — canonical copies of the code (JS, CSS, markup) that is identical in both planners; `npm run sync` writes them into the sources and `npm test` fails if they drift
```

Replace the "Versioning" paragraph's first sentence `These files use **stable filenames** — always ...` with: `The built files use **stable filenames** — always `Planner_US.html` / `Planner_Canada.html`, never version-numbered suffixes.` and keep the bullets.

Replace the "Making an update" section body (the marker paragraph and the numbered list steps 1-2) with:

```markdown
Edit the files under `src/<country>/` (`npm run dev` rebuilds `dist/` on every save), run `npm test`, then commit. Code shared by both planners lives between `@@shared:<name> begin/end` marker comments; edit the fragment in `shared/` (or edit one planner source and run `npm run sync -- --pull <file>`), then `npm run sync`. See `CLAUDE.md`.

1. Edit `src/`, never `dist/`.
2. Run `npm test`; it builds first.
```
(keep steps 3 and 4 of the existing list unchanged).

Add this note at the end of the README's opening section, after the MIT sentence:

```markdown
**Hosted copy and saved data.** The planners can also be served from GitHub Pages. Your browser stores autosaved scenarios per site, so data saved while opening the file from disk is not visible on the hosted page (and vice versa); use the scenario export and import to move a plan between them. (Repo owner: set Settings > Pages > Source to "GitHub Actions" once.)
```

In "Testing", change the first sentence to start `` `npm test` builds `dist/` and also checks ``.

- [ ] **Step 7: Verify nothing stale remains in the living docs**

Run: `grep -n "Planner_US.html\|Planner_Canada.html\|sync -- --pull Planner\|single \`<script>\`\|one \`<script>\` block" CLAUDE.md README.md`
Expected: every remaining hit is either a `dist/Planner_*` mention, the stable-filenames rule, or a sentence about the built file. No hit may describe the HTML at the root as the thing to edit.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "Docs: describe the src/ layout, the esbuild build and the hosted copy" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Closure analyzer and inventory reports

**Files:**
- Create: `scripts/analyze-closure.js`, `tests/closure_analyzer.js`
- Create (generated): `docs/superpowers/inventory/closure-us.md`, `docs/superpowers/inventory/closure-canada.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `analyze(code) => { units, mutables, cycles, order, unknownGlobals, implicitGlobalWrites, regions }` where each unit is `{ label, names, kind, startLine, endLine, region, regionKind, dom, ui, deps }` (`deps` and every other cross-reference are unit labels; `kind` is `function | class | const | let | var | statement`); and `render(model, title) => markdown string`.
- `order` lists strongly connected components dependencies-first (leaves first), each an array of unit labels; `cycles` is the subset with more than one member.

- [ ] **Step 1: Install the two analysis dependencies**

Run: `npm install --save-dev --save-exact espree eslint-scope`
Expected: both appear under `devDependencies`. They are used only by this script, never at runtime or in the build.

- [ ] **Step 2: Write the failing test**

Create `tests/closure_analyzer.js`:

```js
// Unit tests for scripts/analyze-closure.js (plain Node, no browser).
const assert = require('assert');
const { analyze, render } = require('../scripts/analyze-closure');

const FIXTURE = `(() => {
  let counter = 0;
  const base = 2;
  function bump() { counter += base; return counter; }
  function show() { document.title = String(bump()); }
  // @@shared:sample begin
  function pure() { return base * 2; }
  // @@shared:sample end
  function a() { return b(); }
  function b() { return a(); }
  function leak() { oops = 1; }
  window.__test = pure;
})();
`;

const model = analyze(FIXTURE);
const unit = (label) => model.units.find((u) => u.label === label);

// Mutable bindings: written after initialisation, with the unit that writes them.
assert.deepStrictEqual(model.mutables.map((m) => m.name), ['counter']);
assert.deepStrictEqual(model.mutables[0].writers, ['bump']);

// Dependencies are between top-level units, by label.
assert.deepStrictEqual(unit('bump').deps, ['base', 'counter']);
assert.deepStrictEqual(unit('show').deps, ['bump']);
assert.deepStrictEqual(unit('pure').deps, ['base']);

// DOM use: direct, then transitive through dependencies.
assert.deepStrictEqual(unit('show').dom, ['document']);
assert.strictEqual(unit('show').ui, true);
assert.strictEqual(unit('bump').ui, false);
assert.strictEqual(unit('pure').ui, false);
const hook = model.units.find((u) => u.kind === 'statement');
assert.deepStrictEqual(hook.dom, ['window']);
assert.strictEqual(hook.ui, true);

// Marker regions.
assert.strictEqual(unit('pure').region, 'sample');
assert.strictEqual(unit('bump').region, null);

// Cycles, and a leaf-first extraction order.
assert.deepStrictEqual(model.cycles, [['a', 'b']]);
const position = (label) => model.order.findIndex((component) => component.includes(label));
assert.ok(position('base') < position('bump'), 'a dependency comes before its user');
assert.ok(position('bump') < position('show'));

// Assigning an undeclared name is an implicit global (a strict-mode ReferenceError).
assert.deepStrictEqual(model.implicitGlobalWrites.map((w) => w.name), ['oops']);

// The report mentions each section.
const md = render(model, 'fixture');
for (const heading of ['## Summary', '## Mutable top-level bindings', '## Shared regions', '## Cycles', '## Extraction order']) {
  assert.ok(md.includes(heading), `report is missing "${heading}"`);
}

console.log('closure_analyzer OK');
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node tests/closure_analyzer.js`
Expected: FAIL with `Cannot find module '../scripts/analyze-closure'`.

- [ ] **Step 4: Implement the analyzer**

Create `scripts/analyze-closure.js`:

```js
#!/usr/bin/env node
'use strict';
// Inventory of a planner's closure: what each top-level declaration of the big IIFE needs from the
// others. The module split is planned from this report (docs/superpowers/inventory/).
//
//   node scripts/analyze-closure.js     rewrite docs/superpowers/inventory/closure-{us,canada}.md
//
// A "unit" is one top-level statement of the IIFE in src/<country>/main.js (a function, a class, a
// let/const/var statement, or a side-effect statement such as an event-listener registration).
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const eslintScope = require('eslint-scope');

const ECMA = 2022;
const DOM_GLOBALS = new Set([
  'document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'requestAnimationFrame',
  'cancelAnimationFrame', 'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'history',
  'location', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'scrollTo', 'screen', 'visualViewport',
  'CustomEvent', 'Event', 'FileReader', 'Image', 'XMLSerializer', 'DOMParser', 'MutationObserver',
  'ResizeObserver', 'IntersectionObserver', 'HTMLElement', 'Element', 'Node', 'self', 'top',
]);
// Names every JS host has (Math, Object, setTimeout, ...); anything else that is free is "unknown".
const KNOWN_GLOBALS = new Set(Object.getOwnPropertyNames(globalThis));

const SHARED_MARK = /^\s*(?:\/\/|\/\*|<!--) @@shared:(\S+) (begin|end)(?: \*\/| -->)?\s*$/;
const DATA_MARK = /^\s*\/\/ ([A-Z][A-Z_]*):(begin|end)\s*$/;

function findRegions(lines) {
  const regions = [];
  let open = null;
  lines.forEach((line, i) => {
    const shared = SHARED_MARK.exec(line);
    const m = shared || DATA_MARK.exec(line);
    if (!m) return;
    const [, name, edge] = m;
    if (edge === 'begin') open = { name, kind: shared ? 'shared' : 'data', startLine: i + 1 };
    else if (open && open.name === name) {
      regions.push({ ...open, endLine: i + 1 });
      open = null;
    }
  });
  return regions;
}

function findIifeFunction(ast) {
  for (const node of ast.body) {
    if (node.type !== 'ExpressionStatement') continue;
    const call = node.expression;
    if (
      call.type === 'CallExpression' &&
      /^(Arrow)?FunctionExpression$/.test(call.callee.type) &&
      call.callee.body.type === 'BlockStatement'
    ) return call.callee;
  }
  throw new Error('no top-level IIFE found in the script');
}

const statementKind = (node) => {
  if (node.type === 'FunctionDeclaration') return 'function';
  if (node.type === 'ClassDeclaration') return 'class';
  if (node.type === 'VariableDeclaration') return node.kind;
  return 'statement';
};

// Tarjan's algorithm. Components come out dependencies-first (a component is emitted only after every
// component it depends on), which is the order modules can be extracted in.
function stronglyConnected(units) {
  let index = 0;
  const stack = [];
  const meta = new Map();
  const components = [];
  const visit = (u) => {
    const m = { index, low: index, onStack: true };
    index++;
    meta.set(u, m);
    stack.push(u);
    for (const d of u.deps.keys()) {
      if (!meta.has(d)) {
        visit(d);
        m.low = Math.min(m.low, meta.get(d).low);
      } else if (meta.get(d).onStack) {
        m.low = Math.min(m.low, meta.get(d).index);
      }
    }
    if (m.low === m.index) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        meta.get(w).onStack = false;
        component.push(w);
      } while (w !== u);
      components.push(component);
    }
  };
  for (const u of units) if (!meta.has(u)) visit(u);
  return components;
}

function analyze(code) {
  const lines = code.split('\n');
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'script', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'script' });
  const fn = findIifeFunction(ast);
  const fnScope = scopeManager.acquire(fn);

  const units = fn.body.body.map((node) => ({
    node,
    names: [],
    kind: statementKind(node),
    startLine: node.loc.start.line,
    endLine: node.loc.end.line,
    deps: new Map(), // unit -> Set of names used from it
    dom: new Set(),
    ui: false,
    region: null,
  }));
  const unitAt = (pos) => {
    let lo = 0;
    let hi = units.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const [start, end] = units[mid].node.range;
      if (pos < start) hi = mid - 1;
      else if (pos >= end) lo = mid + 1;
      else return units[mid];
    }
    return null;
  };

  const declared = fnScope.variables.filter((v) => v.defs.length > 0);
  for (const v of declared) unitAt(v.defs[0].node.range[0]).names.push(v.name);

  const mutables = [];
  for (const v of declared) {
    const owner = unitAt(v.defs[0].node.range[0]);
    const writers = new Set();
    for (const ref of v.references) {
      const user = unitAt(ref.identifier.range[0]);
      if (!user) continue;
      if (user !== owner) {
        if (!user.deps.has(owner)) user.deps.set(owner, new Set());
        user.deps.get(owner).add(v.name);
      }
      if (ref.isWrite() && !ref.init) writers.add(user);
    }
    if (writers.size) mutables.push({ name: v.name, unit: owner, writers: [...writers] });
  }

  const unknownGlobals = new Map();
  const implicitGlobalWrites = [];
  for (const ref of scopeManager.globalScope.through) {
    const name = ref.identifier.name;
    if (DOM_GLOBALS.has(name)) {
      const user = unitAt(ref.identifier.range[0]);
      if (user) user.dom.add(name);
      continue;
    }
    if (KNOWN_GLOBALS.has(name)) continue;
    const line = ref.identifier.loc.start.line;
    if (!unknownGlobals.has(name)) unknownGlobals.set(name, { name, line, written: false });
    if (ref.isWrite()) {
      unknownGlobals.get(name).written = true;
      implicitGlobalWrites.push({ name, line });
    }
  }

  const regions = findRegions(lines);
  for (const u of units) {
    u.region = regions.find((r) => u.startLine >= r.startLine && u.endLine <= r.endLine) || null;
    u.ui = u.dom.size > 0;
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const u of units) {
      if (u.ui) continue;
      for (const d of u.deps.keys()) {
        if (d.ui) { u.ui = true; changed = true; break; }
      }
    }
  }

  const label = (u) => (u.names.length ? u.names.join(', ') : `statement@${u.startLine}`);
  const components = stronglyConnected(units);
  return {
    units: units.map((u) => ({
      label: label(u),
      names: u.names,
      kind: u.kind,
      startLine: u.startLine,
      endLine: u.endLine,
      region: u.region ? u.region.name : null,
      regionKind: u.region ? u.region.kind : null,
      dom: [...u.dom].sort(),
      ui: u.ui,
      deps: [...u.deps.keys()].map(label).sort(),
    })),
    mutables: mutables.map((m) => ({
      name: m.name,
      declaredIn: label(m.unit),
      line: m.unit.startLine,
      writers: m.writers.map(label).sort(),
    })),
    cycles: components.filter((c) => c.length > 1).map((c) => c.map(label).sort()),
    order: components.map((c) => c.map(label).sort()),
    unknownGlobals: [...unknownGlobals.values()],
    implicitGlobalWrites,
    regions,
  };
}

function render(model, title) {
  const byLabel = new Map(model.units.map((u) => [u.label, u]));
  const out = [`# Closure inventory: ${title}`, '', 'Generated by `node scripts/analyze-closure.js`; do not edit by hand. Line numbers are those of the `main.js` it was generated from.', ''];

  const count = (kind) => model.units.filter((u) => u.kind === kind).length;
  out.push(
    '## Summary', '',
    `- top-level units: ${model.units.length} (${count('function')} functions, ${count('const')} const, ${count('let')} let, ${count('var')} var, ${count('class')} classes, ${count('statement')} side-effect statements)`,
    `- mutable top-level bindings (written after initialisation): ${model.mutables.length}`,
    `- units that touch the DOM directly: ${model.units.filter((u) => u.dom.length).length}; ui by dependency: ${model.units.filter((u) => u.ui).length}; core candidates: ${model.units.filter((u) => !u.ui).length}`,
    `- units inside shared regions: ${model.units.filter((u) => u.regionKind === 'shared').length}; inside data regions: ${model.units.filter((u) => u.regionKind === 'data').length}`,
    `- dependency cycles: ${model.cycles.length}; largest component: ${Math.max(0, ...model.order.map((c) => c.length))} units`,
    `- implicit-global writes: ${model.implicitGlobalWrites.length}; unknown free names: ${model.unknownGlobals.length}`,
    '',
  );

  out.push('## Mutable top-level bindings', '', 'Every one needs a home (a singleton module or a returned value) before the code that writes it can move.', '');
  out.push('| name | declared (line) | region | written by |', '|---|---|---|---|');
  for (const m of model.mutables) {
    const owner = byLabel.get(m.declaredIn);
    out.push(`| \`${m.name}\` | ${m.line} | ${owner.region || '-'} | ${m.writers.join(', ')} |`);
  }
  out.push('');

  out.push('## Shared regions', '', 'For each `@@shared` region: what it needs from outside itself. Anything marked `country` is a seam: the shared module cannot import it.', '');
  out.push('| region | lines | units | needs from outside |', '|---|---|---|---|');
  for (const r of model.regions.filter((x) => x.kind === 'shared')) {
    const inside = model.units.filter((u) => u.region === r.name);
    const needs = new Set();
    for (const u of inside) {
      for (const d of u.deps) {
        const du = byLabel.get(d);
        if (du.region !== r.name) needs.add(`${d} (${du.region || 'country'})`);
      }
    }
    out.push(`| ${r.name} | ${r.startLine}-${r.endLine} | ${inside.length} | ${[...needs].sort().join('; ') || '-'} |`);
  }
  out.push('');

  out.push('## Cycles', '', model.cycles.length ? 'Members of a cycle must move together.' : 'None.', '');
  for (const c of model.cycles) out.push(`- ${c.join(' <-> ')}`);
  out.push('');

  out.push('## Implicit globals and unknown names', '');
  if (!model.unknownGlobals.length) out.push('None.');
  else {
    out.push('| name | first seen (line) | assigned |', '|---|---|---|');
    for (const g of model.unknownGlobals) out.push(`| \`${g.name}\` | ${g.line} | ${g.written ? '**yes (strict-mode ReferenceError)**' : 'no'} |`);
  }
  out.push('');

  out.push('## Extraction order', '', 'Dependencies first. `ui` means the unit touches the DOM directly or depends on one that does.', '');
  out.push('| # | unit(s) | kind | lines | region | side |', '|---|---|---|---|---|---|');
  model.order.forEach((component, i) => {
    const us = component.map((l) => byLabel.get(l));
    const lineRange = `${Math.min(...us.map((u) => u.startLine))}-${Math.max(...us.map((u) => u.endLine))}`;
    const region = [...new Set(us.map((u) => u.region || '-'))].join(', ');
    const side = us.some((u) => u.ui) ? 'ui' : 'core';
    const direct = [...new Set(us.flatMap((u) => u.dom))];
    out.push(`| ${i + 1} | ${component.join(' + ')} | ${us[0].kind} | ${lineRange} | ${region} | ${side}${direct.length ? ` (${direct.join(', ')})` : ''} |`);
  });
  out.push('');
  return out.join('\n');
}

module.exports = { analyze, render };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const outDir = path.join(root, 'docs', 'superpowers', 'inventory');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [dir, title] of [['us', 'US'], ['canada', 'Canada']]) {
    const model = analyze(fs.readFileSync(path.join(root, 'src', dir, 'main.js'), 'utf8'));
    fs.writeFileSync(path.join(outDir, `closure-${dir}.md`), render(model, title));
    console.log(`${title}: ${model.units.length} units, ${model.mutables.length} mutable, ${model.cycles.length} cycles, ${model.implicitGlobalWrites.length} implicit-global writes`);
  }
}
```

- [ ] **Step 5: Run the unit test**

Run: `node tests/closure_analyzer.js`
Expected: `closure_analyzer OK`. If an assertion fails, fix the analyzer (not the test) unless the test's expectation is wrong. If `espree` reports a parse error, the fixture needs no change; the error will appear in Step 6 for real code, and raising `ECMA` is the fix.

- [ ] **Step 6: Generate the reports and sanity-check them**

Run: `node scripts/analyze-closure.js`
Expected: two lines, one per planner, with plausible counts (US: several hundred units; mutable bindings roughly the size of the ~35 top-level `let`s that `grep -cE '^  let ' src/us/main.js` finds, though a `let` that is never reassigned is not counted and a `var` or multi-declarator `let` may add a few).

Open `docs/superpowers/inventory/closure-us.md` and check:
- "Mutable top-level bindings" contains `state`, `histTaxFactors` and `taxFactorInflation`.
- "Shared regions" lists `13-simulate` with `runProjection` and `histTaxFactors` among its outside needs.
- "Implicit globals" is `None.`. If it lists assigned names, those are strict-mode violations: if Task 5 turned strict mode on, they should already have been fixed (re-check that task); otherwise list them in the PR description.

- [ ] **Step 7: Add the script, add the test to the chain, and run everything**

In `package.json`: add `"analyze": "node scripts/analyze-closure.js",` to `scripts`, and insert `node tests/closure_analyzer.js && ` right after `node tests/build_output.js && ` in the `test` chain.

Run: `npm test`
Expected: green; `git status --short tests/snapshots` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add scripts/analyze-closure.js tests/closure_analyzer.js docs/superpowers/inventory package.json package-lock.json
git commit -m "Tooling: closure analyzer and the first dependency inventory of both planners" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Definition of done

- From a fresh clone, `npm ci && npm test` builds `dist/` and passes.
- `git diff <BASE> --stat -- tests/snapshots` is empty.
- `dist/` is ignored; the root `Planner_*.html` files are gone; `src/` is the only source.
- `npm run dev` rebuilds on save.
- The workflow publishes `dist/` on pushes to `main` (needs the one-time Pages setting in Task 6 Step 4).
- `CLAUDE.md` and `README.md` describe `src/`, the build, and the hosted-copy storage caveat; nothing in them tells a reader to edit a root `Planner_*.html`.
- `docs/superpowers/inventory/closure-{us,canada}.md` are committed.

## Follow-up plans

Written one at a time, each from the previous stage's actual results. They replace stages 1-4 of the spec as it stood on 2026-10-10 (the spec is amended to match).

1. **Foundations.** Give each mutable top-level binding in the inventory a home: country-agnostic singleton modules (`store` with `state`/`setState`, `dom`, UI preferences, memo caches), moved out of the closure while it still runs as one bundle. Decide the "seam" mechanism for the places where a shared piece needs a country-specific function (candidates: a factory taking its dependencies, or a small registry the entry point fills at start-up), using the "Shared regions" table.
2. **Shared fragments become modules**, in the extraction order of the report, retiring the markers region by region and deleting `sync-shared.js` when the last one goes.
3. **`core/`**: tax, per-year helpers, engine, rules data (the generators then import the data modules instead of scraping `main.js`), `normalizeState`; Vitest and the purity scan arrive here.
4. **`ui/`**: render, sync, charts, wizard, MCP wiring; the final rewrite of the architecture sections of `CLAUDE.md`, `docs/reference.md`, `docs/roadmap.md`; save the project memories.
