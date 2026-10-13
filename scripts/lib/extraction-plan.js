'use strict';
// Plans which top-level units can move out of src/<country>/main.js into modules (spec section 13).
//
// planExtraction(root, { maxLayer, maxBatch, coreOnly, names }) returns { modules, stats, bindings }:
//   modules: [{ path, owner: 'shared' | 'us' | 'canada', batch, depth, ui, units: { us: [label], canada: [label] } }]
//
// A unit is movable when it is not a side-effect statement, sits in layer <= maxLayer (the longest chain of
// dependencies down to a leaf, leaf = 0; no limit by default), is not a DOM-touching unit when coreOnly is set,
// is not a declaration of a mutable binding that stays behind (see below), and every unit it depends on is
// movable too (a fixpoint).
//
// Mutable bindings (spec section 14): a `let` whose every name is written by one and the same function, and by no
// side-effect statement, is private state of that function; its declaration moves into the function's module
// (the two are movable only together). Any other mutable binding (several writers, or a statement writer) is
// reported in `bindings.<country>.needsDecision` and nothing that depends on it moves. A unit inside an @@shared region only moves when it is movable in both
// planners, depends only on shared units, and imports nothing from a country directory. Movable units are grouped
// into modules (a shared region = one module; a run of consecutive country-only units = one module); modules that
// import each other are merged, and the module graph is layered into batches by depth.
const fs = require('fs');
const path = require('path');
const { analyze } = require('../analyze-closure');

const COUNTRIES = ['us', 'canada'];

const kebab = (s) =>
  s
    .replace(/^\d+-/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

function stronglyConnected(nodeCount, edges) {
  let index = 0;
  const stack = [];
  const meta = new Map();
  const components = [];
  const visit = (v) => {
    const m = { index, low: index, onStack: true };
    index++;
    meta.set(v, m);
    stack.push(v);
    for (const w of edges[v]) {
      if (!meta.has(w)) {
        visit(w);
        m.low = Math.min(m.low, meta.get(w).low);
      } else if (meta.get(w).onStack) m.low = Math.min(m.low, meta.get(w).index);
    }
    if (m.low === m.index) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        meta.get(w).onStack = false;
        comp.push(w);
      } while (w !== v);
      components.push(comp);
    }
  };
  for (let v = 0; v < nodeCount; v++) if (!meta.has(v)) visit(v);
  return components; // dependencies first
}

