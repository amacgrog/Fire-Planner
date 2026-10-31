// Compare two per-household dumps (tests/conversion_sizing.js --dump, tests/solver_scan.js --dump): prints the rows that differ, and exits 1
// when any row depletes or first draws on the house earlier in the second (null = never = latest), listing them; exit 0 otherwise.
//
//   node tests/compare_household_dumps.js <before.json> <after.json>
const fs = require('fs');

const [beforeFile, afterFile] = process.argv.slice(2);
if (!beforeFile || !afterFile) {
  console.error('usage: node tests/compare_household_dumps.js <before.json> <after.json>');
  process.exit(2);
}
const read = (f) => {
  const rows = JSON.parse(fs.readFileSync(f, 'utf8'));
  const m = new Map();
  for (const r of rows) {
    const k = `${r.mode}|${r.id}`;
    if (m.has(k)) throw new Error(`${f}: duplicate row ${k}`);
    m.set(k, r);
  }
  return m;
};
const A = read(beforeFile), B = read(afterFile);
const late = (d) => (d == null ? Infinity : d);
const show = (d) => (d == null ? 'never' : String(d));
const differ = [], earlier = [], missing = [];
for (const [k, a] of A) {
  const b = B.get(k);
  if (!b) { missing.push(`only in ${beforeFile}: ${k}`); continue; }
  const dep = late(b.runOut) < late(a.runOut), home = late(b.firstHomeDraw) < late(a.firstHomeDraw);
  if (a.runOut !== b.runOut || a.firstHomeDraw !== b.firstHomeDraw || a.endValue !== b.endValue)
    differ.push(`${k}: run-out ${show(a.runOut)} -> ${show(b.runOut)}, first home draw ${show(a.firstHomeDraw)} -> ${show(b.firstHomeDraw)}, end value ${a.endValue} -> ${b.endValue}`);
  if (dep || home) earlier.push(`${k}: ${dep ? `run-out ${show(a.runOut)} -> ${show(b.runOut)}` : ''}${dep && home ? '; ' : ''}${home ? `first home draw ${show(a.firstHomeDraw)} -> ${show(b.firstHomeDraw)}` : ''}`);
}
for (const k of B.keys()) if (!A.has(k)) missing.push(`only in ${afterFile}: ${k}`);
console.log(`${A.size} rows before, ${B.size} after, ${differ.length} differ`);
for (const l of differ) console.log('  ' + l);
for (const l of missing) console.log('  ' + l);
if (earlier.length) {
  console.error(`FAIL: ${earlier.length} row(s) deplete or first draw on the house earlier:`);
  for (const l of earlier) console.error('  ' + l);
  process.exit(1);
}
if (missing.length) { console.error('FAIL: the dumps do not cover the same rows'); process.exit(1); }
console.log('OK: no row depletes, or first draws on the house, earlier');
