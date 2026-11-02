// Estimate sites guard (Batch 5 follow-ups S1, Task 2f): every place the US year loop saves, restores or re-seeds its MAGI estimates
// handles the conversion ceiling's IRMAA holds (irmaaHold / irmaaHoldA / irmaaHoldB), which go everywhere estTrad goes.
// Reads src/us/core/projection/run-projection.js (an espree AST, comments kept) and checks:
//  (a) every `estTrad = ...` assignment (the sites: not the declaration, not the update's `estTrad = next;`) sits in a block that
//      ends in `continue;` and assigns irmaaHold, irmaaHoldA and irmaaHoldB, or carries the comment `// hold: kept`;
//  (b) every object literal with `estTrad` as a property key lists irmaaHold, irmaaHoldA and irmaaHoldB as keys too;
//  (c) no other assignment form to estTrad (`+=` and the like, destructuring);
//  (d) every block with `replaying = true;` restores estTrad and sets replayRec, the block with `forcedPass = true;` restores
//      estTrad and sets forcedPick, and the block with `capPass = true;` (the cap pick, S2 Task 4b) restores estTrad and sets
//      capPick (so a replay that restores through a helper fails);
//  (e) the counts are the site table's (docs/architecture/magi-iteration.md, "The IRMAA tier holds"): 13 sites, 4 literals,
//      7 replay blocks, 1 declaration, 2 updates. A site added later fails here until the table and this guard change together.
//
//   node tests/estimate_sites.js [file]   (the file defaults to run-projection.js; the mutation self-test passes a scratch copy)
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const FILE = path.resolve(process.argv[2] || path.join(__dirname, '../src/us/core/projection/run-projection.js'));
const EXPECT = { sites: 13, literals: 4, replayBlocks: 7, declarations: 1, updates: 2 };
const HOLDS = ['irmaaHold', 'irmaaHoldA', 'irmaaHoldB'];

const code = fs.readFileSync(FILE, 'utf8');
const ast = espree.parse(code, { ecmaVersion: 2022, sourceType: 'module', range: true, loc: true, comment: true });
const comments = ast.comments;
const failures = [];

// Every node with its parent chain (a plain walk over the child keys).
const nodes = [];
(function walk(node, parent) {
  if (!node || typeof node.type !== 'string') return;
  node.parent = parent;
  nodes.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'parent' || k === 'loc' || k === 'range') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, node);
    else if (v && typeof v.type === 'string') walk(v, node);
  }
})(ast, null);

const within = (inner, outer) => inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
const blockOf = (n) => {
  let p = n.parent;
  while (p && p.type !== 'BlockStatement') p = p.parent;
  return p;
};
const lineOf = (n) => n.loc.start.line;
const isAssign = (n, name, op = '=') => n.type === 'AssignmentExpression' && n.operator === op && n.left.type === 'Identifier' && n.left.name === name;
const assignsIn = (block, name) => nodes.some((n) => isAssign(n, name) && within(n, block));
const patternNames = (p, out) => {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ArrayPattern') p.elements.forEach((e) => patternNames(e, out));
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  return out;
};

let declarations = 0,
  updates = 0,
  sites = 0,
  literals = 0,
  replayBlocks = 0;
for (const n of nodes) {
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'estTrad') declarations++;
  if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.left.name === 'estTrad' && n.operator !== '=')
    failures.push(`(c) line ${lineOf(n)}: estTrad ${n.operator} (only plain assignments are sites)`);
  if (n.type === 'AssignmentExpression' && n.left.type !== 'Identifier' && patternNames(n.left, []).includes('estTrad'))
    failures.push(`(c) line ${lineOf(n)}: a destructuring assignment to estTrad`);
  if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier' && n.argument.name === 'estTrad')
    failures.push(`(c) line ${lineOf(n)}: estTrad${n.operator}`);
  if (isAssign(n, 'estTrad')) {
    if (n.right.type === 'Identifier' && n.right.name === 'next') {
      updates++;
      continue;
    }
    sites++;
    const block = blockOf(n);
    const cont = block && nodes.some((c) => c.type === 'ContinueStatement' && within(c, block) && c.range[0] > n.range[0]);
    if (!cont) failures.push(`(a) line ${lineOf(n)}: the block of \`estTrad = ...\` does not end in continue;`);
    const kept = block && comments.some((c) => c.type === 'Line' && /^\s*hold: kept\b/.test(c.value) && c.range[0] >= block.range[0] && c.range[1] <= block.range[1]);
    const missing = block ? HOLDS.filter((h) => !assignsIn(block, h)) : HOLDS;
    if (!kept && missing.length) failures.push(`(a) line ${lineOf(n)}: \`estTrad = ...\` with no ${missing.join(' / ')} assignment and no // hold: kept`);
  }
  if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && n.key.name === 'estTrad' && n.parent.type === 'ObjectExpression') {
    literals++;
    const keys = n.parent.properties.filter((p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier').map((p) => p.key.name);
    const missing = HOLDS.filter((h) => !keys.includes(h));
    if (missing.length) failures.push(`(b) line ${lineOf(n)}: an object literal with estTrad lists no ${missing.join(' / ')}`);
  }
  const replay = n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier' && n.right.type === 'Literal' && n.right.value === true && (n.left.name === 'replaying' || n.left.name === 'forcedPass' || n.left.name === 'capPass');
  if (replay) {
    replayBlocks++;
    const block = blockOf(n),
      rec = n.left.name === 'replaying' ? 'replayRec' : n.left.name === 'forcedPass' ? 'forcedPick' : 'capPick';
    if (!block || !assignsIn(block, 'estTrad')) failures.push(`(d) line ${lineOf(n)}: the block of \`${n.left.name} = true\` restores no estTrad`);
    if (!block || !assignsIn(block, rec)) failures.push(`(d) line ${lineOf(n)}: the block of \`${n.left.name} = true\` sets no ${rec}`);
  }
}

const got = { sites, literals, replayBlocks, declarations, updates };
for (const k of Object.keys(EXPECT))
  if (got[k] !== EXPECT[k]) failures.push(`(e) ${k}: ${got[k]}, the site table has ${EXPECT[k]} (update the table in docs/architecture/magi-iteration.md and this guard together)`);
console.log(`estimate_sites: ${sites} sites, ${literals} record literals, ${replayBlocks} replay blocks, ${declarations} declaration, ${updates} updates (${path.relative(process.cwd(), FILE)})`);
if (failures.length) {
  console.error('FAIL:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('OK: every estimate site handles the IRMAA holds');
