'use strict';
// Fixture cases for scripts/compare-builds.js: compareScripts(baseCode, headCode, { ordered }) on small scripts, no build.
const assert = require('assert');
const { compareScripts } = require('../scripts/compare-builds.js');

const run = (base, head) => compareScripts(base, head, { ordered: true });
const same = (r) => r.missing.length === 0 && r.added.length === 0;

// 1. Identical scripts: equal, ordered ok.
{
  const r = run('a(); b();', 'a(); b();');
  assert(same(r), 'case 1 equal');
  assert.strictEqual(r.orderedOk, true, 'case 1 ordered');
}

// 2. A wiring function called once is expanded in place.
{
  const r = run('a(); b();', 'function wireX() { a(); b(); } wireX();');
  assert(same(r), 'case 2 equal');
  assert.strictEqual(r.orderedOk, true, 'case 2 ordered');
}

// 3. Same statements, different order: multiset equal, ordered fails at #0.
{
  const r = run('a(); b();', 'b(); a();');
  assert(same(r), 'case 3 multiset equal');
  assert.strictEqual(r.orderedOk, false, 'case 3 ordered fails');
  assert.strictEqual(r.firstOrderDiff.index, 0, 'case 3 at #0');
}

// 4. A function called twice is not a wiring function: not expanded.
{
  const r = run('a(); a();', 'function wireX() { a(); } wireX(); wireX();');
  assert.deepStrictEqual(r.added.slice().sort(), ['function wireX() { a(); }', 'wireX()'].sort(), 'case 4 new in head');
  assert.deepStrictEqual(r.missing, ['a()'], 'case 4 missing from head');
}

// 5. Split declaration: `let x; x = y;` is `var x = y` at the assignment's position.
{
  const r = run('let x = y; a();', 'let x; x = y; a();');
  assert(same(r), 'case 5 equal');
  assert.strictEqual(r.orderedOk, true, 'case 5 ordered');
  const moved = run('let x = y; a();', 'let x; a(); x = y;');
  assert(same(moved), 'case 5 moved: multiset equal');
  assert.strictEqual(moved.orderedOk, false, 'case 5 moved: ordered fails');
}

// 6. A wiring function whose body holds an IIFE is re-flattened.
{
  const r = run('(function f() { a(); })();', 'function wireX() { (function f() { a(); })(); } wireX();');
  assert(same(r), 'case 6 equal');
}

// 7. A head function whose name exists in the base is not wiring.
{
  const m = run('function render() { a(); } b();', 'function render() { a(); } render(); b();');
  assert.deepStrictEqual(m.added, ['render()'], 'case 7 call stays as written');
  assert.deepStrictEqual(m.missing, [], 'case 7 declaration kept');
}

console.log('compare_builds OK');
