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
// Side-effect statements move only inside a wiring function (below). Everything is verified before anything is written; on any problem it
// throws and writes nothing (the files are staged next to their targets and renamed into place at the end).
//
// Country seam (spec section 14): a shared module may use a country unit only through the names listed in `seam`.
// It imports each one from its own facade, '#country/core/seam-<name>', and each country gets one facade per name,
// src/<country>/core/seam-<name>.js, that re-exports that name from the module that holds it. One facade per name
// (not one for all) keeps a shared module from reaching every country module the seam names, which made import
// cycles. Both countries must have facades for the same names.
//
// Stage 4 (design section 5.1): a module may carry `wiring: [{ name, statements: { <country>: [label] } }]` (its runs) and
// `splits: [{ name, label }]`. Each run's statements (with their carried comment lines) become the body of
// `export function <name>() { ... }`, indented two more spaces, after the module's declarations; main.js gets `<name>();`
// where the run's first statement stood, and imports it. A split declaration is written as `let <name>;` and the statement
// `<name> = <init>;` (the split's label in the run) stands at its position in the run. A side-effect statement moves only
// as part of its module's wiring, and only if it can live in a function body unchanged (functionBodyProblem).
//
// Stage 4 (design sections 5.2, 5.3, 5.6), options `seamSides`, `wiringRecord`, `pinned`:
// - `seamSides` ({ <name>: 'ui' | 'core' }, core when absent) puts a seam name's facades under src/<country>/<side>/, imported
//   as '#country/<side>/seam-<name>'; both countries must have the same facades in core/ and in ui/.
// - A module import cycle is accepted only when every module in it is under a ui/ directory and passes the load-time guard
//   (checkLoadTime, with the names it imports from its cycle partners); otherwise it is refused.
// - A shared region whose remaining lines are blank lines, comments, wiring calls (`<name>();`, <name> in `wiringRecord`
//   ([{ name, module }], every batch up to this one) and imported into main.js from a ui/ module) and statements whose label is
//   in `pinned` (the topics file's `main` lists) is emptied: its markers and fragment go, its lines stay in main.js. Shape
//   alone never counts. Its remaining text must be identical in both planners (checked before the markers go).
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const { analyze, undeclaredNames } = require('../analyze-closure');
const { checkLoadTime } = require('./load-time');

const COUNTRIES = ['us', 'canada'];
const SHARED_MARK = /^\s*\/\/ @@shared:(\S+) (begin|end)\s*$/;
const DATA_END = /^\s*\/\/ ([A-Z][A-Z_]*):end\s*$/;
const posix = (p) => p.split(path.sep).join('/');

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

// The top-level statements of main.js's IIFE, by first line (the analyzer's units carry no syntax tree).
function iifeNodes(text) {
  const ast = espree.parse(text, { ecmaVersion: 2022, sourceType: 'module', range: true, loc: true });
  for (const node of ast.body) {
    const call = node.type === 'ExpressionStatement' ? node.expression : null;
    if (call && call.type === 'CallExpression' && /^(Arrow)?FunctionExpression$/.test(call.callee.type) && call.callee.body.type === 'BlockStatement') {
      return new Map(call.callee.body.body.map((n) => [n.loc.start.line, n]));
    }
  }
  return new Map();
}

