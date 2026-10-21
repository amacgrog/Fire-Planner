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
const crypto = require('crypto');
const path = require('path');
const espree = require('espree');
const eslintScope = require('eslint-scope');

const ECMA = 2022;
const DOM_GLOBALS = new Set([
  'document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'requestAnimationFrame',
  'cancelAnimationFrame', 'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'history',
  'location', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'scrollTo', 'screen', 'visualViewport',
  'CustomEvent', 'Event', 'FileReader', 'Image', 'XMLSerializer', 'DOMParser', 'MutationObserver',
  'ResizeObserver', 'IntersectionObserver', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Element', 'Node', 'self', 'top',
]);
// A DOM method called on an element (core/ code calls none: tests/core_purity.js and scripts/lib/regroup.js read this).
const DOM_METHODS = /\.(addEventListener|removeEventListener|setSelectionRange|appendChild|removeChild|setAttribute|removeAttribute|querySelector|querySelectorAll|classList|innerHTML|textContent|getBoundingClientRect)\b/;
// Code without its comments, for the DOM_METHODS and import-source text checks (a `//` after `:` is kept, for URLs).
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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

const CALLABLE_INIT = /^(FunctionExpression|ArrowFunctionExpression|ClassExpression)$/;
const isCallable = (node) => {
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return true;
  return node.type === 'VariableDeclaration' && node.declarations.every((d) => d.init && CALLABLE_INIT.test(d.init.type));
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

// Statement units have no name, so their label is a hash of their normalized text (whitespace runs
// collapsed to one space, trimmed): it survives edits elsewhere and reformatting. __setLabelHash is a
// test hook (it returns a function that restores the real hash).
const sha1Hex = (text) => crypto.createHash('sha1').update(text).digest('hex');
let labelHash = sha1Hex;
const normalizeStatement = (text) => text.replace(/\s+/g, ' ').trim();
const statementLabel = (text) => 'stmt:' + labelHash(normalizeStatement(text)).slice(0, 8);
function __setLabelHash(fn) {
  const previous = labelHash;
  labelHash = fn;
  return () => { labelHash = previous; };
}

function analyze(code) {
  const lines = code.split('\n');
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'module' });
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
    importUses: new Set(), // local names of module-level import bindings this unit references
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
  // A unit becomes ui through a dependency d only if d is callable (a function or class declaration,
  // or a declaration whose every initializer is a function, arrow or class expression) or touches a DOM
  // global itself. A dependency that is ui only by transitivity and is not callable (a registry object, a
  // grouped `let state, ...`) is just read by its users, so it does not drag them to the ui side.
  for (const u of units) u.callable = isCallable(u.node);
  for (let changed = true; changed; ) {
    changed = false;
    for (const u of units) {
      if (u.ui) continue;
      for (const d of u.deps.keys()) {
        if (d.ui && (d.callable || d.dom.size > 0)) { u.ui = true; changed = true; break; }
      }
    }
  }

  // Statement labels: hash of the normalized text; a repeat inside one scope (a shared region, or the
  // code outside regions) gets #2, #3; the same label in two scopes, or two texts with one hash prefix, throws.
  const prefixOwner = new Map(); // bare label -> { text, line }
  const seenInScope = new Map(); // scope -> Map(bare label -> count)
  const taken = new Map(); // final label -> line
  for (const u of units) {
    if (u.names.length) { u.label = u.names.join(', '); continue; }
    const text = normalizeStatement(code.slice(u.node.range[0], u.node.range[1]));
    const bare = statementLabel(text);
    const owner = prefixOwner.get(bare);
    if (owner && owner.text !== text) throw new Error(`statement label collision: ${bare} at lines ${owner.line} and ${u.startLine}`);
    if (!owner) prefixOwner.set(bare, { text, line: u.startLine });
    const scope = u.region ? `region:${u.region.startLine}` : 'outside';
    if (!seenInScope.has(scope)) seenInScope.set(scope, new Map());
    const counts = seenInScope.get(scope);
    const n = (counts.get(bare) || 0) + 1;
    counts.set(bare, n);
    u.label = n === 1 ? bare : `${bare}#${n}`;
    if (taken.has(u.label)) throw new Error(`duplicate statement label: ${u.label} at lines ${taken.get(u.label)} and ${u.startLine}`);
    taken.set(u.label, u.startLine);
  }
  const label = (u) => u.label;
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
      importUses: [...u.importUses].sort(),
      ui: u.ui,
      deps: [...u.deps.keys()].map(label).sort(),
      uses: [...u.deps].map(([d, names]) => ({ unit: label(d), names: [...names].sort() })).sort((x, y) => (x.unit < y.unit ? -1 : x.unit > y.unit ? 1 : 0)),
    })),
    mutables: mutables.map((m) => ({
      name: m.name,
      declaredIn: label(m.unit),
      line: m.unit.startLine,
      writers: m.writers.map(label).sort(),
      writerLines: Object.fromEntries(m.writers.map((w) => [label(w), w.startLine])),
    })),
    cycles: components.filter((c) => c.length > 1).map((c) => c.map(label).sort()),
    order: components.map((c) => c.map(label).sort()),
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
    out.push(`| \`${m.name}\` | ${m.line} | ${owner.region || '-'} | ${m.writers.map((w) => (w.startsWith('stmt:') ? `${w} (line ${m.writerLines[w]})` : w)).join(', ')} |`);
  }
  out.push('');

  out.push('## Shared regions', '', 'For each `@@shared` region: what it needs from outside itself. Anything marked `country` is a seam: the shared module cannot import it.', '');
  out.push('| region | lines | units | needs from outside |', '|---|---|---|---|');
  for (const r of model.regions.filter((x) => x.kind === 'shared')) {
    const inside = model.units.filter((u) => u.region === r.name);
    const needs = new Set();
    for (const u of inside) {
      for (const use of u.uses) {
        const du = byLabel.get(use.unit);
        if (du.region !== r.name) for (const name of use.names) needs.add(`${name} (${du.region || 'country'})`);
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

  out.push('## Extraction order', '', 'Dependencies first. `ui` means the unit touches the DOM directly or calls (or holds a value of) one that does; a plain read of a value that is ui only by transitivity does not count.', '');
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

// Browser globals (document, window, localStorage, ...) a module uses without declaring them. [{ name, line }]
// Resolved through scope analysis, so comments, strings and shadowing local names are not counted.
function domGlobalsUsed(code) {
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const scopeManager = eslintScope.analyze(ast, { ecmaVersion: ECMA, sourceType: 'module' });
  return scopeManager.globalScope.through
    .filter((ref) => DOM_GLOBALS.has(ref.identifier.name))
    .map((ref) => ({ name: ref.identifier.name, line: ref.identifier.loc.start.line }));
}

module.exports = { analyze, render, undeclaredNames, domGlobalsUsed, statementLabel, __setLabelHash, DOM_GLOBALS, DOM_METHODS, stripComments };

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
