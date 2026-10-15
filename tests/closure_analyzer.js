// Unit tests for scripts/analyze-closure.js (plain Node, no browser).
const assert = require('assert');
const { analyze, render, undeclaredNames, domGlobalsUsed } = require('../scripts/analyze-closure');

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

// Used names per dependency.
assert.deepStrictEqual(unit('bump').uses, [{ unit: 'base', names: ['base'] }, { unit: 'counter', names: ['counter'] }]);

// ui propagates through callable dependencies and DOM-direct ones, not through plain reads of a
// value that is ui only by transitivity.
const UI_FIXTURE = `(() => {
  const el = document.getElementById('x');
  const f = () => document.title;
  function touch() { document.title = 'x'; }
  const FIELDS = { onInput: touch };
  let state = FIELDS, other = 1;
  function readState() { return state + other; }
  function readEl() { return el; }
  function callF() { return f(); }
  function callTouch() { return touch(); }
})();
`;
const ui = analyze(UI_FIXTURE);
const uiOf = (label) => ui.units.find((u) => u.label === label).ui;
assert.strictEqual(uiOf('touch'), true);
assert.strictEqual(uiOf('FIELDS'), true, 'a value built from a ui function is ui itself');
assert.strictEqual(uiOf('state, other'), false);
assert.strictEqual(uiOf('readState'), false, '(a) a transitive, non-callable dependency does not propagate');
assert.strictEqual(uiOf('callTouch'), true, '(a) a caller of a DOM-touching function is ui');
assert.strictEqual(uiOf('callF'), true, '(b) a caller of a DOM-touching arrow function is ui');
assert.strictEqual(uiOf('readEl'), true, '(c) a reader of a DOM-direct value is ui');

// ES-module sources: top-level imports are resolved bindings (not unknown names), and an
// undeclared name is still reported.
const withImport = analyze(`import { shared } from './shared.js';
(() => {
  function use() { return shared + missing; }
})();
`);
assert.deepStrictEqual(withImport.unknownGlobals.map((g) => g.name), ['missing']);
assert.deepStrictEqual(withImport.units.find((u) => u.label === 'use').deps, []);

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

console.log('closure_analyzer OK');