// Why a statement cannot become part of a function body unchanged (design section 5.1), or null. Outside nested functions:
// return, break / continue not of a loop or switch inside the statement, await, yield, a label, var, a statement-level
// function or class declaration; outside nested non-arrow functions: this, arguments (an arrow does not bind them);
// anywhere: a string or template literal over several lines (re-indenting would change its value).
const LOOPS = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);
function functionBodyProblem(root) {
  let found = null;
  const visit = (n, ctx, isName) => {
    if (found || !n || typeof n.type !== 'string') return;
    if (n.type === 'Literal' && typeof n.value === 'string' && n.raw.includes('\n')) return void (found = 'multi-line literal');
    if (n.type === 'TemplateElement' && n.value.raw.includes('\n')) return void (found = 'multi-line literal');
    if (ctx.fn === 0) {
      if (n.type === 'ReturnStatement') return void (found = 'return');
      if (n.type === 'BreakStatement' && (n.label || !(ctx.loop || ctx.sw))) return void (found = 'break');
      if (n.type === 'ContinueStatement' && (n.label || !ctx.loop)) return void (found = 'continue');
      if (n.type === 'AwaitExpression' || (n.type === 'ForOfStatement' && n.await)) return void (found = 'await');
      if (n.type === 'YieldExpression') return void (found = 'yield');
      if (n.type === 'LabeledStatement') return void (found = 'label');
      if (n.type === 'VariableDeclaration' && n.kind === 'var') return void (found = 'var');
      if (n.type === 'FunctionDeclaration') return void (found = 'function declaration');
      if (n.type === 'ClassDeclaration') return void (found = 'class declaration');
    }
    if (ctx.nonArrow === 0) {
      if (n.type === 'ThisExpression') return void (found = 'this');
      if (n.type === 'Identifier' && n.name === 'arguments' && !isName) return void (found = 'arguments');
    }
    let next = ctx;
    if (/Function/.test(n.type)) next = { fn: ctx.fn + 1, nonArrow: n.type === 'ArrowFunctionExpression' ? ctx.nonArrow : ctx.nonArrow + 1, loop: 0, sw: 0 };
    else if (n.type === 'PropertyDefinition' || n.type === 'StaticBlock') next = { fn: ctx.fn + 1, nonArrow: ctx.nonArrow + 1, loop: 0, sw: 0 };
    else if (LOOPS.has(n.type)) next = { ...ctx, loop: ctx.loop + 1 };
    else if (n.type === 'SwitchStatement') next = { ...ctx, sw: ctx.sw + 1 };
    for (const key of Object.keys(n)) {
      if (key === 'range' || key === 'loc' || key === 'parent') continue;
      // a property name (x.arguments, { arguments: 1 }) is not a reference
      const name = !n.computed && ((key === 'property' && n.type === 'MemberExpression') || (key === 'key' && /^(Property|PropertyDefinition|MethodDefinition)$/.test(n.type)));
      const v = n[key];
      if (Array.isArray(v)) v.forEach((x) => visit(x, next, false));
      else if (v && typeof v === 'object') visit(v, next, name);
    }
  };
  visit(root, { fn: 0, nonArrow: 0, loop: 0, sw: 0 }, false);
  return found;
}

// "    x" -> "      x"; a blank line stays as it is (no trailing spaces are added)
const indentTwo = (line) => (line.trim() === '' ? line : `  ${line}`);
const leadingSpace = (line) => /^\s*/.exec(line)[0];

function loadCountry(root, country) {
  const file = path.join(root, 'src', country, 'main.js');
  const text = readText(file);
  const lines = text.split('\n');
  const model = analyze(text);
  const nodeAt = iifeNodes(text);
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
  return { country, file, text, lines, model, units, byLabel, chunks, nodeAt, mainDir: path.dirname(file) };
}

