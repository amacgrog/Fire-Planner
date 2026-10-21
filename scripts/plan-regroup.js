#!/usr/bin/env node
'use strict';
// Writes the core regroup maps (docs/superpowers/plans/2026-10-21-core-regroup.md) from a topics file.
//   node scripts/plan-regroup.js --topics scripts/extractions/core-regroup-topics.json --out scripts/extractions
// The topics file says, per owner (us, canada, shared), which topic file each core/ module goes to ("files": module base
// name -> "<folder>/<file>") and which top-level names go elsewhere ("names": "<folder>/<file>" -> [names]). The script
// reads every top-level declaration of src/<owner>/core/*.js, resolves its references by name (own owner first, then shared;
// shared names reach both countries, as the seam facades do), and refuses (exit 1) when the topic files would import each
// other in a loop. It then orders the operations so that every intermediate tree is loop-free: one move per declaration
// that leaves its module, chosen greedily among those that keep every country's file graph acyclic, and one rename or
// merge per topic file once the modules headed there hold nothing else. A declaration that shares its statement with
// other names, or a data-block declaration that is not alone in its block, cannot move: its module goes, whole, to that
// declaration's topic. The operations are split into batches by owner and kind (the moves of one owner, then the renames
// and merges of one owner) and written as core-regroup-<n>-<owner>-<split|folders>.json. Reference resolution is by
// name, so it over-approximates dependencies; the regroup tool's own guards are the real check (run each map with
// --dry-run).
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const USAGE = 'usage: node scripts/plan-regroup.js --topics <file> --out <dir>';
const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--topics', '--out'].includes(args[i]) || !args[i + 1]) {
    console.error(USAGE);
    process.exit(2);
  }
  opt[args[i].slice(2)] = args[i + 1];
}
if (!opt.topics || !opt.out) {
  console.error(USAGE);
  process.exit(2);
}
const root = path.join(__dirname, '..');
const topics = JSON.parse(fs.readFileSync(opt.topics, 'utf8'));
const OWNERS = ['us', 'canada', 'shared'];
const DATA = /^\s*\/\/ ([A-Z][A-Z_]*):(begin|end)\s*$/;

function walk(node, f) {
  if (!node || typeof node.type !== 'string') return;
  f(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, f));
    else if (v && typeof v.type === 'string') walk(v, f);
  }
}

