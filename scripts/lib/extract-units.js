'use strict';
// Moves top-level units out of src/<country>/main.js into modules (spec section 13).
//
// applyModules(root, modules, { dryRun }) takes the modules of a plan (see extraction-plan.js):
//   [{ path: 'src/shared/core/pct.js', owner: 'shared' | 'us' | 'canada', units: { us: [label], canada: [label] } }]
// and, for each module, cuts its units (with the contiguous comment lines directly above each one, and a
// following `// NAME:end` data marker) out of main.js, writes the module with `export` on the names used elsewhere
// and the imports it needs, and adds to main.js the imports it now needs. A shared module is cut from both
// planners (the text must be identical) and its @@shared region fragment under shared/ is updated or deleted.
//
// Side-effect statements are never moved. Everything is verified before anything is written; on any problem it
// throws and writes nothing (the files are staged next to their targets and renamed into place at the end).
//
// Country seam (spec section 14): a shared module may use a country unit only through the names listed in `seam`.
// It then imports them from '#country/core/seam', and each country gets a facade, src/<country>/core/seam.js,
// that re-exports those names from the module that holds them. Both facades must export the same names.
const fs = require('fs');
const path = require('path');
const { analyze, undeclaredNames } = require('../analyze-closure');

const COUNTRIES = ['us', 'canada'];
const SHARED_MARK = /^\s*\/\/ @@shared:(\S+) (begin|end)\s*$/;
const DATA_END = /^\s*\/\/ ([A-Z][A-Z_]*):end\s*$/;
const posix = (p) => p.split(path.sep).join('/');

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function loadCountry(root, country) {
  const file = path.join(root, 'src', country, 'main.js');
  const text = readText(file);
  const lines = text.split('\n');
  const model = analyze(text);
  const units = [...model.units].sort((a, b) => a.startLine - b.startLine);
  for (let i = 1; i < units.length; i++) {
    if (units[i].startLine <= units[i - 1].endLine) {
      throw new Error(`${country}: units "${units[i - 1].label}" and "${units[i].label}" share a source line`);
    }
  }
  const byLabel = new Map(units.map((u) => [u.label, u]));
  const chunks = new Map(); // label -> { start, end } (1-based, inclusive)
  units.forEach((u, i) => {
    const floor = i > 0 ? units[i - 1].endLine : 0;
    let start = u.startLine;
    while (start - 1 > floor) {
      const above = lines[start - 2];
      if (/^\s*\/\//.test(above) && !SHARED_MARK.test(above) && !DATA_END.test(above)) {
        start--; // a "// NAME:end" marker belongs to the unit above it
        continue;
      }
      if (/^\s*\/\*/.test(above) && /\*\/\s*$/.test(above)) {
        start--; // a one-line block comment
        continue;
      }
      if (/\*\/\s*$/.test(above)) {
        let k = start - 1; // line number of the closing line
        while (k > floor && !/\/\*/.test(lines[k - 1])) k--;
        if (k > floor && /^\s*\/\*/.test(lines[k - 1])) {
          start = k;
          continue;
        }
      }
      break;
    }
    let end = u.endLine;
    if (DATA_END.test(lines[end] || '')) end++; // the "// NAME:end" marker right after the unit
    chunks.set(u.label, { start, end });
  });
  return { country, file, lines, model, units, byLabel, chunks, mainDir: path.dirname(file) };
}

const chunkLines = (info, label) => {
  const { start, end } = info.chunks.get(label);
  return info.lines.slice(start - 1, end);
};

