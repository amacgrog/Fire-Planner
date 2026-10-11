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
    const model = analyze(fs.readFileSync(path.join(root, 'src', dir, 'main.js'), 'utf8').replace(/\r\n/g, '\n'));
    fs.writeFileSync(path.join(outDir, `closure-${dir}.md`), render(model, title));
    console.log(`${title}: ${model.units.length} units, ${model.mutables.length} mutable, ${model.cycles.length} cycles, ${model.implicitGlobalWrites.length} implicit-global writes`);
  }
}
