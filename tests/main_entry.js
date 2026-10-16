// The planner entry points hold no declarations (CLAUDE.md, "main.js is the entry point"): in each src/<country>/main.js
// the top-level statements are imports followed by one IIFE, and the IIFE body holds only expression statements that are
// calls (`wireThemeToggle();`, `assignState(normalizeState(null));`) and if statements whose branches follow the same
// rule. Parsed with espree, like scripts/lib/. `--root DIR` checks another tree; run without --root, it first runs its
// fixtures through that option, then checks this repository.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const espree = require('espree');

const COUNTRIES = ['us', 'canada'];
const isIife = (st) =>
  st.type === 'ExpressionStatement' &&
  st.expression.type === 'CallExpression' &&
  /^(ArrowFunctionExpression|FunctionExpression)$/.test(st.expression.callee.type) &&
  st.expression.callee.body.type === 'BlockStatement';
function bodyProblems(st, out) {
  if (st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression') return;
  if (st.type === 'IfStatement') {
    for (const branch of [st.consequent, st.alternate]) {
      if (!branch) continue;
      if (branch.type === 'BlockStatement') branch.body.forEach((x) => bodyProblems(x, out));
      else bodyProblems(branch, out);
    }
    return;
  }
  const what = st.type === 'ExpressionStatement' ? `${st.expression.type} statement` : st.type === 'VariableDeclaration' ? `${st.kind} declaration` : st.type;
  out.push(`line ${st.loc.start.line}: ${what} in the IIFE (only calls and if statements)`);
}
function problemsOf(code) {
  let ast;
  try {
    ast = espree.parse(code, { ecmaVersion: 2022, sourceType: 'module', loc: true });
  } catch (e) {
    return [`does not parse: ${e.message}`];
  }
  const out = [];
  const body = ast.body;
  let k = 0;
  while (k < body.length && body[k].type === 'ImportDeclaration') k++;
  const rest = body.slice(k);
  if (rest.length !== 1 || !isIife(rest[0])) {
    const odd = rest.find((st) => !isIife(st)) || rest[1];
    out.push(odd ? `line ${odd.loc.start.line}: ${odd.type} at the top level (only imports, then one IIFE)` : 'no IIFE after the imports');
    return out;
  }
  rest[0].expression.callee.body.body.forEach((st) => bodyProblems(st, out));
  return out;
}
function check(root) {
  const failures = [];
  for (const c of COUNTRIES) {
    const file = path.join(root, 'src', c, 'main.js');
    if (!fs.existsSync(file)) {
      failures.push(`src/${c}/main.js: missing`);
      continue;
    }
    for (const p of problemsOf(fs.readFileSync(file, 'utf8'))) failures.push(`src/${c}/main.js: ${p}`);
  }
  return failures;
}
function report(root) {
  const failures = check(root);
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`main_entry FAILED (${failures.length})`);
    process.exit(1);
  }
  console.log(`main_entry OK (${COUNTRIES.length} entry points)`);
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--root');
if (at >= 0) {
  report(path.resolve(argv[at + 1] || '.'));
} else {
  const made = [];
  const tree = (us, canada = us) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'main-entry-'));
    made.push(root);
    for (const [c, text] of [['us', us], ['canada', canada]]) {
      fs.mkdirSync(path.join(root, 'src', c), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', c, 'main.js'), text);
    }
    return root;
  };
  const runOn = (root) => spawnSync(process.execPath, [__filename, '--root', root], { encoding: 'utf8' });
  const GOOD = "import { a, b } from './a.js';\nimport { s } from './s.js';\n(() => {\n  a();\n  s.list.forEach((x) => b(x));\n  if (a()) b();\n  if (a()) {\n    b();\n  } else b();\n})();\n";
  const wrap = (line) => `import { a } from './a.js';\n(() => {\n  a();\n${line}\n})();\n`;
  try {
    const ok = runOn(tree(GOOD));
    assert.strictEqual(ok.status, 0, ok.stderr);
    const cases = [
      [wrap('  function helper() {}'), 'line 4: FunctionDeclaration in the IIFE'],
      [wrap('  let x = a();'), 'line 4: let declaration in the IIFE'],
      [wrap('  const x = 1;'), 'line 4: const declaration in the IIFE'],
      [wrap('  x = a();'), 'line 4: AssignmentExpression statement in the IIFE'],
      [wrap('  if (a()) { let y = 1; }'), 'line 4: let declaration in the IIFE'],
      [wrap('  for (;;) a();'), 'line 4: ForStatement in the IIFE'],
      [GOOD + 'a();\n', 'line 11: ExpressionStatement at the top level'],
      ["import { a } from './a.js';\nconst k = 1;\n(() => {\n  a();\n})();\n", 'line 2: VariableDeclaration at the top level'],
      ["import { a } from './a.js';\n", 'no IIFE after the imports'],
    ];
    for (const [text, expect] of cases) {
      const r = runOn(tree(GOOD, text));
      assert.strictEqual(r.status, 1, `expected a failure: ${expect}`);
      assert.ok(r.stderr.includes(`src/canada/main.js: ${expect}`), `${expect}: ${r.stderr}`);
    }
  } finally {
    made.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  }
  report(path.join(__dirname, '..'));
}