// "  const x = 1;" -> "  export const x = 1;" (the first line that is not a comment)
function addExport(lines) {
  const out = [...lines];
  const i = out.findIndex((l) => !/^\s*\/\//.test(l));
  const m = /^(\s*)((?:async\s+)?function\b|const\b|let\b|var\b|class\b)/.exec(out[i]);
  if (!m) throw new Error(`cannot export, unexpected declaration start: ${out[i].trim().slice(0, 60)}`);
  out[i] = out[i].replace(m[0], `${m[1]}export ${m[2]}`);
  return out;
}

const relImport = (fromFile, toFile) => {
  const rel = posix(path.relative(path.dirname(fromFile), toFile));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

function specText(spec) {
  return spec.imported === spec.local ? spec.local : `${spec.imported} as ${spec.local}`;
}

function importLine(specs, source) {
  return `import { ${specs.map(specText).join(', ')} } from '${source}';`;
}

const SEAM_KEY = 'seam:#country/core/seam';
const SEAM_FILE = 'core/seam.js';

function applyModules(root, modules, { dryRun = false, seam = [] } = {}) {
  const seamSet = new Set(seam);
  const facade = { us: new Map(), canada: new Map() }; // seam name -> absolute path of the module that holds it
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const warnings = [];
  const files = new Map(); // absolute path -> text (null = delete)

  // ---- 1. which module takes which unit, per country
  const moduleOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const seenPaths = new Set();
  for (const m of modules) {
    if (seenPaths.has(m.path)) throw new Error(`module path used twice: ${m.path}`);
    seenPaths.add(m.path);
    if (!path.resolve(root, m.path).startsWith(path.join(root, 'src') + path.sep)) throw new Error(`${m.path}: module paths must lie under src/`);
    if (fs.existsSync(path.join(root, m.path))) throw new Error(`${m.path} already exists`);
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    for (const c of countries) {
      if (!m.units[c] || !m.units[c].length) throw new Error(`${m.path}: no units for ${c}`);
      for (const label of m.units[c]) {
        const u = info[c].byLabel.get(label);
        if (!u) throw new Error(`${m.path}: ${c} has no unit "${label}"`);
        if (u.kind === 'statement') throw new Error(`${m.path}: "${label}" is a side-effect statement`);
        if (moduleOf[c].has(label)) throw new Error(`${c}: unit "${label}" is in two modules`);
        if (m.owner === 'shared' && u.regionKind !== 'shared') throw new Error(`${m.path}: "${label}" is not in a shared region`);
        moduleOf[c].set(label, m);
      }
    }
  }
  for (const c of COUNTRIES) {
    const declarers = new Set(info[c].model.mutables.map((x) => x.declaredIn));
    const writers = new Map(info[c].model.mutables.map((x) => [x.declaredIn, x.writers]));
    for (const [label, m] of moduleOf[c]) {
      if (!declarers.has(label)) continue;
      const outside = writers.get(label).filter((w) => moduleOf[c].get(w) !== m);
      if (outside.length) throw new Error(`${c}: "${label}" declares a binding assigned outside its module (${outside.join(', ')})`);
    }
  }

  // ---- 2. shared units must read identically in both planners
  for (const m of modules.filter((x) => x.owner === 'shared')) {
    if (m.units.us.join('\n') !== m.units.canada.join('\n')) throw new Error(`${m.path}: shared unit lists differ between planners`);
    for (const label of m.units.us) {
      const a = chunkLines(info.us, label).join('\n');
      const b = chunkLines(info.canada, label).join('\n');
      if (a !== b) throw new Error(`${m.path}: unit "${label}" differs between the two planners`);
    }
  }

  // ---- 3. what each module imports and exports
  const exportsNeeded = new Map(modules.map((m) => [m, new Set()]));
  const needs = new Map(); // module -> country -> Map(targetAbs -> Map(local -> imported))
  const addNeed = (m, c, target, local, imported) => {
    if (!needs.has(m)) needs.set(m, {});
    const byTarget = (needs.get(m)[c] = needs.get(m)[c] || new Map());
    if (!byTarget.has(target)) byTarget.set(target, new Map());
    byTarget.get(target).set(local, imported);
  };
  const mainImports = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()])); // targetAbs -> Set(names)

  for (const c of COUNTRIES) {
    const ci = info[c];
    const impByLocal = new Map(ci.model.imports.map((i) => [i.local, i]));
    for (const u of ci.units) {
      const m = moduleOf[c].get(u.label);
      for (const use of u.uses) {
        const target = moduleOf[c].get(use.unit);
        if (m && !target) throw new Error(`${m.path}: "${u.label}" depends on "${use.unit}", which stays in ${c}/main.js`);
        if (!target || target === m) continue;
        for (const name of use.names) exportsNeeded.get(target).add(name);
        if (m) {
          const viaSeam = m.owner === 'shared' && target.owner !== 'shared';
          for (const name of use.names) {
            if (viaSeam) {
              if (!seamSet.has(name)) throw new Error(`${m.path}: "${u.label}" uses country code "${name}", which is not a seam name`);
              facade[c].set(name, path.join(root, target.path));
              addNeed(m, c, SEAM_KEY, name, name);
            } else addNeed(m, c, path.join(root, target.path), name, name);
          }
        } else {
          const key = path.join(root, target.path);
          if (!mainImports[c].has(key)) mainImports[c].set(key, new Set());
          use.names.forEach((n) => mainImports[c].get(key).add(n));
        }
      }
      if (m) {
        for (const local of u.importUses) {
          const imp = impByLocal.get(local);
          if (imp.imported === '*') throw new Error(`${m.path}: "${u.label}" uses the namespace import "${local}", which is not supported`);
          const bare = !imp.source.startsWith('.');
          if (bare) {
            addNeed(m, c, `bare:${imp.source}`, local, imp.imported);
            continue;
          }
          const abs = path.resolve(ci.mainDir, imp.source);
          const inCountry = COUNTRIES.some((cc) => abs.startsWith(path.join(root, 'src', cc) + path.sep));
          if (m.owner === 'shared' && inCountry) {
            if (!seamSet.has(local) || imp.imported !== local) {
              throw new Error(`${m.path}: "${u.label}" uses "${local}" from ${imp.source}, which is country code and not a seam name`);
            }
            facade[c].set(local, abs);
            addNeed(m, c, SEAM_KEY, local, local);
            continue;
          }
          addNeed(m, c, abs, local, imp.imported);
        }
      }
    }
  }
  const sameNeeds = (m) => {
    const render = (c) => JSON.stringify([...(needs.get(m)?.[c] || new Map())].map(([t, names]) => [t, [...names]]).sort());
    return render('us') === render('canada');
  };
  for (const m of modules.filter((x) => x.owner === 'shared')) {
    if (!sameNeeds(m)) throw new Error(`${m.path}: its imports differ between the two planners`);
  }

  // module import cycle check
  const edges = new Map(modules.map((m) => [m, new Set()]));
  for (const m of modules) {
    for (const c of m.owner === 'shared' ? COUNTRIES : [m.owner]) {
      for (const [target, names] of needs.get(m)?.[c] || new Map()) {
        const files = target === SEAM_KEY ? [...names.keys()].map((n) => facade[c].get(n)) : [target];
        for (const file of files) {
          const t = modules.find((x) => path.join(root, x.path) === file);
          if (t && t !== m) edges.get(m).add(t);
        }
      }
    }
  }
  const state = new Map();
  const walk = (m, trail) => {
    if (state.get(m) === 'done') return;
    if (state.get(m) === 'open') throw new Error(`module import cycle: ${[...trail, m].map((x) => x.path).join(' -> ')}`);
    state.set(m, 'open');
    edges.get(m).forEach((t) => walk(t, [...trail, m]));
    state.set(m, 'done');
  };
  modules.forEach((m) => walk(m, []));

  // ---- 4. write the modules
  for (const m of modules) {
    const c0 = m.owner === 'shared' ? 'us' : m.owner;
    const abs = path.join(root, m.path);
    const importLines = [];
    const byTarget = needs.get(m)?.[c0] || new Map();
    for (const [target, names] of [...byTarget].sort((a, b) => a[0].localeCompare(b[0]))) {
      const specs = [...names].map(([local, imported]) => ({ local, imported })).sort((a, b) => a.local.localeCompare(b.local));
      const source = target === SEAM_KEY ? '#country/core/seam' : target.startsWith('bare:') ? target.slice(5) : relImport(abs, target);
      importLines.push(importLine(specs, source));
    }
    const body = [];
    for (const label of m.units[c0]) {
      let lines = chunkLines(info[c0], label);
      const u = info[c0].byLabel.get(label);
      if (u.names.some((n) => exportsNeeded.get(m).has(n))) lines = addExport(lines);
      body.push(...lines);
    }
    const text = [...importLines, ...(importLines.length ? [''] : []), ...body, ''].join('\n');
    // a data block's begin and end markers must travel together
    for (const name of new Set([...text.matchAll(/^\s*\/\/ ([A-Z][A-Z_]*):(begin|end)\s*$/gm)].map((x) => x[1]))) {
      const count = (kind) => [...text.matchAll(new RegExp(`^\\s*// ${name}:${kind}\\s*$`, 'gm'))].length;
      if (count('begin') !== count('end')) throw new Error(`${m.path}: data block ${name} is split`);
    }
    const bad = undeclaredNames(text);
    if (bad.length) throw new Error(`${m.path}: undeclared names ${bad.map((b) => `${b.name} (line ${b.line})`).join(', ')}`);
    files.set(abs, text);
  }

  // ---- 5. rewrite main.js (and the shared fragments)
  for (const c of COUNTRIES) {
    const ci = info[c];
    const remove = new Set();
    for (const [label] of moduleOf[c]) {
      const { start, end } = ci.chunks.get(label);
      for (let n = start; n <= end; n++) remove.add(n);
    }
    const remainingUnits = ci.units.filter((u) => !moduleOf[c].has(u.label));
    const usedLocals = new Set(remainingUnits.flatMap((u) => u.importUses));
    // imports: the ones still used, then the new ones
    const bySource = new Map();
    for (const imp of ci.model.imports) {
      if (!usedLocals.has(imp.local)) continue;
      if (!bySource.has(imp.source)) bySource.set(imp.source, []);
      bySource.get(imp.source).push({ local: imp.local, imported: imp.imported });
    }
    for (const [target, names] of mainImports[c]) {
      const source = relImport(ci.file, target);
      if (!bySource.has(source)) bySource.set(source, []);
      [...names].sort().forEach((n) => bySource.get(source).push({ local: n, imported: n }));
    }
    const decls = ci.model.importDecls;
    decls.forEach((d) => { for (let n = d.startLine; n <= d.endLine; n++) remove.add(n); });
    const bound = new Set(ci.model.imports.map((i) => i.source));
    const sideEffectOnly = [...new Set(decls.map((d) => d.source))].filter((src) => !bound.has(src));
    const importBlock = [...sideEffectOnly.map((src) => `import '${src}';`), ...[...bySource].map(([source, specs]) => importLine(specs, source))];
    const insertAt = decls.length ? decls[0].startLine : 1;
    const out = [];
    ci.lines.forEach((line, i) => {
      const n = i + 1;
      if (n === insertAt) out.push(...importBlock);
      if (!remove.has(n)) out.push(line);
    });
    files.set(ci.file, out.join('\n'));
  }

  // fragments: drop regions that lost every unit, refresh the others from the US planner
  const mainText = Object.fromEntries(COUNTRIES.map((c) => [c, files.get(info[c].file)]));
  const regionsOf = (text) => {
    const lines = text.split('\n');
    const regions = [];
    let open = null;
    lines.forEach((line, i) => {
      const m = SHARED_MARK.exec(line);
      if (!m) return;
      if (m[2] === 'begin') open = { name: m[1], begin: i, contentStart: i + 1 };
      else if (open) { regions.push({ ...open, end: i }); open = null; }
    });
    return { lines, regions };
  };
  const fragmentDir = path.join(root, 'shared');
  const deleted = new Set();
  for (const c of COUNTRIES) {
    const { lines, regions } = regionsOf(mainText[c]);
    const removeLine = new Set();
    for (const r of regions) {
      const content = lines.slice(r.contentStart, r.end);
      if (content.every((l) => l.trim() === '' || /^\s*\/\//.test(l))) {
        const leftovers = content.filter((l) => l.trim() !== '');
        if (leftovers.length) warnings.push(`${c}: region ${r.name} was emptied; dropped ${leftovers.length} comment line(s) that belonged to no unit`);
        for (let n = r.begin; n <= r.end; n++) removeLine.add(n);
        deleted.add(r.name);
      }
    }
    files.set(info[c].file, lines.filter((_, i) => !removeLine.has(i)).join('\n'));
  }
  const us = regionsOf(files.get(info.us.file));
  const ca = regionsOf(files.get(info.canada.file));
  for (const r of us.regions) {
    const content = us.lines.slice(r.contentStart, r.end).join('\n');
    const other = ca.regions.find((x) => x.name === r.name);
    if (!other) throw new Error(`region ${r.name} exists in us/main.js but not in canada/main.js`);
    if (ca.lines.slice(other.contentStart, other.end).join('\n') !== content) throw new Error(`region ${r.name} differs between the planners after the move`);
    const frag = path.join(fragmentDir, `${r.name}.js`);
    const newText = content + '\n';
    if (!fs.existsSync(frag) || readText(frag) !== newText) files.set(frag, newText);
  }
  for (const r of ca.regions) {
    if (!us.regions.some((x) => x.name === r.name)) throw new Error(`region ${r.name} exists in canada/main.js but not in us/main.js`);
  }
  for (const name of deleted) {
    if (us.regions.some((r) => r.name === name) || ca.regions.some((r) => r.name === name)) {
      throw new Error(`region ${name} was emptied in only one planner`);
    }
    files.set(path.join(fragmentDir, `${name}.js`), null);
  }

  // the country seam facades
  const facadeNames = {};
  for (const c of COUNTRIES) {
    const seamFile = path.join(root, 'src', c, SEAM_FILE);
    const targets = new Map(); // name -> absolute module path
    if (fs.existsSync(seamFile)) {
      for (const [, list, from] of readText(seamFile).matchAll(/^export \{ ([^}]+) \} from '([^']+)';$/gm)) {
        for (const name of list.split(',').map((x) => x.trim())) targets.set(name, path.resolve(path.dirname(seamFile), from));
      }
    }
    facade[c].forEach((target, name) => targets.set(name, target));
    facadeNames[c] = [...targets.keys()].sort();
    if (!targets.size) continue;
    const byModule = new Map();
    for (const [name, target] of targets) {
      if (!byModule.has(target)) byModule.set(target, []);
      byModule.get(target).push(name);
    }
    const lines = [...byModule]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([target, names]) => `export { ${names.sort().join(', ')} } from '${relImport(seamFile, target)}';`);
    const text = `${lines.join('\n')}\n`;
    if (!fs.existsSync(seamFile) || readText(seamFile) !== text) files.set(seamFile, text);
  }
  if (JSON.stringify(facadeNames.us) !== JSON.stringify(facadeNames.canada)) {
    throw new Error(`the country seam facades differ: us exports ${facadeNames.us.join(', ')}; canada exports ${facadeNames.canada.join(', ')}`);
  }

  // ---- 6. verify the result
  for (const c of COUNTRIES) {
    const text = files.get(info[c].file);
    const bad = undeclaredNames(text);
    if (bad.length) throw new Error(`${c}/main.js: undeclared names after the move: ${bad.map((b) => `${b.name} (line ${b.line})`).join(', ')}`);
    const after = analyze(text).units.length;
    if (after !== info[c].units.length - moduleOf[c].size) {
      throw new Error(`${c}/main.js: expected ${info[c].units.length - moduleOf[c].size} units after the move, found ${after}`);
    }
  }

  if (!dryRun) {
    const staged = [];
    try {
      for (const [file, text] of files) {
        if (text === null) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.extract-tmp`, text);
        staged.push(file);
      }
    } catch (err) {
      staged.forEach((file) => fs.rmSync(`${file}.extract-tmp`, { force: true }));
      throw err;
    }
    staged.forEach((file) => fs.renameSync(`${file}.extract-tmp`, file));
    for (const [file, text] of files) if (text === null) fs.rmSync(file, { force: true });
  }
  return {
    modules: modules.map((m) => ({
      path: m.path,
      owner: m.owner,
      units: (m.owner === 'shared' ? m.units.us : m.units[m.owner]).length,
      exports: [...exportsNeeded.get(m)].sort(),
    })),
    moved: Object.fromEntries(COUNTRIES.map((c) => [c, moduleOf[c].size])),
    deletedRegions: [...deleted].sort(),
    seam: facadeNames,
    warnings,
  };
}

module.exports = { applyModules };