// A split declaration (design section 5.1): `let x = <init>;` gives the module `let x;` (its carried comment lines above it)
// and the run the statement `x = <init>;`, indented two more spaces. Returns { declLines, assignLines, init }.
function splitParts(info, u, name, where) {
  const node = info.nodeAt.get(u.startLine);
  const d = node && node.declarations && node.declarations[0];
  if (!node || node.type !== 'VariableDeclaration' || node.kind !== 'let' || node.declarations.length !== 1 || d.id.type !== 'Identifier' || d.id.name !== name || !d.init) {
    throw new Error(`${where}: split ${name} is not a one-name \`let ${name} = <init>;\``);
  }
  const lineStart = info.text.lastIndexOf('\n', node.range[0] - 1) + 1;
  const lineEnd = info.text.indexOf('\n', node.range[1]);
  const indent = info.text.slice(lineStart, node.range[0]);
  const tail = info.text.slice(node.range[1], lineEnd < 0 ? info.text.length : lineEnd);
  if (indent.trim() !== '' || tail.trim() !== '') throw new Error(`${where}: split ${name} shares its lines with other text`);
  if (info.text.slice(d.init.range[1], node.range[1]).trim() !== ';') throw new Error(`${where}: split ${name} does not end with ";" right after its initializer (no ASI, no parentheses around it)`);
  const assign = `${name} = ${info.text.slice(d.init.range[0], d.init.range[1])};`.split('\n');
  const assignLines = assign.map((l, i) => (i === 0 ? `${indent}  ${l}` : indentTwo(l)));
  const { start, end } = info.chunks.get(u.label);
  const declLines = [...info.lines.slice(start - 1, u.startLine - 1), `${indent}let ${name};`, ...info.lines.slice(u.endLine, end)];
  return { declLines, assignLines, init: d.init };
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

const SEAM_PREFIX = 'seam:'; // a need keyed `seam:<name>` is imported from that name's facade
const seamKey = (name) => `${SEAM_PREFIX}${name}`;
const SEAM_FACADE = /^seam-(.+)\.js$/;
const SEAM_DIRS = ['core', 'ui'];
const seamFacadeFile = (root, c, side, name) => path.join(root, 'src', c, side, `seam-${name}.js`);
const isUiPath = (p) => /^src\/[^/]+\/ui\//.test(posix(p));

// A path from a strongly connected set of modules back to its first one, for the error text: a -> b -> a.
function cyclePath(comp, edges) {
  const inComp = new Set(comp);
  const start = comp[0];
  const seen = new Set();
  const find = (m, trail) => {
    for (const t of edges.get(m)) {
      if (t === start) return [...trail, m, t];
      if (!inComp.has(t) || seen.has(t)) continue;
      seen.add(t);
      const p = find(t, [...trail, m]);
      if (p) return p;
    }
    return null;
  };
  return find(start, []) || [start, start];
}

function applyModules(root, modules, { dryRun = false, seam = [], seamSides = {}, wiringRecord = [], pinned = [] } = {}) {
  const seamSet = new Set(seam);
  const sideOf = (name) => (seamSides[name] === 'ui' ? 'ui' : 'core');
  const recordNames = new Set(wiringRecord.map((w) => w.name));
  const pinnedSet = new Set(pinned);
  const facade = { us: new Map(), canada: new Map() }; // seam name -> absolute path of the module that holds it
  const info = Object.fromEntries(COUNTRIES.map((c) => [c, loadCountry(root, c)]));
  const warnings = [];
  const files = new Map(); // absolute path -> text (null = delete)

  // ---- 1. which module takes which unit, per country
  const moduleOf = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()]));
  const seenPaths = new Set();
  // per module and country: the runs (wiring entries with statements there), and the split declarations by label
  const runsOf = new Map(); // module -> { us: [{ name, labels }], canada: [...] }
  const splitOf = new Map(); // module -> { us: Map(split label -> { name, decl, parts }), canada: ... }
  const splitDecl = Object.fromEntries(COUNTRIES.map((c) => [c, new Map()])); // declaration label -> its splitParts
  const wiringNames = new Set();
  for (const m of modules) {
    if (seenPaths.has(m.path)) throw new Error(`module path used twice: ${m.path}`);
    seenPaths.add(m.path);
    if (!path.resolve(root, m.path).startsWith(path.join(root, 'src') + path.sep)) throw new Error(`${m.path}: module paths must lie under src/`);
    if (fs.existsSync(path.join(root, m.path))) throw new Error(`${m.path} already exists`);
    const countries = m.owner === 'shared' ? COUNTRIES : [m.owner];
    const wiring = m.wiring || [];
    const splits = m.splits || []; // never from bindings.colocated: the module's own `splits` entry is the record
    if ((wiring.length || splits.length) && !/^src\/[^/]+\/ui\//.test(posix(m.path))) {
      throw new Error(`${m.path}: wiring functions live only in ui/ modules`);
    }
    if (m.owner === 'shared') {
      for (const w of wiring) {
        if (JSON.stringify((w.statements || {}).us || []) !== JSON.stringify((w.statements || {}).canada || [])) {
          throw new Error(`wiring of ${m.path} differs between the two planners (${w.name})`);
        }
      }
    }
    const perCountry = {};
    const splitsHere = {};
    for (const c of countries) {
      const runs = [];
      const inWiring = new Set();
      const splitLabels = new Map(splits.map((s) => [s.label, s.name]));
      for (const w of wiring) {
        const labels = (w.statements && w.statements[c]) || [];
        if (!labels.length) continue;
        if (wiringNames.has(`${c}:${w.name}`)) throw new Error(`wiring function ${w.name} is declared twice in ${c}`);
        wiringNames.add(`${c}:${w.name}`);
        if (splitLabels.has(labels[0])) throw new Error(`${m.path}: the run ${w.name} starts with the split assignment of ${splitLabels.get(labels[0])}`);
        for (const l of labels) {
          if (inWiring.has(l)) throw new Error(`${m.path}: statement ${l} is in two runs`);
          inWiring.add(l);
          if (splitLabels.has(l)) continue;
          if (!m.units[c] || !m.units[c].includes(l)) throw new Error(`${m.path}: wiring statement "${l}" is not a statement of the module (${c})`);
        }
        runs.push({ name: w.name, labels });
      }
      perCountry[c] = runs;
      const byLabel = new Map();
      for (const s of splits) {
        if (!inWiring.has(s.label)) throw new Error(`${m.path}: the split assignment of ${s.name} is in no run (${c})`);
        const decl = (m.units[c] || []).map((l) => info[c].byLabel.get(l)).find((u) => u && u.kind === 'let' && u.names.includes(s.name));
        if (!decl) throw new Error(`${m.path}: split ${s.name} has no \`let\` declaration among the module's units (${c})`);
        const parts = splitParts(info[c], decl, s.name, m.path);
        const problem = functionBodyProblem(parts.init);
        if (problem) throw new Error(`statement ${s.label} cannot move into a function body: ${problem}`);
        byLabel.set(s.label, { name: s.name, decl, parts });
        splitDecl[c].set(decl.label, parts);
      }
      splitsHere[c] = byLabel;
      for (const label of m.units[c] || []) {
        const u = info[c].byLabel.get(label);
        if (!u || u.kind !== 'statement') continue;
        if (!inWiring.has(label)) throw new Error(`${m.path}: "${label}" is a side-effect statement`);
        const problem = functionBodyProblem(info[c].nodeAt.get(u.startLine));
        if (problem) throw new Error(`statement ${label} cannot move into a function body: ${problem}`);
      }
    }
    runsOf.set(m, perCountry);
    splitOf.set(m, splitsHere);
    for (const c of countries) {
      if (!m.units[c] || !m.units[c].length) throw new Error(`${m.path}: no units for ${c}`);
      for (const label of m.units[c]) {
        const u = info[c].byLabel.get(label);
        if (!u) throw new Error(`${m.path}: ${c} has no unit "${label}"`);
        if (moduleOf[c].has(label)) throw new Error(`${c}: unit "${label}" is in two modules`);
        if (m.owner === 'shared' && u.regionKind !== 'shared') throw new Error(`${m.path}: "${label}" is not in a shared region`);
        moduleOf[c].set(label, m);
      }
    }
  }

  // A run must be what the planner makes (design section 5.1), whatever the manifest says: its statements in source order
  // (a split assignment counts at its declaration's line), and no other statement (one staying in main.js, or another
  // module's, or another split assignment) between its first and last line. Declarations in between are fine.
  for (const c of COUNTRIES) {
    for (const m of modules) {
      for (const run of runsOf.get(m)[c] || []) {
        const splitsHere = splitOf.get(m)[c];
        const where = `${m.path}: run ${run.name} (${run.labels.join(', ')})`;
        const lines = run.labels.map((l) => (splitsHere.has(l) ? splitsHere.get(l).decl.startLine : info[c].byLabel.get(l).startLine));
        for (let i = 1; i < lines.length; i++) {
          if (lines[i] <= lines[i - 1]) throw new Error(`${where} is not in source order in ${c}/main.js (${run.labels[i]} stands before ${run.labels[i - 1]})`);
        }
        const own = new Set(run.labels);
        run.labels.forEach((l) => splitsHere.has(l) && own.add(splitsHere.get(l).decl.label));
        const between = info[c].units.find(
          (u) => u.startLine > lines[0] && u.startLine < lines[lines.length - 1] && !own.has(u.label) && (u.kind === 'statement' || splitDecl[c].has(u.label)),
        );
        if (between) throw new Error(`${where}: the statement ${between.label} (${c}/main.js line ${between.startLine}) stands between its statements`);
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
              addNeed(m, c, seamKey(name), name, name);
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
            addNeed(m, c, seamKey(local), local, local);
            continue;
          }
          addNeed(m, c, abs, local, imp.imported);
        }
      }
    }
  }
  // a wiring name must not clash with a top-level name of main.js (what stays, its imports, what it now imports) or of the
  // module (its declarations and imports)
  for (const m of modules) {
    for (const c of COUNTRIES) {
      const runs = runsOf.get(m)[c] || [];
      if (!runs.length) continue;
      const mainNames = new Set(info[c].model.imports.map((i) => i.local));
      info[c].units.filter((u) => !moduleOf[c].has(u.label)).forEach((u) => u.names.forEach((n) => mainNames.add(n)));
      mainImports[c].forEach((names) => names.forEach((n) => mainNames.add(n)));
      const moduleNames = new Set();
      m.units[c].forEach((l) => info[c].byLabel.get(l).names.forEach((n) => moduleNames.add(n)));
      (needs.get(m)?.[c] || new Map()).forEach((names) => names.forEach((_, local) => moduleNames.add(local)));
      for (const run of runs) {
        if (moduleNames.has(run.name)) throw new Error(`${m.path}: wiring function ${run.name} clashes with a top-level name of the module`);
        if (mainNames.has(run.name)) throw new Error(`${m.path}: wiring function ${run.name} clashes with a top-level name of ${c}/main.js`);
      }
    }
  }
  // main.js calls each wiring function, so it imports it
  for (const m of modules) {
    for (const c of COUNTRIES) {
      for (const run of runsOf.get(m)[c] || []) {
        const key = path.join(root, m.path);
        if (!mainImports[c].has(key)) mainImports[c].set(key, new Set());
        mainImports[c].get(key).add(run.name);
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

  // the module import graph (a seam name's facade is a pass-through to the module that holds it); its cycles are checked
  // once the module texts exist (below)
  const edges = new Map(modules.map((m) => [m, new Set()]));
  const importedFrom = new Map(modules.map((m) => [m, new Map()])); // module -> Map(target module -> Set(local names))
  for (const m of modules) {
    for (const c of m.owner === 'shared' ? COUNTRIES : [m.owner]) {
      for (const [target, names] of needs.get(m)?.[c] || new Map()) {
        const file = target.startsWith(SEAM_PREFIX) ? facade[c].get(target.slice(SEAM_PREFIX.length)) : target;
        const t = modules.find((x) => path.join(root, x.path) === file);
        if (!t || t === m) continue;
        edges.get(m).add(t);
        if (!importedFrom.get(m).has(t)) importedFrom.get(m).set(t, new Set());
        names.forEach((_, local) => importedFrom.get(m).get(t).add(local));
      }
    }
  }

  // ---- 4. write the modules
  for (const m of modules) {
    const c0 = m.owner === 'shared' ? 'us' : m.owner;
    const abs = path.join(root, m.path);
    const importLines = [];
    const byTarget = needs.get(m)?.[c0] || new Map();
    for (const [target, names] of [...byTarget].sort((a, b) => a[0].localeCompare(b[0]))) {
      const specs = [...names].map(([local, imported]) => ({ local, imported })).sort((a, b) => a.local.localeCompare(b.local));
      const source = target.startsWith(SEAM_PREFIX)
        ? `#country/${sideOf(target.slice(SEAM_PREFIX.length))}/seam-${target.slice(SEAM_PREFIX.length)}`
        : target.startsWith('bare:') ? target.slice(5) : relImport(abs, target);
      importLines.push(importLine(specs, source));
    }
    const bodyOf = (c) => {
      const body = [];
      for (const label of m.units[c]) {
        const u = info[c].byLabel.get(label);
        if (u.kind === 'statement') continue; // written in its wiring function below
        let lines = splitDecl[c].has(label) ? splitDecl[c].get(label).declLines : chunkLines(info[c], label);
        if (u.names.some((n) => exportsNeeded.get(m).has(n))) lines = addExport(lines);
        body.push(...lines);
      }
      for (const run of runsOf.get(m)[c] || []) {
        const first = chunkLines(info[c], run.labels[0])[0];
        const indent = leadingSpace(first);
        body.push(`${indent}export function ${run.name}() {`);
        for (const label of run.labels) {
          const split = splitOf.get(m)[c].get(label);
          if (split) body.push(...split.parts.assignLines);
          else body.push(...chunkLines(info[c], label).map(indentTwo));
        }
        body.push(`${indent}}`);
      }
      return body;
    };
    const body = bodyOf(c0);
    if (m.owner === 'shared' && bodyOf('canada').join('\n') !== body.join('\n')) {
      throw new Error(`${m.path}: the module text differs between the two planners`);
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

  // module import cycles (Tarjan): accepted only when every module is under ui/ and each passes the load-time guard with the
  // names it imports from the other modules of the cycle (design section 5.3)
  {
    const index = new Map();
    const low = new Map();
    const stack = [];
    const onStack = new Set();
    const comps = [];
    const visit = (v) => {
      index.set(v, index.size);
      low.set(v, index.get(v));
      stack.push(v);
      onStack.add(v);
      for (const w of edges.get(v)) {
        if (!index.has(w)) {
          visit(w);
          low.set(v, Math.min(low.get(v), low.get(w)));
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      }
      if (low.get(v) !== index.get(v)) return;
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) comps.push(comp.sort((a, b) => modules.indexOf(a) - modules.indexOf(b)));
    };
    modules.forEach((m) => index.has(m) || visit(m));
    for (const comp of comps) {
      const where = `module import cycle: ${cyclePath(comp, edges).map((x) => x.path).join(' -> ')}`;
      if (!comp.every((m) => isUiPath(m.path))) throw new Error(`${where} (not every module of the cycle is under ui/)`);
      const problems = [];
      for (const m of comp) {
        const cyclePartners = new Set();
        for (const [t, locals] of importedFrom.get(m)) if (t !== m && comp.includes(t)) locals.forEach((n) => cyclePartners.add(n));
        for (const p of checkLoadTime(files.get(path.join(root, m.path)), { cyclePartners })) {
          problems.push(`${m.path} line ${p.line}: ${p.name ? `${p.name}: ` : ''}${p.why}`);
        }
      }
      if (problems.length) throw new Error(`${where}; load-time guard: ${problems.join('; ')}`);
    }
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
    // each run leaves `<name>();` where its first statement's chunk started, with that chunk's indentation
    const calls = new Map(); // line -> call text
    for (const m of modules) {
      for (const run of runsOf.get(m)[c] || []) {
        const { start } = ci.chunks.get(run.labels[0]);
        calls.set(start, `${leadingSpace(ci.lines[start - 1])}${run.name}();`);
      }
    }
    const out = [];
    ci.lines.forEach((line, i) => {
      const n = i + 1;
      if (n === insertAt) out.push(...importBlock);
      if (calls.has(n)) out.push(calls.get(n));
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
  // Which regions of a planner's new main.js are emptied: every statement in it a wiring call or pinned, no declaration,
  // and every other line blank or a comment (design section 5.6).
  const emptiable = (c, text, lines, regions) => {
    const model = analyze(text);
    const nodeAt = iifeNodes(text);
    const fromUi = new Set();
    for (const imp of model.imports) {
      const spec = imp.source;
      const ui = spec.startsWith('#country/ui/') || (spec.startsWith('.') && isUiPath(path.relative(root, path.resolve(info[c].mainDir, spec))));
      if (ui && imp.imported === imp.local) fromUi.add(imp.local);
    }
    const isWiringCall = (u) => {
      const node = nodeAt.get(u.startLine);
      const call = node && node.type === 'ExpressionStatement' ? node.expression : null;
      if (!call || call.type !== 'CallExpression' || call.optional || call.arguments.length || call.callee.type !== 'Identifier') return false;
      const name = call.callee.name;
      return text.slice(node.range[0], node.range[1]) === `${name}();` && recordNames.has(name) && fromUi.has(name);
    };
    const out = new Set();
    for (const r of regions) {
      // lines are 0-based here; units are 1-based: the content is lines r.contentStart .. r.end - 1
      const inside = model.units.filter((u) => u.startLine - 1 >= r.contentStart && u.startLine - 1 < r.end);
      if (!inside.every((u) => u.kind === 'statement' && (pinnedSet.has(u.label) || isWiringCall(u)))) continue;
      const covered = new Set();
      inside.forEach((u) => { for (let n = u.startLine - 1; n < u.endLine; n++) covered.add(n); });
      let inBlock = false;
      let ok = true;
      for (let i = r.contentStart; i < r.end && ok; i++) {
        if (covered.has(i)) continue;
        const l = lines[i];
        if (inBlock) inBlock = !/\*\//.test(l);
        else if (/^\s*\/\*/.test(l)) inBlock = !/\*\/\s*$/.test(l);
        else ok = l.trim() === '' || /^\s*\/\//.test(l);
      }
      if (ok && !inBlock) out.add(r.name);
    }
    return out;
  };
  const parsedMain = Object.fromEntries(COUNTRIES.map((c) => [c, regionsOf(mainText[c])]));
  const emptied = Object.fromEntries(COUNTRIES.map((c) => [c, emptiable(c, mainText[c], parsedMain[c].lines, parsedMain[c].regions)]));
  // the text that stays must read the same in both planners, checked before any marker is removed
  for (const name of emptied.us) {
    if (!emptied.canada.has(name)) continue; // emptied in one planner only: refused below
    const contentOf = (c) => {
      const r = parsedMain[c].regions.find((x) => x.name === name);
      return parsedMain[c].lines.slice(r.contentStart, r.end).join('\n');
    };
    if (contentOf('us') !== contentOf('canada')) {
      throw new Error(`region ${name}: the text left after the move differs between the two planners, so it cannot be emptied`);
    }
  }
  for (const c of COUNTRIES) {
    const { lines, regions } = parsedMain[c];
    const removeLine = new Set();
    for (const r of regions) {
      if (!emptied[c].has(r.name)) continue;
      removeLine.add(r.begin); // only the markers go: what is left stays in main.js
      removeLine.add(r.end);
      deleted.add(r.name);
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

  // the country seam facades: one file per name, under core/ or ui/ by the name's side (design section 5.2)
  for (const [name, side] of Object.entries(seamSides)) {
    if (side !== 'ui' && side !== 'core') throw new Error(`seam name ${name}: unknown side "${side}" (ui or core)`);
  }
  const facadeNames = {};
  const facadeKeys = {}; // '<side>/<name>', for the equality check over both directories
  for (const c of COUNTRIES) {
    const keys = new Set([...facade[c].keys()].map((name) => `${sideOf(name)}/${name}`));
    for (const side of SEAM_DIRS) {
      const dir = path.join(root, 'src', c, side);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const hit = SEAM_FACADE.exec(f);
        if (hit) keys.add(`${side}/${hit[1]}`);
      }
    }
    for (const [name, target] of facade[c]) {
      const side = sideOf(name);
      const other = seamFacadeFile(root, c, side === 'ui' ? 'core' : 'ui', name);
      if (fs.existsSync(other)) throw new Error(`seam name ${name}: its facade goes under ${side}/ but ${posix(path.relative(root, other))} exists`);
      const seamFile = seamFacadeFile(root, c, side, name);
      const text = `export { ${name} } from '${relImport(seamFile, target)}';\n`;
      if (!fs.existsSync(seamFile) || readText(seamFile) !== text) files.set(seamFile, text);
    }
    facadeKeys[c] = [...keys].sort();
    facadeNames[c] = [...new Set(facadeKeys[c].map((k) => k.slice(k.indexOf('/') + 1)))].sort();
  }
  if (JSON.stringify(facadeKeys.us) !== JSON.stringify(facadeKeys.canada)) {
    throw new Error(`the country seam facades differ: us exports ${facadeKeys.us.join(', ')}; canada exports ${facadeKeys.canada.join(', ')}`);
  }

  // ---- 6. verify the result
  for (const c of COUNTRIES) {
    const text = files.get(info[c].file);
    const bad = undeclaredNames(text);
    if (bad.length) throw new Error(`${c}/main.js: undeclared names after the move: ${bad.map((b) => `${b.name} (line ${b.line})`).join(', ')}`);
    const after = analyze(text).units.length;
    // before - moved + runs: each run leaves one call statement behind
    const runs = modules.reduce((n, m) => n + (runsOf.get(m)[c] || []).length, 0);
    const expected = info[c].units.length - moduleOf[c].size + runs;
    if (after !== expected) {
      throw new Error(`${c}/main.js: expected ${expected} units after the move, found ${after}`);
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
    // the runs actually written (a manifest entry with no statements writes nothing)
    wiring: modules.flatMap((m) => [...new Set(COUNTRIES.flatMap((c) => (runsOf.get(m)[c] || []).map((r) => r.name)))].map((name) => ({ name, module: m.path }))),
    deletedRegions: [...deleted].sort(),
    seam: facadeNames,
    warnings,
  };
}

module.exports = { applyModules, functionBodyProblem }; // functionBodyProblem: for tests (top-level break does not parse)
