// Engine purity guard (stateless-engine design sections 2 and 5): the engine modules (the core/ closure of each country's
// run-projection.js, plus core/analysis and core/optimizer and their closures) may not reach the store modules, and every
// module-level mutable binding in them is registered in tests/engine-purity.json. The stillReaching lists only shrink.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const { buildGraph } = require('../scripts/lib/module-graph');

const KINDS = new Set(['memo', 'scratch', 'constant', 'counter', 'cache']);

function engineModules(graph, country, adapters, STORE) {
  const isCore = (f) => /^src\/(shared|[a-z]+)\/core\//.test(f);
  const seeds = graph.files.filter((f) => f === `src/${country}/core/projection/run-projection.js` ||
    /^src\/[a-z]+\/core\/(analysis|optimizer)\//.test(f));
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const t of graph.edges.get(f) || []) if (isCore(t) && !seen.has(t)) stack.push(t);
  }
  const skip = new Set([...STORE, ...adapters]);
  return [...seen].filter((f) => !skip.has(f) && !graph.facades.has(f)).sort();
}

function reachesStore(graph, f, STORE) {
  const seen = new Set();
  const stack = [f];
  while (stack.length) {
    const g = stack.pop();
    for (const t of graph.edges.get(g) || []) {
      if (STORE.includes(t)) return true;
      if (!seen.has(t)) { seen.add(t); stack.push(t); }
    }
  }
  return false;
}

// Top-level bindings that are mutable or hold a mutable object: let/var, or const with an object/array literal, new, or a call.
function mutableBindings(code) {
  const ast = espree.parse(code, { ecmaVersion: 2022, sourceType: 'module', loc: true });
  const out = [];
  const names = (p, acc) => {
    if (p.type === 'Identifier') acc.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => names(q.value || q.argument, acc));
    else if (p.type === 'ArrayPattern') p.elements.forEach((q) => q && names(q, acc));
    else if (p.type === 'AssignmentPattern') names(p.left, acc);
    else if (p.type === 'RestElement') names(p.argument, acc);
    return acc;
  };
  for (let st of ast.body) {
    if ((st.type === 'ExportNamedDeclaration') && st.declaration) st = st.declaration;
    if (st.type !== 'VariableDeclaration') continue;
    for (const d of st.declarations) {
      let flag = st.kind !== 'const';
      if (!flag && d.init) {
        let e = d.init;
        while (e.type === 'TSAsExpression' || e.type === 'ParenthesizedExpression') e = e.expression;
        flag = e.type === 'ObjectExpression' || e.type === 'ArrayExpression' || e.type === 'NewExpression' || e.type === 'CallExpression';
      }
      if (flag) for (const n of names(d.id, [])) out.push(n);
    }
  }
  return out;
}

function check(root, cfg) {
  const STORE = cfg.storeModules;
  if (!Array.isArray(STORE) || !STORE.length) throw new Error('tests/engine-purity.json: storeModules is missing or empty');
  const problems = [];
  const adapters = cfg.adapters || [];
  const engineAll = new Set();
  const counts = {};
  for (const country of ['us', 'canada']) {
    const graph = buildGraph(root, country);
    const eng = engineModules(graph, country, adapters, STORE);
    eng.forEach((f) => engineAll.add(f));
    const reaching = eng.filter((f) => reachesStore(graph, f, STORE));
    counts[country] = { engine: eng.length, reaching: reaching.length };
    const listed = new Set((cfg.stillReaching && cfg.stillReaching[country]) || []);
    for (const f of reaching) if (!listed.has(f)) problems.push(`${country}: now reaches the store: ${f} (importers: ${[...graph.edges.keys()].filter((g) => eng.includes(g) && graph.edges.get(g).has(f)).join(', ') || 'none'})`);
    for (const f of listed) if (!reaching.includes(f)) problems.push(`${country}: remove ${f} from stillReaching (it no longer reaches the store, or is not an engine module)`);
    for (const f of eng) {
      const reg = (cfg.mutables && cfg.mutables[f]) || {};
      const found = mutableBindings(fs.readFileSync(path.join(root, f), 'utf8'));
      for (const n of found) if (!reg[n]) problems.push(`${country}: unregistered module-level mutable: ${f} ${n}`);
      for (const n of Object.keys(reg)) if (!found.includes(n)) problems.push(`${country}: registered mutable no longer exists: ${f} ${n}`);
    }
  }
  for (const [f, reg] of Object.entries(cfg.mutables || {})) {
    if (!engineAll.has(f)) problems.push(`not an engine module: ${f}`);
    for (const [n, k] of Object.entries(reg)) if (!KINDS.has(k)) problems.push(`${f} ${n}: unknown kind '${k}'`);
  }
  return { problems, counts };
}

module.exports = { check, engineModules, mutableBindings };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-purity.json'), 'utf8'));
  const { problems, counts } = check(root, cfg);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const k = Object.values(cfg.mutables).reduce((n, r) => n + Object.keys(r).length, 0);
  console.log(`engine purity: ${counts.us.reaching} modules still reach the store (us), ${counts.canada.reaching} (canada); ${k} registered mutables`);
}
