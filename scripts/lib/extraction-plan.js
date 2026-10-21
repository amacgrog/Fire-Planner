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
//
// Stage 4 (design sections 5.1, 5.4): with `topics` (the parsed stage4-topics.json) side-effect statements become movable too.
// Every statement must have an entry (a module, or a `main` list that pins it); a listed declaration goes to its module; each
// module gains `wiring` (its runs and their function names). draftTopics() proposes the entries from the design defaults.
// With topics, a binding with statement writers (or several writers) moves when every writer is listed in one module
// (`colocated` gets { declaredIn, module }); a moving declaration whose initializer is not inert needs a `// load-time:`
// comment or is split (`let x;` plus the statement `x = <init>;` at its position, recorded in the module's `splits`).
// `seamSides` says which seam facades live under ui/ (either country's target is a ui/ module); a shared unit that uses
// such a name is ui. A cycle across owners (or between topics modules) whose modules all have ui/ paths (a topics module:
// its topics path) is accepted and listed in `uiCycles` (its modules stay separate and share one depth); one with a core/
// module throws. Empty `splits` / `uiCycles` are left out.
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const { analyze, statementLabel } = require('../analyze-closure');
const { isInert, loadTimeMarker } = require('./load-time');
const { isUi: isUiPath, isCore: isCorePath } = require('./src-paths');

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
  // mutable bindings, grouped by the unit that declares them (placed by planCore, which knows the topics file)
  const bindingGroups = new Map();
  for (const m of model.mutables) {
    if (!bindingGroups.has(m.declaredIn)) bindingGroups.set(m.declaredIn, { declaredIn: m.declaredIn, names: [], writerSets: [] });
    const b = bindingGroups.get(m.declaredIn);
    b.names.push(m.name);
    b.writerSets.push([...m.writers].sort());
  }
  // the IIFE's top-level statements by start line (the initializers the load-time rule reads)
  const ast = espree.parse(code, { ecmaVersion: 2022, sourceType: 'module', range: true, loc: true });
  const iife = ast.body
    .filter((n) => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression')
    .map((n) => n.expression.callee)
    .find((f) => /^(Arrow)?FunctionExpression$/.test(f.type) && f.body.type === 'BlockStatement');
  const nodeAt = new Map(iife.body.body.map((n) => [n.loc.start.line, n]));
  const importSource = new Map(model.imports.map((i) => [i.local, path.resolve(root, 'src', country, i.source)]));
  const countryDir = path.join(root, 'src', country) + path.sep;
  return {
    model,
    byLabel,
    code,
    lines: code.split('\n'),
    nodeAt,
    bindingGroups,
    depth: (label) => depthOfComp.get(compOf.get(label)),
    importSource,
    // country code a unit reaches through an import (a module an earlier stage created), other than the allowed seam names
    importsCountryCode: (u, allowed) => u.importUses.some((n) => !allowed.has(n) && (importSource.get(n) || '').startsWith(countryDir)),
    // a unit that imports a ui/ module is ui code, whatever its own text does (the analyzer sees only main.js)
    // (tested on the path under src/, so a checkout under a directory named ui does not count)
    importsUi: (u) =>
      u.importUses.some((n) => {
        const abs = importSource.get(n);
        return !!abs && isUiPath(path.relative(root, abs));
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

const MAIN = '<main>'; // the placement of a statement pinned in main.js
const IDENT = /^[A-Za-z_$][\w$]*$/;
const pascal = (file) => kebab(path.basename(file, '.js')).split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');

function patternNames(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach((q) => patternNames(q, out));
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
}

// Top-level declaration names of every .js file under a directory (functions, classes, consts, lets).
function fileNames(full, out) {
  const ast = espree.parse(fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n'), { ecmaVersion: 'latest', sourceType: 'module' });
  for (const node of ast.body) {
    const d = node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' ? node.declaration : node;
    if (!d) continue;
    if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') {
      if (d.id) out.add(d.id.name);
    } else if (d.type === 'VariableDeclaration') {
      const names = [];
      d.declarations.forEach((x) => patternNames(x.id, names));
      names.forEach((n) => out.add(n));
    }
  }
}

function topLevelNames(dir, skip, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) topLevelNames(full, skip, out);
    else if (e.name.endsWith('.js') && full !== skip) fileNames(full, out);
  }
}

function planCore(root, options = {}) {
  const { maxLayer = Infinity, maxBatch = 2, coreOnly = false, seam = [], names = {}, topics = null, reservedNames = [], draft = false } = options;
  const seamNames = new Set(seam);
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const owner = (c, u) => (u.regionKind === 'shared' ? 'shared' : c);
  // Seam names whose facade is under ui/ (design section 5.2). A shared unit that uses one is ui in both planners.
  let uiSeam = new Set();
  const usesUiSeam = (u) => u.regionKind === 'shared' && (u.deps.some((d) => uiSeam.has(d)) || u.importUses.some((n) => uiSeam.has(n)));
  const uiUnit = (c, u) => u.ui || info[c].importsUi(u) || usesUiSeam(u);
  const isUi = (c, u) =>
    owner(c, u) === 'shared' ? COUNTRIES.some((cc) => uiUnit(cc, info[cc].byLabel.get(u.label) || u)) : uiUnit(c, u);
  const pathSide = (p) => (isUiPath(p) ? 'ui' : 'core'); // p: a repo-relative path under src/

  for (const name of seamNames) {
    for (const c of COUNTRIES) {
      const u = info[c].byLabel.get(name);
      const imported = (info[c].importSource.get(name) || '').startsWith(path.join(root, 'src', c) + path.sep);
      // exported by an earlier run
      const hasFacade = ['core', 'ui'].some((side) => fs.existsSync(path.join(root, 'src', c, side, `seam-${name}.js`)));
      if ((!u || owner(c, u) === 'shared') && !imported && !hasFacade) throw new Error(`seam name ${name} must be a country unit or a country import in ${c}/main.js`);
    }
  }
  // The topics file: where each listed unit goes (a module path, or MAIN for a pinned statement).
  const topicPlace = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const topicMods = new Map(); // module path -> { section, labels, wiring }
  if (topics && !draft) {
    for (const section of ['shared', ...COUNTRIES]) {
      const sec = topics[section] || {};
      const secCountries = section === 'shared' ? COUNTRIES : [section];
      const place = (label, where, moduleExists) => {
        const found = secCountries.map((c) => info[c].byLabel.get(label));
        if (found.every((u) => !u)) {
          if (moduleExists) {
            // moved by an earlier batch: a statement cannot be verified any more, a declaration must be a name in the module's file
            if (!label.startsWith('stmt:')) {
              const have = new Set();
              fileNames(path.join(root, where), have);
              if (!label.split(', ').every((n) => have.has(n))) throw new Error(`declaration ${label} is not a top-level name of the existing module ${where}`);
            }
            return 0;
          }
          throw new Error(`unknown unit ${label} in the ${section} section of the topics file`);
        }
        secCountries.forEach((c, i) => {
          const u = found[i];
          if (!u) throw new Error(`unit ${label} (${section} section) does not exist in ${c}/main.js`);
          const kind = u.kind === 'statement' ? 'statement' : 'declaration';
          const sharedUnit = owner(c, u) === 'shared';
          if (section === 'shared' && !sharedUnit) throw new Error(`country ${kind} ${label} (${c} line ${u.startLine}) is listed in the shared section (${where})`);
          if (section !== 'shared' && sharedUnit) throw new Error(`shared ${kind} ${label} (${c} line ${u.startLine}) is listed in the ${c} section (${where})`);
          if (where === MAIN && kind !== 'statement') throw new Error(`declaration ${label} cannot be listed in main`);
          if (where !== MAIN && kind === 'statement' && /\/core\//.test(where)) throw new Error(`statement ${label} (${c} line ${u.startLine}) is listed in the core module ${where}: wiring functions live in ui/`);
          if (topicPlace[c].has(label)) throw new Error(`unit ${label} (${c}) is listed more than once in the topics file`);
          topicPlace[c].set(label, where);
        });
        return 1;
      };
      for (const [p, mod] of Object.entries(sec.modules || {})) {
        const dir = section === 'shared' ? 'src/shared/' : `src/${section}/`;
        if (!p.startsWith(dir) || !p.endsWith('.js')) throw new Error(`topics module ${p} is outside ${dir}`);
        if (topicMods.has(p)) throw new Error(`topics module ${p} is listed twice`);
        const exists = fs.existsSync(path.join(root, p));
        const labels = mod.units || [];
        let present = 0;
        let firstPresent = null;
        for (const label of labels) {
          const n = place(label, p, exists);
          present += n;
          if (n && firstPresent === null) firstPresent = label;
        }
        if (exists && present) throw new Error(`topics module ${p} already exists, but unit ${firstPresent} is still in main.js: extraction creates new modules only`);
        topicMods.set(p, { section, labels, wiring: mod.wiring || {} });
      }
      for (const label of sec.main || []) place(label, MAIN, false);
    }
    for (const c of COUNTRIES) {
      for (const u of info[c].model.units) {
        if (u.kind === 'statement' && !topicPlace[c].has(u.label)) throw new Error(`statement ${u.label} (${c} line ${u.startLine}) has no topics entry`);
      }
      for (const m of info[c].model.mutables) {
        const w = m.writers.find((l) => topicPlace[c].get(l) === MAIN);
        if (w) throw new Error(`pinned statement assigns a top-level binding of main.js: ${w} (${c}) writes ${m.name}`);
      }
    }
  }

  // Mutable bindings (design section 5.4). One writer function and no statement writer: the declaration moves with that
  // function (stage 3). Otherwise (several writers, or a statement writer), with a topics file: when every writer is listed
  // in one and the same module, the declaration goes there too; anything else needs a decision and blocks its dependents.
  const sectionOf = (p) => (p.startsWith('src/shared/') ? 'shared' : p.split('/')[1]);
  for (const c of COUNTRIES) {
    const I = info[c];
    I.colocated = []; // { declaredIn, writer } or { declaredIn, module }, in declaration order
    I.writersOf = new Map(); // declaring unit -> its writers (the declaration and its writers move only together)
    I.needsDecision = [];
    for (const b of I.bindingGroups.values()) {
      const all = [...new Set(b.writerSets.flat())].sort();
      const first = b.writerSets[0];
      const same = b.writerSets.every((w) => w.length === first.length && w.every((x, i) => x === first[i]));
      const writer = same && first.length === 1 && I.byLabel.get(first[0]).kind !== 'statement' ? first[0] : null;
      const declPlace = topicPlace[c].get(b.declaredIn);
      let entry = null;
      if (writer) {
        const writerPlace = topicPlace[c].get(writer);
        if (!(declPlace && writerPlace && declPlace !== writerPlace)) entry = { declaredIn: b.declaredIn, writer };
      } else if (topics && !draft) {
        const places = new Set(all.map((w) => topicPlace[c].get(w)));
        const p = places.size === 1 ? [...places][0] : undefined;
        const declOwner = owner(c, I.byLabel.get(b.declaredIn));
        if (p && p !== MAIN && (!declPlace || declPlace === p) && sectionOf(p) === declOwner) {
          entry = { declaredIn: b.declaredIn, module: p };
          if (!declPlace) topicPlace[c].set(b.declaredIn, p);
        }
      }
      if (entry) {
        I.colocated.push(entry);
        I.writersOf.set(b.declaredIn, all);
      } else I.needsDecision.push({ names: b.names, declaredIn: b.declaredIn, writers: all });
    }
    I.blockedBindings = new Set(I.needsDecision.map((b) => b.declaredIn));
  }

  const dataSideUi = new Map(); // "country:block" -> true when any unit of the block is ui (data blocks are country code)
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) if (u.regionKind === 'data' && uiUnit(c, u)) dataSideUi.set(`${c}:${u.region}`, true);
  }
  const sideOf = (c, u) => ((u.regionKind === 'data' ? dataSideUi.get(`${c}:${u.region}`) : isUi(c, u)) ? 'ui' : 'core');

  // Seam sides (design section 5.2): a name's target is the module the plan gives it in each country (its topics entry, or
  // the side its grouping gives it; for a name an earlier stage moved, its current module). The facade is under ui/ in both
  // countries when either target is. The guess below is checked against the finished plan (see the end of planCore).
  const targetSides = (moduleOf) =>
    Object.fromEntries(
      [...seamNames].map((name) => {
        const side = COUNTRIES.map((c) => {
          const u = info[c].byLabel.get(name);
          if (u && owner(c, u) !== 'shared') {
            const planned = moduleOf && moduleOf(c, name);
            if (planned) return pathSide(planned);
            const tp = topicPlace[c].get(name);
            return tp && tp !== MAIN ? pathSide(tp) : sideOf(c, u);
          }
          const abs = info[c].importSource.get(name);
          if (abs) return pathSide(path.relative(root, abs).split(path.sep).join('/'));
          return fs.existsSync(path.join(root, 'src', c, 'ui', `seam-${name}.js`)) ? 'ui' : 'core';
        });
        return [name, side.includes('ui') ? 'ui' : 'core'];
      }),
    );
  const seamSides = options._seamSides || targetSides(null);
  uiSeam = new Set(Object.keys(seamSides).filter((n) => seamSides[n] === 'ui'));

  const movable = Object.fromEntries(COUNTRIES.map((c) => [c, new Set()]));
  const candidates = {};
  for (const c of COUNTRIES) {
    for (const u of info[c].model.units) {
      if (u.kind === 'statement') {
        const where = topicPlace[c].get(u.label);
        if (!where || where === MAIN) continue;
      }
      if (draft) {
        movable[c].add(u.label); // the draft groups every declaration as if it were movable
        continue;
      }
      if (info[c].depth(u.label) > maxLayer) continue;
      if (info[c].blockedBindings.has(u.label)) continue;
      if (coreOnly && uiUnit(c, u)) continue;
      movable[c].add(u.label);
    }
    candidates[c] = movable[c].size;
  }
  // a colocated declaration and all its writers are partners: each is movable only with all the others
  const partnerOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  for (const c of COUNTRIES) {
    for (const [declarer, writers] of info[c].writersOf) {
      const group = [declarer, ...writers];
      for (const g of group) {
        if (!partnerOf[c].has(g)) partnerOf[c].set(g, new Set());
        group.forEach((x) => x !== g && partnerOf[c].get(g).add(x));
      }
    }
  }
  for (let changed = !draft; changed; ) {
    changed = false;
    for (const c of COUNTRIES) {
      for (const label of [...movable[c]]) {
        const u = info[c].byLabel.get(label);
        let ok = u.deps.every((d) => movable[c].has(d));
        const partners = partnerOf[c].get(label);
        if (ok && partners) ok = [...partners].every((x) => movable[c].has(x) && owner(c, info[c].byLabel.get(x)) === owner(c, u));
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
  for (let changed = !draft; changed; ) {
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

  // Group into module nodes, then into the module graph. A country run or a shared region can pull units of different
  // layers into one node and so close a cycle between a shared and a country module; the units of such nodes get
  // nodes of their own and the graph is built again (what remains cyclic is a real cycle between units).
  const fine = new Set();
  const build = () => {
  const nodes = []; // { owner, region?, units: { us: [], canada: [] } }
  const nodeOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const sharedByKey = new Map();
  const topicNodes = new Map();
  let runSeq = 0;
  for (const c of COUNTRIES) {
    const units = [...info[c].model.units].sort((a, b) => a.startLine - b.startLine);
    let run = null;
    for (const u of units) {
      const isMovable = movable[c].has(u.label);
      const side = sideOf(c, u);
      const topicPath = isMovable ? topicPlace[c].get(u.label) : undefined;
      if (topicPath && topicPath !== MAIN) {
        // listed in the topics file: the module it names, whatever the region or run would give
        let node = topicNodes.get(topicPath);
        if (!node) {
          node = { owner: topicMods.get(topicPath).section, group: `topic:${topicPath}`, topicPath, units: { us: [], canada: [] } };
          topicNodes.set(topicPath, node);
          nodes.push(node);
        }
        node.units[c].push(u.label);
        nodeOf[c].set(u.label, node);
      } else if (isMovable && owner(c, u) === 'shared') {
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
    for (const [declarer, writers] of info[c].writersOf) {
      const a = nodeOf[c].get(declarer);
      for (const writer of writers) {
        const b = nodeOf[c].get(writer);
        if (a && b && a !== b) edges[index.get(a)].add(index.get(b));
      }
    }
  }
  return { nodes, nodeOf, edges, index, comps: stronglyConnected(nodes.length, edges) };
  };
  // UI cycles (design section 5.3): a cycle across owners (or between topics modules) whose every MODULE has a ui/ path is
  // accepted (its nodes keep the modules of their own the `fine` split gives them); one with a core/ module throws. A topics
  // node's side is its topics path (a plain `let` the topics file places in a ui/ module does not make it core); any other
  // node's units all share one side (nodes are grouped by side), which is the side its module path gets.
  const nodeAllUi = (n) => COUNTRIES.every((c) => n.units[c].every((l) => sideOf(c, info[c].byLabel.get(l)) === 'ui'));
  const nodeUiModule = (n) => (n.topicPath ? pathSide(n.topicPath) === 'ui' : nodeAllUi(n));
  const compAllUi = (b, comp) => comp.every((v) => nodeUiModule(b.nodes[v]));
  const isCrossOwner = (b, comp) => new Set(comp.map((v) => b.nodes[v].owner)).size > 1;
  const compKey = (b, comp) =>
    comp
      .flatMap((v) => COUNTRIES.flatMap((c) => b.nodes[v].units[c].map((l) => `${c}:${l}`)))
      .sort()
      .join('\n');
  let built = graphOf(build());
  const acceptedTry = new Set();
  for (;;) {
    const bad = built.comps.find((comp) => isCrossOwner(built, comp) && !acceptedTry.has(compKey(built, comp)));
    if (!bad) break;
    const before = fine.size;
    for (const v of bad) for (const c of COUNTRIES) built.nodes[v].units[c].forEach((l) => fine.add(l));
    if (fine.size === before) {
      if (compAllUi(built, bad)) {
        acceptedTry.add(compKey(built, bad));
        continue;
      }
      throw new Error(`module cycle across owners between units: ${bad.map((v) => built.nodes[v].units.us.concat(built.nodes[v].units.canada).slice(0, 4).join(',')).join(' ; ')}`);
    }
    built = graphOf(build());
  }
  const accepted = new Set(built.comps.filter((comp) => isCrossOwner(built, comp)).map((comp) => compKey(built, comp)));
  // Fewer, larger modules: nodes that came from one region or one run are joined again when that closes no new cycle.
  const cyclic = (b) => b.comps.filter((comp) => comp.length > 1);
  // a cycle across owners other than the accepted ones, or one that contains a core/ module (the same module condition)
  const crossOwnerBeyondAccepted = (b) =>
    cyclic(b).some((comp) => isCrossOwner(b, comp) && (!accepted.has(compKey(b, comp)) || !compAllUi(b, comp)));
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
        if (!crossOwnerBeyondAccepted(trial) && cyclic(trial).length <= cyclic(built).length) built = trial;
        else COUNTRIES.forEach((c) => (keep.units[c] = saved[c]));
      }
    }
  }
  const { nodes, nodeOf, edges, index, comps } = built;
  const compId = new Map();
  comps.forEach((comp, i) => comp.forEach((v) => compId.set(v, i)));
  // One module per strongly connected set of nodes, except an accepted UI cycle (across owners, or between topics modules),
  // whose nodes stay modules of their own; the set is still the unit of depth, so they share one depth and one batch.
  const merged = []; // { comp, owner, topicPath, regions, units }
  const uiCycleMembers = []; // per accepted cycle: indices into merged
  comps.forEach((comp, ci) => {
    const members = comp.map((v) => nodes[v]);
    const owners = new Set(members.map((m) => m.owner));
    const topicPaths = [...new Set(members.map((m) => m.topicPath).filter(Boolean))];
    const sortUnits = (c, list) => list.sort((a, b) => info[c].byLabel.get(a).startLine - info[c].byLabel.get(b).startLine);
    if (owners.size > 1 || topicPaths.length > 1) {
      if (!compAllUi(built, comp)) {
        if (owners.size > 1) throw new Error('module cycle across owners');
        throw new Error(`topics modules ${topicPaths.join(' and ')} import each other (a cycle between modules the topics file names, with a core/ module in it)`);
      }
      const list = [];
      for (const m of members) {
        list.push(merged.length);
        merged.push({
          comp: ci,
          owner: m.owner,
          topicPath: m.topicPath || null,
          regions: m.region ? [m.region] : [],
          units: { us: sortUnits('us', [...m.units.us]), canada: sortUnits('canada', [...m.units.canada]) },
        });
      }
      uiCycleMembers.push(list);
      return;
    }
    const unitsOf = (c) => sortUnits(c, members.flatMap((m) => m.units[c]));
    merged.push({ comp: ci, owner: members[0].owner, topicPath: topicPaths[0] || null, regions: members.map((m) => m.region).filter(Boolean), units: { us: unitsOf('us'), canada: unitsOf('canada') } });
  });
  const compEdges = comps.map(() => new Set());
  edges.forEach((targets, v) => targets.forEach((w) => { if (compId.get(v) !== compId.get(w)) compEdges[compId.get(v)].add(compId.get(w)); }));

  // Depth of each strongly connected set (comps are already dependencies-first).
  const compDepth = comps.map(() => 0);
  comps.forEach((_, i) => compEdges[i].forEach((w) => { compDepth[i] = Math.max(compDepth[i], compDepth[w] + 1); }));
  const depth = merged.map((m) => compDepth[m.comp]);

  // Names and paths.
  const used = new Set(existingModules(root)); // a new module never takes the path of one an earlier stage made
  topicMods.forEach((_, p) => used.add(p)); // nor a path the topics file names
  const modules = merged.map((m, i) => {
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    if (m.topicPath) {
      return { path: m.topicPath, owner: m.owner, depth: depth[i], batch: Math.min(depth[i], maxBatch), ui: isUiPath(m.topicPath), regions: m.regions, units: m.units };
    }
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
  const uiCycles = uiCycleMembers.map((list) => list.map((i) => modules[i].path).sort()).sort((a, b) => a[0].localeCompare(b[0]));

  // The seam sides were a guess from the grouping; a merge can put a seam name in a module of the other side. Plan again
  // with the sides the plan gives (they settle at once: a side changes only which shared units are ui).
  const moduleOf = (c, label) => {
    const m = modules.find((x) => (x.owner === c || x.owner === 'shared') && x.units[c].includes(label));
    return m ? m.path : null;
  };
  const actualSides = targetSides(moduleOf);
  if (JSON.stringify(actualSides) !== JSON.stringify(seamSides)) {
    if ((options._seamRound || 0) >= 3) throw new Error(`seam sides do not settle: ${JSON.stringify(actualSides)}`);
    return planCore(root, { ...options, _seamSides: actualSides, _seamRound: (options._seamRound || 0) + 1 });
  }

  modules.sort((a, b) => a.batch - b.batch || a.depth - b.depth || a.path.localeCompare(b.path));

  // Initializers that run at load (design sections 5.1 and 6.4): marked ones move as is, a one-declarator `let` in a ui/
  // module is split into `let x;` plus the statement `x = <init>;` at the declaration's position, anything else throws.
  const splitsAt = Object.fromEntries(COUNTRIES.map((c) => [c, []])); // { label, name, line, path }
  if (topics && !draft) {
    for (const m of modules) {
      const splits = [];
      for (const c of m.owner === 'shared' ? COUNTRIES : [m.owner]) {
        const I = info[c];
        for (const label of m.units[c]) {
          const u = I.byLabel.get(label);
          if (u.kind !== 'let' && u.kind !== 'const' && u.kind !== 'var') continue;
          const node = I.nodeAt.get(u.startLine);
          const hot = node.declarations.filter((d) => d.id.type !== 'Identifier' || !isInert(d.init));
          if (!hot.length || loadTimeMarker(I.lines, u.startLine).marked) continue;
          const name = hot[0].id.type === 'Identifier' ? hot[0].id.name : u.names[0];
          const d = node.declarations[0];
          if (node.kind !== 'let' || node.declarations.length !== 1 || d.id.type !== 'Identifier' || pathSide(m.path) !== 'ui') {
            throw new Error(`non-inert initializer of ${name} needs a load-time comment or a split (${c} line ${u.startLine}, ${m.path})`);
          }
          const splitLabel = statementLabel(`${name} = ${I.code.slice(d.init.range[0], d.init.range[1])};`);
          splitsAt[c].push({ label: splitLabel, name, line: u.startLine, path: m.path });
          const known = splits.find((s) => s.name === name);
          if (!known) splits.push({ name, label: splitLabel });
          else if (known.label !== splitLabel) throw new Error(`shared module ${m.path} splits ${name} differently in the two planners`);
        }
      }
      if (splits.length) m.splits = splits;
    }
    addWiring();
  }

  const total = (c) => info[c].model.units.length;
  const moved = (c) => modules.filter((m) => m.owner === 'shared' || m.owner === c).reduce((s, m) => s + m.units[c].length, 0);
  const plan = {
    modules,
    seam: [...seamNames],
    seamSides,
    bindings: Object.fromEntries(COUNTRIES.map((c) => [c, { colocated: info[c].colocated, needsDecision: info[c].needsDecision }])),
    stats: Object.fromEntries(COUNTRIES.map((c) => [c, { units: total(c), candidates: candidates[c], movable: moved(c) }])),
  };
  if (uiCycles.length) plan.uiCycles = uiCycles;
  return { plan, info };

  // Runs and wiring functions of every topics module (design section 5.1).
  function addWiring() {
    const taken = Object.fromEntries(COUNTRIES.map((c) => [c, new Set(reservedNames)]));
    for (const c of COUNTRIES) {
      for (const u of info[c].model.units) if (u.kind !== 'statement') u.names.forEach((n) => taken[c].add(n));
      topLevelNames(path.join(root, 'src', 'shared'), null, taken[c]);
      topLevelNames(path.join(root, 'src', c), path.join(root, 'src', c, 'main.js'), taken[c]);
    }
    const byName = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()])); // wiring name -> module path
    // every statement, plus each split assignment standing at its declaration's position
    const orderedOf = Object.fromEntries(
      COUNTRIES.map((c) => [
        c,
        [
          ...info[c].model.units.filter((u) => u.kind === 'statement').map((u) => ({ label: u.label, line: u.startLine, split: null })),
          ...splitsAt[c].map((s) => ({ label: s.label, line: s.line, split: s.name })),
        ].sort((a, b) => a.line - b.line),
      ]),
    );
    for (const m of modules) {
      const tm = topicMods.get(m.path) || (m.splits ? { labels: [], wiring: {} } : null);
      if (!tm) continue;
      const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
      for (const key of Object.keys(tm.wiring)) {
        if (!tm.labels.includes(key)) throw new Error(`wiring key ${key} is not a statement listed in ${m.path}`);
      }
      // A run is a maximal sequence of this module's statements with no other statement between (declarations do not break it).
      // A split assignment joins the run of its module that it falls into or follows; it never starts one.
      const runsOf = Object.fromEntries(COUNTRIES.map((c) => [c, []]));
      for (const c of countries) {
        const mine = new Set(m.units[c]);
        const mySplits = new Set(splitsAt[c].filter((s) => s.path === m.path).map((s) => s.label));
        let cur = null;
        for (const u of orderedOf[c]) {
          if (u.split !== null ? mySplits.has(u.label) : mine.has(u.label)) {
            if (!cur) {
              if (u.split !== null) throw new Error(`split assignment would start a run: ${u.split} (${c}, ${m.path})`);
              runsOf[c].push((cur = []));
            }
            cur.push(u.label);
          } else cur = null; // another module's statement or split, a pinned one, or one that waits
        }
      }
      let runs;
      if (m.owner === 'shared') {
        const flat = runsOf.us.flat();
        if (JSON.stringify(flat) !== JSON.stringify(runsOf.canada.flat())) throw new Error(`shared module ${m.path} gathers different statements in the two planners`);
        const cutAfter = new Set();
        for (const c of COUNTRIES) runsOf[c].forEach((r) => cutAfter.add(r[r.length - 1])); // the union of both planners' boundaries
        runs = [];
        let cur = null;
        for (const l of flat) {
          if (!cur) runs.push((cur = []));
          cur.push(l);
          if (cutAfter.has(l)) cur = null;
        }
      } else runs = runsOf[m.owner];
      // every wiring key must name the first statement of one of the runs, or the chosen name would be dropped silently
      const firsts = new Set(runs.map((r) => r[0]));
      for (const key of Object.keys(tm.wiring)) {
        if (firsts.has(key)) continue;
        const stmt = countries.map((c) => info[c].byLabel.get(key)).find((u) => u && u.kind === 'statement');
        const why = !stmt
          ? 'names a declaration, not a statement'
          : runs.some((r) => r.includes(key))
            ? 'is not the first statement of a run'
            : 'waits (it does not move in this batch, so it starts no run)';
        throw new Error(`wiring key ${key} in ${m.path} ${why}`);
      }
      m.wiring = runs.map((r) => {
        let name = tm.wiring[r[0]];
        if (!name) {
          if (runs.length > 1) throw new Error(`module ${m.path} has several runs, so every run needs a name in wiring (the run starting at ${r[0]} has none)`);
          name = `wire${pascal(m.path)}`;
        }
        if (!IDENT.test(name)) throw new Error(`wiring name ${name} (${m.path}) is not an identifier`);
        for (const c of countries) {
          if (taken[c].has(name)) throw new Error(`wiring name clash: ${name} (${m.path}) is already declared in ${c}'s bundle`);
          if (byName[c].has(name)) throw new Error(`wiring name clash: ${name} is used by ${byName[c].get(name)} and ${m.path}`);
          byName[c].set(name, m.path);
        }
        return { name, statements: m.owner === 'shared' ? { us: r, canada: r } : { [m.owner]: r } };
      });
    }
    modules.forEach((m) => {
      if (!m.wiring) m.wiring = [];
    });
  }
}

function planExtraction(root, options = {}) {
  return planCore(root, options).plan;
}

// A draft topics file (design section 5.1 defaults), computed after grouping every declaration as if it were movable.
// "TODO" collects the statements with no default: after a shared region, with no unit before them, or landing in core/.
function draftTopics(root, options = {}) {
  const { plan, info } = planCore(root, { ...options, topics: null, draft: true });
  const pathOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  for (const m of plan.modules) {
    for (const c of m.owner === 'shared' ? COUNTRIES : [m.owner]) m.units[c].forEach((l) => pathOf[c].set(l, m.path));
  }
  const out = { shared: { modules: {}, main: [] }, us: { modules: {}, main: [] }, canada: { modules: {}, main: [] } };
  // Lists the statement under its default module ('TODO' when there is none or it is a core/ module); returns the default or null.
  const put = (section, p, label) => {
    const where = !p || isCorePath(p) ? 'TODO' : p;
    (out[section].modules[where] = out[section].modules[where] || { units: [] }).units.push(label);
    return where === 'TODO' ? null : where;
  };
  for (const c of COUNTRIES) {
    const units = [...info[c].model.units].sort((a, b) => a.startLine - b.startLine);
    const home = new Map(); // statement label -> its default module, or null
    const homeOf = (u) => (u.kind === 'statement' ? home.get(u.label) : pathOf[c].get(u.label));
    units.forEach((u, i) => {
      if (u.kind !== 'statement') return;
      const sharedStmt = u.regionKind === 'shared';
      if (sharedStmt && c !== 'us') return; // a shared statement is listed once, from the US file
      let prev = units[i - 1];
      if (sharedStmt) {
        prev = null;
        for (let j = i - 1; j >= 0; j--) {
          if (units[j].regionKind === 'shared' && units[j].region === u.region) {
            prev = units[j];
            break;
          }
        }
      }
      const p = prev && (sharedStmt || prev.regionKind !== 'shared') ? homeOf(prev) || null : null;
      home.set(u.label, put(sharedStmt ? 'shared' : c, p, u.label));
    });
  }
  return out;
}

module.exports = { planExtraction, draftTopics, kebab };