function loadCountry(root, country) {
  const code = fs.readFileSync(path.join(root, 'src', country, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const model = analyze(code);
  const byLabel = new Map(model.units.map((u) => [u.label, u]));
  const compOf = new Map();
  model.order.forEach((comp, i) => comp.forEach((l) => compOf.set(l, i)));
  const depthOfComp = new Map();
  model.order.forEach((comp, i) => {
    let d = 0;
    for (const l of comp) for (const dep of byLabel.get(l).deps) {
      const j = compOf.get(dep);
      if (j !== i) d = Math.max(d, depthOfComp.get(j) + 1);
    }
    depthOfComp.set(i, d);
  });
  // mutable bindings, grouped by the unit that declares them
  const bindings = new Map();
  for (const m of model.mutables) {
    if (!bindings.has(m.declaredIn)) bindings.set(m.declaredIn, { declaredIn: m.declaredIn, names: [], writerSets: [] });
    const b = bindings.get(m.declaredIn);
    b.names.push(m.name);
    b.writerSets.push([...m.writers].sort());
  }
  const colocated = new Map(); // declaring unit -> its single writer function
  const needsDecision = [];
  for (const b of bindings.values()) {
    const first = b.writerSets[0];
    const same = b.writerSets.every((w) => w.length === first.length && w.every((x, i) => x === first[i]));
    const writer = same && first.length === 1 && byLabel.get(first[0]).kind !== 'statement' ? first[0] : null;
    if (writer) colocated.set(b.declaredIn, writer);
    else needsDecision.push({ names: b.names, declaredIn: b.declaredIn, writers: [...new Set(b.writerSets.flat())].sort() });
  }
  const blockedBindings = new Set(needsDecision.map((b) => b.declaredIn));
  const importSource = new Map(model.imports.map((i) => [i.local, path.resolve(root, 'src', country, i.source)]));
  const countryDir = path.join(root, 'src', country) + path.sep;
  return {
    model,
    byLabel,
    depth: (label) => depthOfComp.get(compOf.get(label)),
    blockedBindings,
    importSource,
    colocated,
    needsDecision,
    // country code a unit reaches through an import (a module an earlier stage created), other than the allowed seam names
    importsCountryCode: (u, allowed) => u.importUses.some((n) => !allowed.has(n) && (importSource.get(n) || '').startsWith(countryDir)),
    // a unit that imports a ui/ module is ui code, whatever its own text does (the analyzer sees only main.js)
    // (tested on the path under src/, so a checkout under a directory named ui does not count)
    importsUi: (u) =>
      u.importUses.some((n) => {
        const abs = importSource.get(n);
        return !!abs && path.relative(path.join(root, 'src'), abs).split(/[\\/]/).includes('ui');
      }),
  };
}

function existingModules(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  walk(path.join(root, 'src'));
  return out;
}

function planExtraction(root, { maxLayer = Infinity, maxBatch = 2, coreOnly = false, seam = [], names = {} } = {}) {
  const seamNames = new Set(seam);
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const owner = (c, u) => (u.regionKind === 'shared' ? 'shared' : c);
  const uiUnit = (c, u) => u.ui || info[c].importsUi(u);
  const isUi = (c, u) =>
    owner(c, u) === 'shared' ? COUNTRIES.some((cc) => uiUnit(cc, info[cc].byLabel.get(u.label) || u)) : uiUnit(c, u);

  for (const name of seamNames) {
    for (const c of COUNTRIES) {
      const u = info[c].byLabel.get(name);
      const imported = (info[c].importSource.get(name) || '').startsWith(path.join(root, 'src', c) + path.sep);
      const hasFacade = fs.existsSync(path.join(root, 'src', c, 'core', `seam-${name}.js`)); // exported by an earlier run
      if ((!u || owner(c, u) === 'shared') && !imported && !hasFacade) throw new Error(`seam name ${name} must be a country unit or a country import in ${c}/main.js`);
    }
  }
  const movable = Object.fromEntries(COUNTRIES.map((c) => [c, new Set()]));
  const candidates = {};
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) {
      if (u.kind === 'statement') continue;
      if (info[c].depth(u.label) > maxLayer) continue;
      if (info[c].blockedBindings.has(u.label)) continue;
      if (coreOnly && uiUnit(c, u)) continue;
      movable[c].add(u.label);
    }
    candidates[c] = movable[c].size;
  }
  // a colocated declaration and its writer function are partners: each is movable only with the other
  const partnerOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  for (const c of COUNTRIES) {
    for (const [declarer, writer] of info[c].colocated) {
      partnerOf[c].set(declarer, writer);
      partnerOf[c].set(writer, declarer);
    }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      for (const label of [...movable[c]]) {
        const u = info[c].byLabel.get(label);
        let ok = u.deps.every((d) => movable[c].has(d));
        const partner = partnerOf[c].get(label);
        if (ok && partner) ok = movable[c].has(partner) && owner(c, info[c].byLabel.get(partner)) === owner(c, u);
        if (ok && owner(c, u) === 'shared') {
          ok =
            u.deps.every((d) => owner(c, info[c].byLabel.get(d)) === 'shared' || seamNames.has(d)) &&
            !info[c].importsCountryCode(u, seamNames) &&
            COUNTRIES.every((cc) => movable[cc].has(label));
        }
        if (!ok) {
          movable[c].delete(label);
          changed = true;
        }
      }
    }
  }

  // A data block (// NAME:begin ... // NAME:end, read by scripts/gen-*-rules.js) moves whole or not at all.
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      const blocks = new Map();
      for (const u of info[c].model.units) {
        if (u.regionKind !== 'data') continue;
        if (!blocks.has(u.region)) blocks.set(u.region, []);
        blocks.get(u.region).push(u.label);
      }
      for (const labels of blocks.values()) {
        if (labels.some((l) => !movable[c].has(l)) && labels.some((l) => movable[c].has(l))) {
          labels.forEach((l) => movable[c].delete(l));
          changed = true;
        }
      }
    }
  }
  const dataSideUi = new Map(); // "country:block" -> true when any unit of the block is ui
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) if (u.regionKind === 'data' && uiUnit(c, u)) dataSideUi.set(`${c}:${u.region}`, true);
  }

  // Group into module nodes, then into the module graph. A country run or a shared region can pull units of different
  // layers into one node and so close a cycle between a shared and a country module; the units of such nodes get
  // nodes of their own and the graph is built again (what remains cyclic is a real cycle between units).
  const fine = new Set();
  const build = () => {
  const nodes = []; // { owner, region?, units: { us: [], canada: [] } }
  const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const sharedByKey = new Map();
  let runSeq = 0;
  for (const c of COUNTRIES) {
    const units = [...info[c].model.units].sort((a, b) => a.startLine - b.startLine);
    let run = null;
    for (const u of units) {
      const isMovable = movable[c].has(u.label);
      const side = (u.regionKind === 'data' ? dataSideUi.get(`${c}:${u.region}`) : isUi(c, u)) ? 'ui' : 'core';
      if (isMovable && owner(c, u) === 'shared') {
        const key = fine.has(u.label) ? `${u.region}|${side}|${u.label}` : `${u.region}|${side}`;
        let node = sharedByKey.get(key);
        if (!node) {
          node = { owner: 'shared', region: u.region, group: `${u.region}|${side}`, units: { us: [], canada: [] } };
          sharedByKey.set(key, node);
          nodes.push(node);
        }
        node.units[c].push(u.label);
        nodeOf[c].set(u.label, node);
      } else if (isMovable && fine.has(u.label)) {
        if (!run) run = { id: runSeq++, core: null, ui: null };
        const node = { owner: c, group: `${c}#${run.id}|${side}`, units: { us: [], canada: [] } };
        node.units[c].push(u.label);
        nodes.push(node);
        nodeOf[c].set(u.label, node);
      } else if (isMovable) {
        if (!run) run = { id: runSeq++, core: null, ui: null };
        if (!run[side]) {
          run[side] = { owner: c, group: `${c}#${run.id}|${side}`, units: { us: [], canada: [] } };
          nodes.push(run[side]);
        }
        run[side].units[c].push(u.label);
        nodeOf[c].set(u.label, run[side]);
      } else if (u.kind !== 'statement') {
        run = null; // a unit that stays behind starts a new topic; side-effect statements stay but do not
      }
    }
  }

  return { nodes, nodeOf };
  };
  // The module graph of a set of nodes: an edge for every dependency between two nodes.
  const graphOf = ({ nodes, nodeOf }) => {
  const index = new Map(nodes.map((n, i) => [n, i]));
  const edges = nodes.map(() => new Set());
  for (const n of nodes) {
    for (const c of COUNTRIES) {
      for (const label of n.units[c]) {
        for (const d of info[c].byLabel.get(label).deps) {
          const target = nodeOf[c].get(d);
          if (target && target !== n) edges[index.get(n)].add(index.get(target));
        }
      }
    }
  }
  for (const c of COUNTRIES) {
    for (const [declarer, writer] of info[c].colocated) {
      const a = nodeOf[c].get(declarer);
      const b = nodeOf[c].get(writer);
      if (a && b && a !== b) edges[index.get(a)].add(index.get(b));
    }
  }
  return { nodes, nodeOf, edges, index, comps: stronglyConnected(nodes.length, edges) };
  };
  let built = graphOf(build());
  for (;;) {
    const bad = built.comps.find((comp) => new Set(comp.map((v) => built.nodes[v].owner)).size > 1);
    if (!bad) break;
    const before = fine.size;
    for (const v of bad) for (const c of COUNTRIES) built.nodes[v].units[c].forEach((l) => fine.add(l));
    if (fine.size === before) throw new Error(`module cycle across owners between units: ${bad.map((v) => built.nodes[v].units.us.concat(built.nodes[v].units.canada).slice(0, 4).join(',')).join(' ; ')}`);
    built = graphOf(build());
  }
  // Fewer, larger modules: nodes that came from one region or one run are joined again when that closes no new cycle.
  const cyclic = (b) => b.comps.filter((comp) => comp.length > 1);
  const crossOwner = (b) => cyclic(b).some((comp) => new Set(comp.map((v) => b.nodes[v].owner)).size > 1);
  {
    const groups = new Map();
    for (const n of built.nodes) {
      if (!groups.has(n.group)) groups.set(n.group, []);
      groups.get(n.group).push(n);
    }
    for (const list of groups.values()) {
      const keep = list[0];
      for (const n of list.slice(1)) {
        const saved = { us: [...keep.units.us], canada: [...keep.units.canada] };
        COUNTRIES.forEach((c) => keep.units[c].push(...n.units[c]));
        const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map([...built.nodeOf[c]].map(([l, x]) => [l, x === n ? keep : x]))]));
        const trial = graphOf({ nodes: built.nodes.filter((x) => x !== n), nodeOf });
        if (!crossOwner(trial) && cyclic(trial).length <= cyclic(built).length) built = trial;
        else COUNTRIES.forEach((c) => (keep.units[c] = saved[c]));
      }
    }
  }
  const { nodes, nodeOf, edges, index, comps } = built;
  const compId = new Map();
  comps.forEach((comp, i) => comp.forEach((v) => compId.set(v, i)));
  const merged = comps.map((comp) => {
    const members = comp.map((v) => nodes[v]);
    const owners = new Set(members.map((m) => m.owner));
    if (owners.size > 1) throw new Error('module cycle across owners');
    const unitsOf = (c) =>
      members
        .flatMap((m) => m.units[c])
        .sort((a, b) => info[c].byLabel.get(a).startLine - info[c].byLabel.get(b).startLine);
    return { owner: members[0].owner, regions: members.map((m) => m.region).filter(Boolean), units: { us: unitsOf('us'), canada: unitsOf('canada') } };
  });
  const mergedEdges = merged.map(() => new Set());
  edges.forEach((targets, v) => targets.forEach((w) => { if (compId.get(v) !== compId.get(w)) mergedEdges[compId.get(v)].add(compId.get(w)); }));

  // Depth of each merged module (comps are already dependencies-first).
  const depth = merged.map(() => 0);
  merged.forEach((m, i) => mergedEdges[i].forEach((w) => { depth[i] = Math.max(depth[i], depth[w] + 1); }));

  // Names and paths.
  const used = new Set(existingModules(root)); // a new module never takes the path of one an earlier stage made
  const modules = merged.map((m, i) => {
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    const ui = countries.some((c) => m.units[c].some((l) => uiUnit(c, info[c].byLabel.get(l))));
    const first = m.owner === 'shared' ? null : info[m.owner].byLabel.get(m.units[m.owner][0]);
    const side = ui ? 'ui' : 'core';
    const base =
      m.owner === 'shared'
        ? names[`shared:${m.regions[0]}:${side}`] || names[`shared:${m.regions[0]}`] || kebab(m.regions[0])
        : names[`${m.owner}:${m.units[m.owner][0]}`] || kebab(first.names[0] || m.units[m.owner][0]);
    const dir = m.owner === 'shared' ? 'src/shared' : `src/${m.owner}`;
    let p = `${dir}/${ui ? 'ui' : 'core'}/${base}.js`;
    for (let n = 2; used.has(p); n++) p = `${dir}/${ui ? 'ui' : 'core'}/${base}-${n}.js`;
    used.add(p);
    return { path: p, owner: m.owner, depth: depth[i], batch: Math.min(depth[i], maxBatch), ui, regions: m.regions, units: m.units };
  });
  modules.sort((a, b) => a.batch - b.batch || a.depth - b.depth || a.path.localeCompare(b.path));

  const total = (c) => info[c].model.units.length;
  const moved = (c) => modules.filter((m) => m.owner === 'shared' || m.owner === c).reduce((s, m) => s + m.units[c].length, 0);
  return {
    modules,
    seam: [...seamNames],
    bindings: Object.fromEntries(
      COUNTRIES.map((c) => [
        c,
        {
          colocated: [...info[c].colocated].map(([declaredIn, writer]) => ({ declaredIn, writer })),
          needsDecision: info[c].needsDecision,
        },
      ]),
    ),
    stats: Object.fromEntries(COUNTRIES.map((c) => [c, { units: total(c), candidates: candidates[c], movable: moved(c) }])),
  };
}

module.exports = { planExtraction, kebab };
