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
