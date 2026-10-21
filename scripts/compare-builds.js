#!/usr/bin/env node
'use strict';
// Compares the built planners of two trees statement by statement (a refactor must change where code lives, not what it is).
//   node scripts/compare-builds.js --base <dir-with-dist> [--head <dir-with-dist>] [--ordered]
// For each planner it takes the inline script, flattens the nested IIFEs, splits multi-declarator declarations and
// compares the multiset of statement texts (whitespace normalised). Exit 1 and a list of the differences otherwise.
// On the head side it first undoes the two moves the module extraction makes (design 6.2): a wiring function (a new
// top-level function called exactly once as `name()` and referenced nowhere else) is expanded back into its call site,
// and a `let x; ... x = <expr>;` pair whose base declaration is `x = <expr>` becomes one `var x = <expr>` at the assignment.
// With --ordered it also requires the statements that are not declarations (plus the declarations of those split names)
// to appear in the same order on both sides.
// KNOWN, ACCEPTED LIMIT: declarations other than the split-matched names are not part of the ordered subsequence, so the
// order of their initializers is not checked here (`var a = f(); g();` and `g(); var a = f();` both pass). The load-time
// guard in scripts/lib/load-time.js covers the ui modules.
// esbuild may drop a declaration that is unused; list such names in ALLOWED_DROPS below with the reason.
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ALLOWED_DROPS = [];
const PLANNERS = ['Planner_US.html', 'Planner_Canada.html'];

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

const collapse = (t) => t.replace(/\s+/g, ' ').trim();
// esbuild turns a module's top-level const and let into var when it bundles, so declarations compare as var
const norm = (t) => collapse(t).replace(/;$/, '').trim().replace(/^(const|let) /, 'var ');
const DECLARATIONS = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration']);

// Statement items: { text, decl, node, name, init, kind } where name/init describe a one-name variable declaration.
function flatten(nodes, code) {
  const out = [];
  const visit = (list) => {
    for (const stmt of list) {
      const inner = isIife(stmt);
      if (inner) { visit(inner.body); continue; }
      if (stmt.type === 'VariableDeclaration') {
        const split = stmt.declarations.length > 1;
        for (const d of stmt.declarations) {
          out.push({
            text: split ? norm(`var ${code.slice(d.range[0], d.range[1])}`) : norm(code.slice(stmt.range[0], stmt.range[1])),
            decl: true,
            node: stmt,
            kind: stmt.kind,
            name: d.id.type === 'Identifier' ? d.id.name : null,
            init: d.init ? collapse(code.slice(d.init.range[0], d.init.range[1])) : null,
          });
        }
      } else {
        out.push({ text: norm(code.slice(stmt.range[0], stmt.range[1])), decl: DECLARATIONS.has(stmt.type), node: stmt, name: null, init: null });
      }
    }
  };
  visit(nodes);
  return out;
}

function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (key === 'range' || key === 'loc') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && walk(c, fn));
    else if (v && typeof v === 'object') walk(v, fn);
  }
}

function declaredNames(ast) {
  const names = new Set();
  walk(ast, (n) => {
    if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') && n.id) names.add(n.id.name);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') names.add(n.id.name);
    if (/Function/.test(n.type)) (n.params || []).forEach((p) => p.type === 'Identifier' && names.add(p.name));
  });
  return names;
}

const parse = (code) => espree.parse(code, { ecmaVersion: 'latest', sourceType: 'script', range: true });

const callName = (item) => {
  const s = item.node;
  if (s.type !== 'ExpressionStatement' || s.expression.type !== 'CallExpression') return null;
  const c = s.expression;
  return c.callee.type === 'Identifier' && c.arguments.length === 0 ? c.callee.name : null;
};

// Step 2: expand wiring functions (head only).
function expandWiring(items, ast, code, baseNames) {
  const refs = new Map();
  walk(ast, (n) => { if (n.type === 'Identifier') refs.set(n.name, (refs.get(n.name) || 0) + 1); });
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < items.length; i++) {
      const fn = items[i].node;
      if (fn.type !== 'FunctionDeclaration' || !fn.id || baseNames.has(fn.id.name)) continue;
      if (fn.async || fn.generator || fn.params.length !== 0) continue;
      const name = fn.id.name;
      const calls = [];
      items.forEach((it, j) => { if (callName(it) === name) calls.push(j); });
      if (calls.length !== 1 || refs.get(name) !== 2) continue;
      const body = flatten(fn.body.body, code);
      const at = calls[0];
      items.splice(at, 1, ...body);
      items.splice(i, 1);
      changed = true;
      break;
    }
  }
}

