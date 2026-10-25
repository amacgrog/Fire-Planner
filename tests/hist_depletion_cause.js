// Bracket search (Batch 5 step 3a, spec A5.1): classifies each historical (`hist ...`) or shifted standard (`std ... shift+-N`)
// US scenario that depletes EARLIER in dump B than in dump A as a bridge drain or market variance. Plain Node, no browser.
//   node tests/snapshot.js --only US --update-nothing --dump DIR_A     (before; search off)
//   node tests/snapshot.js --only US --dump DIR_B                      (after; search on)
//   node tests/hist_depletion_cause.js DIR_A DIR_B
// Bridge drain, from B's rows (the kept plan on that path) against A's (the user's-bracket plan): a year before the youngest
// relevant partner's 59.5 has earlyPenalty > 0, some year earlier than one of those penalty years converts more than A does at the same age, and A has no
// earlyPenalty before 59.5. Anything else is market variance (printed with the ages and the first differing year). Exit 1 on any
// bridge drain. The youngest relevant partner: A's `age`, and `ageB` when the row has one.
const fs = require('fs');
const path = require('path');

const [dirA, dirB] = process.argv.slice(2);
if (!dirA || !dirB) { console.error('usage: node tests/hist_depletion_cause.js DIR_A DIR_B'); process.exit(2); }

const read = (d, f) => JSON.parse(fs.readFileSync(path.join(d, 'US', f), 'utf8'));
const never = (d) => (d == null ? Infinity : d);
const youngest = (r) => (r.ageB == null ? r.age : Math.min(r.age, r.ageB));
const relevant = (f) => /^hist /.test(f) || / shift[+-]\d+\.json$/.test(f);
const penaltyBefore = (rows) => rows.filter((r) => youngest(r) < 59.5 && (r.earlyPenalty || 0) > 0);

let earlier = 0, bridge = 0, variance = 0, total = 0;
const filesA = fs.readdirSync(path.join(dirA, 'US')).filter((f) => f.endsWith('.json') && relevant(f.replace(/_/g, ' ')));
for (const f of filesA) {
  if (!fs.existsSync(path.join(dirB, 'US', f))) { console.error(`missing in B: ${f}`); process.exitCode = 1; continue; }
  total++;
  const A = read(dirA, f), B = read(dirB, f);
  const dA = A.rest.depletedAge, dB = B.rest.depletedAge;
  if (!(never(dB) < never(dA))) continue;
  earlier++;
  const penB = penaltyBefore(B.rows), penA = penaltyBefore(A.rows);
  let isBridge = false;
  if (penB.length && !penA.length) {
    const lastPen = B.rows.indexOf(penB[penB.length - 1]); // existential: any earlier year than any penalty year
    for (let i = 0; i < lastPen && !isBridge; i++) {
      const a = A.rows.find((r) => r.age === B.rows[i].age);
      if (a && (B.rows[i].conversionAmount || 0) > (a.conversionAmount || 0)) isBridge = true;
    }
  }
  let diffYear = null;
  for (let i = 0; i < Math.min(A.rows.length, B.rows.length); i++)
    if (JSON.stringify(A.rows[i]) !== JSON.stringify(B.rows[i])) { diffYear = B.rows[i].year; break; }
  const label = isBridge ? 'bridge drain' : 'market variance';
  if (isBridge) bridge++; else variance++;
  console.log(`${label}: ${f.replace(/\.json$/, '')}: depletes ${dA == null ? 'never' : dA} -> ${dB}; first differing year ${diffYear}`);
}
console.log(`${total} hist / shifted scenarios compared: ${earlier} deplete earlier in B (${bridge} bridge drain, ${variance} market variance)`);
if (bridge) { console.error('FAIL: bridge drain(s) above: bring to the owner'); process.exitCode = 1; }
