'use strict';
// Plans which top-level units can move out of src/<country>/main.js into modules (spec section 13).
//
// planExtraction(root, { maxLayer, names }) returns { modules, stats }:
//   modules: [{ path, owner: 'shared' | 'us' | 'canada', batch, depth, ui, units: { us: [label], canada: [label] } }]
//
// A unit is movable when it is not a side-effect statement, sits in layer <= maxLayer (the longest chain of
// dependencies down to a leaf, leaf = 0), does not declare a binding that is assigned elsewhere, and every unit it
// depends on is movable too (a fixpoint). A unit inside an @@shared region only moves when it is movable in both
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
  const mutableDeclarers = new Set(model.mutables.map((m) => m.declaredIn));
  const importSource = new Map(model.imports.map((i) => [i.local, path.resolve(root, 'src', country, i.source)]));
  const countryDir = path.join(root, 'src', country) + path.sep;
  return {
    model,
    byLabel,
    depth: (label) => depthOfComp.get(compOf.get(label)),
    mutableDeclarers,
    importsCountryCode: (u) => u.importUses.some((n) => (importSource.get(n) || '').startsWith(countryDir)),
  };
}

function planExtraction(root, { maxLayer = 3, names = {} } = {}) {
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const owner = (c, u) => (u.regionKind === 'shared' ? 'shared' : c);
  const isUi = (c, u) =>
    owner(c, u) === 'shared' ? COUNTRIES.some((cc) => info[cc].byLabel.get(u.label)?.ui) : u.ui;

  const movable = Object.fromEntries(COUNTRIES.map((c) => [c, new Set()]));
  const candidates = {};
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) {
      if (u.kind === 'statement') continue;
      if (info[c].depth(u.label) > maxLayer) continue;
      if (info[c].mutableDeclarers.has(u.label)) continue;
      movable[c].add(u.label);
    }
    candidates[c] = movable[c].size;
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      for (const label of [...movable[c]]) {
        const u = info[c].byLabel.get(label);
        let ok = u.deps.every((d) => movable[c].has(d));
        if (ok && owner(c, u) === 'shared') {
          ok =
            u.deps.every((d) => owner(c, info[c].byLabel.get(d)) === 'shared') &&
            !info[c].importsCountryCode(u) &&
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
    for (const u of info[c].model.units) if (u.regionKind === 'data' && u.ui) dataSideUi.set(`${c}:${u.region}`, true);
  }

  // Group into module nodes.
  const nodes = []; // { owner, region?, units: { us: [], canada: [] } }
  const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const sharedByKey = new Map();
  for (const c of COUNTRIES) {
    const units = [...info[c].model.units].sort((a, b) => a.startLine - b.startLine);
    let run = null;
    for (const u of units) {
      const isMovable = movable[c].has(u.label);
      const side = (u.regionKind === 'data' ? dataSideUi.get(`${c}:${u.region}`) : isUi(c, u)) ? 'ui' : 'core';
      if (isMovable && owner(c, u) === 'shared') {
        const key = `${u.region}|${side}`;
        let node = sharedByKey.get(key);
        if (!node) {
          node = { owner: 'shared', region: u.region, units: { us: [], canada: [] } };
          sharedByKey.set(key, node);
          nodes.push(node);
        }
        node.units[c].push(u.label);
        nodeOf[c].set(u.label, node);
      } else if (isMovable) {
        if (!run) run = { core: null, ui: null };
        if (!run[side]) {
          run[side] = { owner: c, units: { us: [], canada: [] } };
          nodes.push(run[side]);
        }
        run[side].units[c].push(u.label);
        nodeOf[c].set(u.label, run[side]);
      } else if (u.kind !== 'statement') {
        run = null; // a unit that stays behind starts a new topic; side-effect statements stay but do not
      }
    }
  }

  // Module graph, merging modules that import each other.
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
  const comps = stronglyConnected(nodes.length, edges);
  const compId = new Map();
  comps.forEach((comp, i) => comp.forEach((v) => compId.set(v, i)));
  const merged = comps.map((comp) => {
    const members = comp.map((v) => nodes[v]);
    const owners = new Set(members.map((m) => m.owner));
    if (owners.size > 1) throw new Error(`module cycle across owners: ${[...owners].join(', ')}`);
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
  const used = new Set();
  const modules = merged.map((m, i) => {
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    const ui = countries.some((c) => m.units[c].some((l) => info[c].byLabel.get(l).ui));
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
    return { path: p, owner: m.owner, depth: depth[i], batch: Math.min(depth[i], 2), ui, regions: m.regions, units: m.units };
  });
  modules.sort((a, b) => a.batch - b.batch || a.depth - b.depth || a.path.localeCompare(b.path));

  const total = (c) => info[c].model.units.length;
  const moved = (c) => modules.filter((m) => m.owner === 'shared' || m.owner === c).reduce((s, m) => s + m.units[c].length, 0);
  return {
    modules,
    stats: Object.fromEntries(COUNTRIES.map((c) => [c, { units: total(c), candidates: candidates[c], movable: moved(c) }])),
  };
}

module.exports = { planExtraction, kebab };
