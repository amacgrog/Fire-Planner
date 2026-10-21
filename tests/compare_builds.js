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

// Round 1 fixtures.
// A wiring function must be a plain function: async, generator and parameterised ones are not expanded.
for (const [label, head] of [
  ['async', 'async function wireX() { a(); } wireX();'],
  ['generator', 'function* wireX() { a(); } wireX();'],
  ['parameters', 'function wireX(p) { a(); } wireX();'],
]) {
  const r = run('a();', head);
  assert(r.added.length === 2 && r.added.includes('wireX()'), 'shape ' + label + ': stays as new in head');
  assert.deepStrictEqual(r.missing, ['a()'], 'shape ' + label + ': a() missing');
}

// A function referenced as a value elsewhere is not expanded.
{
  const r = run('a(); use(wireX);', 'function wireX() { a(); } wireX(); use(wireX);');
  assert.deepStrictEqual(r.added.slice().sort(), ['function wireX() { a(); }', 'wireX()'].sort(), 'value reference: not expanded');
}

// Nested wiring: w1 calls w2; both expand to the base statements in order.
{
  const r = run('a(); b();', 'function w1() { w2(); } function w2() { a(); b(); } w1();');
  assert(same(r), 'nested wiring equal');
  assert.strictEqual(r.orderedOk, true, 'nested wiring ordered');
}

// The expansion lands at the call's position.
{
  assert.strictEqual(run('x(); a(); b();', 'x(); function wireX() { a(); b(); } wireX();').orderedOk, true, 'position ok');
  const bad = run('x(); a(); b();', 'function wireX() { a(); b(); } wireX(); x();');
  assert(same(bad), 'position wrong: multiset equal');
  assert.strictEqual(bad.orderedOk, false, 'position wrong: ordered fails');
}

// Case 6 is also ordered.
assert.strictEqual(run('(function f() { a(); })();', 'function wireX() { (function f() { a(); })(); } wireX();').orderedOk, true, 'case 6 ordered');

// The split join needs the base initializer text and exactly one assignment.
{
  const diff = run('let x = y; a();', 'let x; x = z; a();');
  assert(!same(diff), 'different initializer: not joined');
  const two = run('let x = y; a();', 'let x; x = y; x = y; a();');
  assert(!same(two), 'two assignments: not joined');
}

// KNOWN, ACCEPTED LIMIT (owner ruling): declarations other than split-matched names are not in the ordered subsequence, so
// moving a declaration's initializer relative to other statements is not caught by --ordered.
{
  const r = run('var a = f(); g();', 'g(); var a = f();');
  assert(same(r), 'limit: multiset equal');
  assert.strictEqual(r.orderedOk, true, 'limit: reordered declaration passes ordered (documented limitation)');
}

console.log('compare_builds OK');