// ---- the units
const units = new Map(); // `${owner}:${name}` -> unit
const fileUnits = new Map(); // rel -> [unit]
const problems = [];
for (const owner of OWNERS) {
  const dir = `src/${owner}/core`;
  for (const f of fs.readdirSync(path.join(root, dir)).sort()) {
    if (!f.endsWith('.js') || f.startsWith('seam-')) continue;
    const rel = `${dir}/${f}`;
    const base = f.slice(0, -3);
    const src = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
    const blocks = [];
    let open = null;
    src.split('\n').forEach((l, i) => {
      const m = DATA.exec(l);
      if (!m) return;
      if (m[2] === 'begin' && open === null) open = i + 1;
      else if (m[2] === 'end' && open !== null) {
        blocks.push([open, i + 1]);
        open = null;
      } else problems.push(`${rel}:${i + 1}: data-block markers are not paired (${m[1]})`);
    });
    if (open !== null) problems.push(`${rel}:${open}: a data block is not closed`);
    const ast = espree.parse(src, { ecmaVersion: 2022, sourceType: 'module', loc: true });
    const list = [];
    for (let st of ast.body) {
      if (st.type === 'ImportDeclaration') {
        // names are resolved by their declared name, so a renamed import would be missed
        for (const s of st.specifiers) {
          if (s.type !== 'ImportSpecifier' || s.imported.name !== s.local.name) problems.push(`${rel}:${st.loc.start.line}: an import that renames or is not named (${s.local.name}); not supported`);
        }
        continue;
      }
      if (st.type === 'ExportNamedDeclaration') {
        if (!st.declaration) {
          problems.push(`${rel}:${st.loc.start.line}: an export list or re-export; not supported`);
          continue;
        }
        st = st.declaration;
      }
      let names;
      if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') names = [st.id.name];
      else if (st.type === 'VariableDeclaration') names = st.declarations.map((d) => d.id.name);
      else {
        problems.push(`${rel}:${st.loc.start.line}: a top-level statement that is not a declaration`);
        continue;
      }
      const blk = blocks.find(([b, e]) => b < st.loc.start.line && st.loc.end.line < e);
      const blockShared = !!blk && ast.body.filter((x) => x.loc.start.line > blk[0] && x.loc.end.line < blk[1]).length > 1;
      const refs = new Set();
      const writes = new Set();
      walk(st, (n) => {
        if (n.type === 'Identifier') refs.add(n.name);
        if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') writes.add(n.left.name);
        if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier') writes.add(n.argument.name);
      });
      for (const name of names) {
        const u = { owner, rel, base, name, kind: st.kind, fixed: names.length > 1 || blockShared, refs, writes, writers: [], deps: [] };
        if (units.has(`${owner}:${name}`)) problems.push(`${rel}: ${name} is declared twice in ${owner}`);
        units.set(`${owner}:${name}`, u);
        list.push(u);
      }
    }
    // a let or var assigned by another declaration of its module moves only with its writers: keep it in place
    // (an assignment to a local of the same name counts too: an over-approximation)
    for (const u of list) {
      if (u.kind !== 'let' && u.kind !== 'var') continue;
      u.writers = list.filter((x) => x !== u && x.writes.has(u.name));
      if (u.writers.length) u.fixed = true;
    }
    if (!list.length) problems.push(`${rel}: a module with no top-level declaration`);
    fileUnits.set(rel, list);
  }
}
const pathOf = (owner, t) => `src/${owner}/core/${t}.js`;
for (const u of units.values()) {
  const sec = topics[u.owner];
  let t = Object.entries(sec.names || {}).find(([, names]) => names.includes(u.name));
  t = t ? t[0] : (sec.files || {})[u.base];
  if (!t) problems.push(`${u.rel}: no topic for ${u.base} (${u.name})`);
  u.target = t ? pathOf(u.owner, t) : null;
}
for (const u of units.values()) {
  for (const w of u.writers) if (w.target !== u.target) problems.push(`${u.rel}: ${w.name} writes ${u.name} but goes to ${w.target}, not ${u.target}`);
}
for (const sec of Object.values(topics)) {
  for (const names of Object.values(sec.names || {})) for (const n of names) if (![...units.values()].some((u) => u.name === n)) problems.push(`names: ${n} is not a top-level declaration`);
}
for (const u of units.values()) {
  for (const r of u.refs) {
    if (r === u.name) continue;
    const order = u.owner === 'shared' ? ['shared', 'us', 'canada'] : [u.owner, 'shared'];
    for (const o of order) {
      const d = units.get(`${o}:${r}`);
      if (!d) continue;
      u.deps.push(d);
      if (o === u.owner) break; // a shared name reaches both countries' declarations, as the seam facades do
    }
  }
}
// where each module's fixed declarations go decides where the module itself goes
const fileTarget = new Map();
for (const [rel, list] of fileUnits) {
  const fixed = new Set(list.filter((u) => u.fixed).map((u) => u.target));
  if (fixed.size > 1) problems.push(`${rel}: declarations that cannot move are headed for ${[...fixed].join(' and ')}`);
  const owner = rel.split('/')[1];
  fileTarget.set(rel, fixed.size ? [...fixed][0] : pathOf(owner, topics[owner].files[list[0] ? list[0].base : path.basename(rel, '.js')]));
}
// the topic files must not import each other in a loop
const cur = new Map([...units.values()].map((u) => [u, u.rel]));
function loop(where) {
  for (const c of ['us', 'canada']) {
    const g = new Map();
    for (const u of units.values()) {
      if (u.owner !== c && u.owner !== 'shared') continue;
      for (const d of u.deps) {
        if (d.owner !== c && d.owner !== 'shared') continue;
        const a = where(u);
        const b = where(d);
        if (a === b) continue;
        if (!g.has(a)) g.set(a, new Set());
        g.get(a).add(b);
      }
    }
    const state = new Map();
    let found = null;
    const dfs = (v, stack) => {
      state.set(v, 1);
      stack.push(v);
      for (const w of g.get(v) || []) {
        if (found) return;
        if (state.get(w) === 1) found = [...stack.slice(stack.indexOf(w)), w];
        else if (!state.get(w)) dfs(w, stack);
      }
      stack.pop();
      state.set(v, 2);
    };
    for (const v of g.keys()) if (!state.get(v) && !found) dfs(v, []);
    if (found) return `${c}: ${found.join(' -> ')}`;
  }
  return null;
}
if (!problems.length) {
  const end = loop((u) => u.target);
  if (end) problems.push(`the topic files import each other in a loop (${end})`);
}
if (problems.length) {
  problems.forEach((p) => console.error(p));
  process.exit(1);
}
// ---- the operations
const ops = [];
let pending = [...units.values()].filter((u) => u.target !== fileTarget.get(u.rel));
const merged = new Set();
for (;;) {
  let did = false;
  for (const u of pending) {
    const was = cur.get(u);
    cur.set(u, u.target);
    if (!loop((x) => cur.get(x))) {
      ops.push({ move: u.name, from: was, to: u.target });
      pending = pending.filter((x) => x !== u);
      did = true;
      break;
    }
    cur.set(u, was);
  }
  if (did) continue;
  const groups = new Map();
  for (const [f, t] of fileTarget) {
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(f);
  }
  for (const [t, all] of groups) {
    // a module that moves emptied is deleted by the regroup tool: it takes no part in a merge
    for (const f of all) if (f !== t && ![...units.values()].some((u) => cur.get(u) === f)) fileTarget.delete(f);
    const files = all.filter((f) => f !== t && fileTarget.has(f));
    if (merged.has(t) || !files.length) continue;
    if (!files.every((f) => [...units.values()].every((u) => cur.get(u) !== f || u.target === t))) continue;
    const saved = new Map(cur);
    for (const u of units.values()) if (files.includes(cur.get(u))) cur.set(u, t);
    if (loop((x) => cur.get(x))) {
      for (const [k, v] of saved) cur.set(k, v);
      continue;
    }
    const exists = [...saved.values()].includes(t);
    if (exists) ops.push({ merge: [t, ...files], to: t });
    else if (files.length === 1) ops.push({ rename: files[0], to: t });
    else ops.push({ merge: files, to: t });
    for (const f of files) fileTarget.delete(f);
    fileTarget.set(t, t);
    merged.add(t);
    did = true;
    break;
  }
  if (!did) break;
}
const left = [...fileTarget].filter(([f, t]) => f !== t);
if (pending.length || left.length) {
  console.error(`no loop-free order: ${pending.length} moves and ${left.length} modules left (${[...pending.map((u) => u.name), ...left.map(([f]) => f)].slice(0, 10).join(', ')})`);
  process.exit(1);
}
// ---- batches: consecutive operations of one owner and one kind
const batches = [];
for (const o of ops) {
  const owner = (o.from || o.rename || o.to).split('/')[1];
  const kind = o.move ? 'split' : 'folders';
  const last = batches[batches.length - 1];
  if (last && last.owner === owner && last.kind === kind) last.ops.push(o);
  else batches.push({ owner, kind, ops: [o] });
}
for (const f of fs.readdirSync(opt.out)) if (/^core-regroup-\d+-.*\.json$/.test(f)) fs.rmSync(path.join(opt.out, f));
batches.forEach((b, i) => {
  const name = `core-regroup-${i + 1}-${b.owner}-${b.kind}.json`;
  fs.writeFileSync(path.join(opt.out, name), JSON.stringify({ operations: b.ops }, null, 2) + '\n');
  console.log(`${name}: ${b.ops.length} operations`);
});