// Step 3: `let x; ... x = <expr>;` against a base `x = <expr>` declaration (head only). Returns the matched names.
function joinSplitDeclarations(items, baseItems) {
  const matched = new Set();
  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    if (!d.decl || d.node.type !== 'VariableDeclaration' || (d.kind !== 'let' && d.kind !== 'var') || d.init !== null || !d.name) continue;
    const assigns = [];
    items.forEach((it, j) => {
      const e = it.node.type === 'ExpressionStatement' ? it.node.expression : null;
      if (e && e.type === 'AssignmentExpression' && e.operator === '=' && e.left.type === 'Identifier' && e.left.name === d.name) assigns.push(j);
    });
    if (assigns.length !== 1) continue;
    const j = assigns[0];
    const e = items[j].node.expression;
    const exprText = collapse(items[j].src.slice(e.right.range[0], e.right.range[1]));
    if (!baseItems.some((b) => b.decl && b.name === d.name && b.init === exprText)) continue;
    items[j] = { text: norm(`var ${d.name} = ${exprText}`), decl: true, node: d.node, kind: 'var', name: d.name, init: exprText, src: items[j].src };
    items.splice(i, 1);
    i--;
    matched.add(d.name);
  }
  return matched;
}

const tally = (list) => {
  const m = new Map();
  list.forEach((t) => m.set(t, (m.get(t) || 0) + 1));
  return m;
};

function compareScripts(baseCode, headCode, opts) {
  const ordered = !!(opts && opts.ordered);
  const baseAst = parse(baseCode);
  const headAst = parse(headCode);
  const baseItems = flatten(baseAst.body, baseCode);
  baseItems.forEach((it) => { it.src = baseCode; });
  let headItems = flatten(headAst.body, headCode);
  headItems.forEach((it) => { it.src = headCode; });
  expandWiring(headItems, headAst, headCode, declaredNames(baseAst));
  headItems.forEach((it) => { it.src = headCode; });
  const matched = joinSplitDeclarations(headItems, baseItems);

  const baseTexts = baseItems.map((i) => i.text);
  const headTexts = headItems.map((i) => i.text);
  const bt = tally(baseTexts);
  const ht = tally(headTexts);
  const missing = [];
  const added = [];
  for (const [t, n] of bt) if ((ht.get(t) || 0) < n) missing.push(t);
  for (const [t, n] of ht) if ((bt.get(t) || 0) < n) added.push(t);

  let orderedOk = true;
  let firstOrderDiff = null;
  let orderedCount = 0;
  if (ordered) {
    const keep = (it) => !it.decl || (it.name !== null && matched.has(it.name));
    const bo = baseItems.filter(keep).map((i) => i.text);
    const ho = headItems.filter(keep).map((i) => i.text);
    orderedCount = bo.length;
    const n = Math.max(bo.length, ho.length);
    for (let i = 0; i < n; i++) {
      if (bo[i] !== ho[i]) {
        orderedOk = false;
        firstOrderDiff = { index: i, base: bo[i], head: ho[i] };
        break;
      }
    }
  }
  return { base: baseTexts, head: headTexts, missing, added, orderedOk, firstOrderDiff, orderedCount };
}

function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const baseDir = value('--base');
  const headDir = value('--head') || path.join(__dirname, '..');
  const ordered = args.includes('--ordered');
  if (!baseDir) {
    console.error('usage: node scripts/compare-builds.js --base <dir-with-dist> [--head <dir-with-dist>] [--ordered]');
    process.exit(2);
  }
  let failed = false;
  for (const planner of PLANNERS) {
    const r = compareScripts(scriptOf(baseDir, planner), scriptOf(headDir, planner), { ordered });
    const allowed = (t) => ALLOWED_DROPS.some((a) => t.includes(a));
    const realMissing = r.missing.filter((t) => !allowed(t));
    console.log(`${planner}: base ${r.base.length} statements, head ${r.head.length}; missing from head ${r.missing.length}, new in head ${r.added.length}`);
    if (realMissing.length || r.added.length) {
      failed = true;
      realMissing.slice(0, 10).forEach((t) => console.log(`  missing: ${t.slice(0, 140)}`));
      r.added.slice(0, 10).forEach((t) => console.log(`  new:     ${t.slice(0, 140)}`));
    }
    if (ordered) {
      if (r.orderedOk) console.log(`ordered: ${r.orderedCount} statements identical`);
      else {
        failed = true;
        const d = r.firstOrderDiff;
        console.log(`ordered: first difference at #${d.index}: base ${String(d.base).slice(0, 140)} | head ${String(d.head).slice(0, 140)}`);
      }
    }
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { compareScripts };
if (require.main === module) main();
