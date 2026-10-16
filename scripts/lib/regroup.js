'use strict';
// Renames, merges and moves modules under src/ (stage 4 design section 5.8).
//
// regroup(root, operations, { dryRun }) applies a map's operations in order to a staged copy of src/ (in memory):
//   { rename: '<old>', to: '<new>' }            move the file; rewrite every import of it (relative specifiers and the
//                                              facades' `export ... from`); refused when the target exists in the staged
//                                              state (so a rename onto a path an earlier operation freed is fine)
//   { merge: ['<a>', '<b>', ...], to: '<p>' }  one module from several: imports merged and deduplicated (relative
//                                              specifiers recomputed for the target's directory), bodies in dependency
//                                              order among the sources (ties: the map's order); the members of one import
//                                              cycle keep the map's order and must each pass the load-time guard with
//                                              their cycle partners. An existing target may be listed among the sources
//                                              (its position sets where its body goes, never duplicated); an existing
//                                              target that is not listed keeps its body first. The sources' purpose
//                                              comments are dropped; an existing target keeps its own.
//   { move: '<name>', from: '<p>', to: '<q>' } one top-level declaration, with its contiguous comment block, cut from
//                                              `from` and appended to `to` (created if missing); `export` added or
//                                              removed as uses require, imports rewritten in every file that used it; a
//                                              source left with no declarations is deleted.
// Name clashes are refused (`name clash: <name> in <path>`): one top-level name declared twice, or a declaration sharing
// its name with an import binding of the same file. A mutable binding moves only with every writer; nothing moves into
// core/ that uses a browser global, a DOM method or a ui/ module.
//
// After every operation, on the staged result: the facade-side rule (a seam name's facades sit under ui/ in both countries
// when either country's target is under ui/, else under core/; an operation that changes a target's side moves the
// facades in both countries and rewrites every '#country/<side>/seam-<name>' specifier), core/ purity
// (tests/core_purity.js's rules) on every core/ file, no relative import across the shared/country boundary, the import
// graph of each country (scripts/lib/module-graph.js): no cycle with a member outside ui/, the load-time guard
// (scripts/lib/load-time.js, the same rule as tests/ui_cycles.js: inCycle for cycle members) on every ui/ module, no
// undeclared name (tests/closure_names.js's check) and no initializer reading a binding declared later in the file, in
// every touched file, and a bundle of both planners (esbuild, written into a directory from
// fs.mkdtempSync(os.tmpdir()/regroup-), removed afterwards) whose module order gives the order in which the
// `// load-time:` declarations initialize; every change against the order before the operation is reported.
// Any failure refuses the whole map: an Error `op <i> (<operation>): <problem>`, and nothing is written.
//
// Outside src/: exact module path strings in tests/state_modules.js, CLAUDE.md and the region maps
// (docs/superpowers/inventory/stage{2,3,4}-region-map.md) follow every rename and merge; a name tests/state_modules.js
// reads from a module counts as an importer of it before an export is removed (a move that leaves the test reading the
// old module is reported as a note); and a generated rule doc (scripts/gen-*-rules.js, which record the path of the
// module holding their data block) whose source path changed is reported as `regenerate: npm run <script>`.
//
// Writes are staged (`<file>.regroup-tmp`, renamed into place at the end), like scripts/lib/extract-units.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const espree = require('espree');
const eslintScope = require('eslint-scope');
const { undeclaredNames, domGlobalsUsed, DOM_GLOBALS, DOM_METHODS, stripComments } = require('../analyze-closure');
const { checkLoadTime, loadTimeMarker, isInert, referencedNames } = require('./load-time');
const { buildGraph, cycles } = require('./module-graph');

const ECMA = 2022;
const COUNTRIES = ['us', 'canada'];
const STATE_MODULES = 'tests/state_modules.js';
const OUTSIDE = [
  STATE_MODULES,
  'CLAUDE.md',
  'docs/superpowers/inventory/stage2-region-map.md',
  'docs/superpowers/inventory/stage3-region-map.md',
  'docs/superpowers/inventory/stage4-region-map.md',
];
// a data-block marker line, `// NAME:begin` or `// NAME:end` (the form scripts/analyze-closure.js, scripts/lib/extract-units.js
// and scripts/lib/marker-source.js read; the generators evaluate what lies between the two)
const DATA_MARK = /^\s*\/\/ ([A-Z][A-Z_]*):(begin|end)\s*$/;
const IMPORT_SOURCE = /(?:from|import)\s*['"]([^'"]+)['"]/g;
const SEAM_FILE = /^src\/(us|canada)\/(core|ui)\/seam-([^/]+)\.js$/;

const pp = path.posix;
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const segments = (rel) => rel.split('/');
const isUi = (rel) => segments(rel).slice(1, -1).includes('ui');
const isCore = (rel) => segments(rel).slice(1, -1).includes('core');
const isMain = (rel) => /^src\/(us|canada)\/main\.js$/.test(rel);
const countriesOf = (rel) => (rel.startsWith('src/us/') ? ['us'] : rel.startsWith('src/canada/') ? ['canada'] : COUNTRIES);
const ownerOf = (rel) => (rel.startsWith('src/us/') ? 'us' : rel.startsWith('src/canada/') ? 'canada' : rel.startsWith('src/shared/') ? 'shared' : 'other');
function relSpec(fromRel, toRel) {
  const r = pp.relative(pp.dirname(fromRel), toRel);
  return r.startsWith('.') ? r : `./${r}`;
}
// the files a specifier of `fromRel` names: one for a relative specifier, one per country for '#country/...', none for a
// bare package
function targetsOf(fromRel, spec) {
  if (spec.startsWith('.')) return [pp.normalize(pp.join(pp.dirname(fromRel), spec))];
  if (spec.startsWith('#country/')) return countriesOf(fromRel).map((c) => `src/${c}/${spec.slice('#country/'.length)}.js`);
  return [];
}
const keyOf = (fromRel, spec) => (spec.startsWith('.') ? `f:${targetsOf(fromRel, spec)[0]}` : `s:${spec}`);
const specForKey = (rel, key) => (key.startsWith('f:') ? relSpec(rel, key.slice(2)) : key.slice(2));

class Refusal extends Error {}
const refuse = (msg) => {
  throw new Refusal(msg);
};

const parseCache = new Map();
function parse(text, rel) {
  if (parseCache.has(text)) return parseCache.get(text);
  let ast;
  try {
    ast = espree.parse(text, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  } catch (e) {
    refuse(`${rel}: ${e.message}`);
  }
  if (parseCache.size > 2000) parseCache.clear();
  parseCache.set(text, ast);
  return ast;
}
function applyEdits(text, edits) {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
const isFromDecl = (st) => st.type === 'ImportDeclaration' || ((st.type === 'ExportNamedDeclaration' || st.type === 'ExportAllDeclaration') && st.source);
const specName = (n) => (n.type === 'Identifier' ? n.name : n.value);

// A module's shape: top-level declarations by name, import and re-export declarations, export lists, other statements.
function shapeOf(text, rel) {
  const ast = parse(text, rel);
  const decls = new Map(); // name -> { st, decl, kind, exported, declarator }
  const imports = []; // ImportDeclaration nodes
  const reexports = []; // Export...Declaration nodes with a source
  const exportList = new Set(); // names in `export { a, b };` (no source)
  let statements = 0;
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') {
      imports.push(st);
      continue;
    }
    if ((st.type === 'ExportNamedDeclaration' || st.type === 'ExportAllDeclaration') && st.source) {
      reexports.push(st);
      continue;
    }
    if (st.type === 'ExportNamedDeclaration' && !st.declaration) {
      st.specifiers.forEach((sp) => exportList.add(specName(sp.local)));
      continue;
    }
    const exported = st.type === 'ExportNamedDeclaration';
    const d = exported ? st.declaration : st.type === 'ExportDefaultDeclaration' ? null : st;
    if (!d) {
      statements++;
      continue;
    }
    if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) {
      decls.set(d.id.name, { st, decl: d, kind: d.type === 'FunctionDeclaration' ? 'function' : 'class', exported });
    } else if (d.type === 'VariableDeclaration') {
      for (const x of d.declarations) {
        const names = [];
        const collect = (n) => {
          if (!n) return;
          if (n.type === 'Identifier') names.push(n.name);
          else if (n.type === 'ObjectPattern') n.properties.forEach((p) => collect(p.type === 'RestElement' ? p.argument : p.value));
          else if (n.type === 'ArrayPattern') n.elements.forEach(collect);
          else if (n.type === 'RestElement') collect(n.argument);
          else if (n.type === 'AssignmentPattern') collect(n.left);
        };
        collect(x.id);
        for (const n of names) decls.set(n, { st, decl: d, kind: d.kind, exported, declarator: x, group: d.declarations.length > 1 || names.length > 1 });
      }
    } else statements++;
  }
  const facade = ast.body.length > 0 && ast.body.every((st) => (st.type === 'ExportNamedDeclaration' || st.type === 'ExportAllDeclaration') && st.source);
  const isExported = (name) => (decls.has(name) && decls.get(name).exported) || exportList.has(name);
  return { ast, decls, imports, reexports, exportList, statements, facade, isExported };
}

// The purpose comment: line 1 is a `//` line that does not start with `load-time:`, followed by a blank line.
function purposeLines(text) {
  const lines = text.split('\n');
  if (lines.length >= 2 && /^\s*\/\//.test(lines[0]) && !/^\s*\/\/\s*load-time:/.test(lines[0]) && lines[1].trim() === '') return 2;
  return 0;
}

function renderDecl(st, specs, spec) {
  // specs: [{ kind: 'default' | 'namespace' | 'named', imported, local }] (imports) or [{ local, exported }] (re-exports)
  if (st.type === 'ImportDeclaration') {
    const def = specs.find((s) => s.kind === 'default');
    const ns = specs.find((s) => s.kind === 'namespace');
    const named = specs.filter((s) => s.kind === 'named').map((s) => (s.imported === s.local ? s.local : `${s.imported} as ${s.local}`));
    const parts = [];
    if (def) parts.push(def.local);
    if (ns) parts.push(`* as ${ns.local}`);
    if (named.length) parts.push(`{ ${named.join(', ')} }`);
    return `import ${parts.join(', ')} from '${spec}';`;
  }
  return `export { ${specs.map((s) => (s.local === s.exported ? s.local : `${s.local} as ${s.exported}`)).join(', ')} } from '${spec}';`;
}
function specsOf(st) {
  if (st.type === 'ImportDeclaration') {
    return st.specifiers.map((sp) => ({
      kind: sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? 'namespace' : 'named',
      imported: sp.type === 'ImportSpecifier' ? specName(sp.imported) : sp.type === 'ImportDefaultSpecifier' ? 'default' : '*',
      local: sp.local.name,
      node: sp,
    }));
  }
  if (st.type === 'ExportAllDeclaration') return null;
  return st.specifiers.map((sp) => ({ local: specName(sp.local), exported: specName(sp.exported), node: sp }));
}
// the whole lines a top-level node occupies; refused when it shares a line with other code
function wholeLines(text, node, rel) {
  const before = text.slice(text.lastIndexOf('\n', node.range[0] - 1) + 1, node.range[0]);
  let lineEnd = text.indexOf('\n', node.range[1]);
  if (lineEnd < 0) lineEnd = text.length;
  const after = text.slice(node.range[1], lineEnd);
  if (before.trim() !== '' || (after.trim() !== '' && !/^\s*\/\//.test(after))) refuse(`${rel} line ${node.loc.start.line}: a statement shares its line with other code`);
  return { start: node.loc.start.line, end: node.loc.end.line };
}
// the characters of the whole lines a top-level node occupies (with the line break), for applyEdits
function lineSpan(text, node, rel) {
  wholeLines(text, node, rel);
  const end = text.indexOf('\n', node.range[1]);
  return { start: text.lastIndexOf('\n', node.range[0] - 1) + 1, end: end < 0 ? text.length : end + 1, text: '' };
}
const removeLines = (text, ranges) => {
  const lines = text.split('\n');
  const drop = new Set();
  for (const r of ranges) for (let n = r.start; n <= r.end; n++) drop.add(n);
  return lines.filter((_, i) => !drop.has(i + 1)).join('\n');
};

// Drops the specifiers pred(st, spec) selects from the file's import and re-export declarations; a declaration left with
// none is removed (its whole lines).
function dropSpecifiers(text, rel, pred) {
  const shape = shapeOf(text, rel);
  const edits = [];
  for (const st of [...shape.imports, ...shape.reexports]) {
    const specs = specsOf(st);
    if (!specs || !specs.length) continue;
    const keep = specs.filter((s) => !pred(st, s));
    if (keep.length === specs.length) continue;
    if (!keep.length) edits.push(lineSpan(text, st, rel));
    else edits.push({ start: st.range[0], end: st.range[1], text: renderDecl(st, keep, st.source.value) });
  }
  if (!edits.length) return text;
  return tidyHead(applyEdits(text, edits));
}
// After import lines were removed: no blank line at the top of the file, and one blank line after the purpose comment.
function tidyHead(text) {
  const lines = text.split('\n');
  const at = purposeLines(text) ? 1 : 0;
  let n = at;
  while (n < lines.length - 1 && lines[n].trim() === '') n++;
  lines.splice(at, n - at, ...(at ? [''] : []));
  return lines.join('\n');
}
// Import declarations of one module (by resolved target) that `rewritten` made duplicates are merged into the first.
function mergeDuplicateImports(text, rel, rewritten) {
  const shape = shapeOf(text, rel);
  const byKey = new Map();
  for (const st of shape.imports) {
    const specs = specsOf(st);
    if (!specs.length || specs.some((s) => s.kind !== 'named')) continue;
    const key = keyOf(rel, st.source.value);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(st);
  }
  const edits = [];
  for (const [key, list] of byKey) {
    if (list.length < 2 || !rewritten.has(key)) continue;
    const specs = list.flatMap((st) => specsOf(st));
    edits.push({ start: list[0].range[0], end: list[0].range[1], text: renderDecl(list[0], specs, list[0].source.value) });
    for (const st of list.slice(1)) edits.push(lineSpan(text, st, rel));
  }
  if (!edits.length) return text;
  return applyEdits(text, edits);
}

// Adds import (kind 'import') or re-export (kind 'export') specifiers: needs [{ key, imported, local, kind }]. A
// declaration of the same kind from the same module gets the new specifiers; otherwise a new declaration goes after the
// last import / re-export declaration (or at the top, after the purpose comment, followed by a blank line). Throws a
// name clash when a local is already bound differently.
function addSpecifiers(text, rel, needs) {
  if (!needs.length) return text;
  const shape = shapeOf(text, rel);
  const bound = new Map(); // local -> { key, imported }
  for (const st of shape.imports) for (const s of specsOf(st)) bound.set(s.local, { key: keyOf(rel, st.source.value), imported: s.imported });
  const exportedFrom = new Map(); // exported name -> { key, local }
  for (const st of shape.reexports) for (const s of specsOf(st) || []) exportedFrom.set(s.exported, { key: keyOf(rel, st.source.value), local: s.local });
  const extend = new Map(); // st -> extra specs
  const fresh = new Map(); // kind|key -> specs
  for (const n of needs) {
    if (n.kind === 'export') {
      const had = exportedFrom.get(n.local);
      if (had) {
        if (had.key !== n.key || had.local !== n.imported) refuse(`name clash: ${n.local} in ${rel}`);
        continue;
      }
      exportedFrom.set(n.local, { key: n.key, local: n.imported });
    } else {
      const had = bound.get(n.local);
      if (had) {
        if (had.key !== n.key || had.imported !== n.imported) refuse(`name clash: ${n.local} in ${rel}`);
        continue;
      }
      if (shape.decls.has(n.local)) refuse(`name clash: ${n.local} in ${rel}`);
      bound.set(n.local, { key: n.key, imported: n.imported });
    }
    const list = n.kind === 'export' ? shape.reexports : shape.imports;
    const st = list.find((x) => keyOf(rel, x.source.value) === n.key && x.type !== 'ExportAllDeclaration' && !(specsOf(x) || []).some((s) => s.kind === 'namespace'));
    const spec = n.kind === 'export' ? { local: n.imported, exported: n.local } : { kind: 'named', imported: n.imported, local: n.local };
    if (st) {
      if (!extend.has(st)) extend.set(st, []);
      extend.get(st).push(spec);
    } else {
      const k = `${n.kind}|${n.key}`;
      if (!fresh.has(k)) fresh.set(k, []);
      fresh.get(k).push(spec);
    }
  }
  const edits = [];
  for (const [st, extra] of extend) edits.push({ start: st.range[0], end: st.range[1], text: renderDecl(st, [...specsOf(st), ...extra], st.source.value) });
  let out = applyEdits(text, edits);
  if (!fresh.size) return out;
  const newLines = [...fresh].map(([k, specs]) => {
    const [kind, key] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
    return renderDecl({ type: kind === 'export' ? 'ExportNamedDeclaration' : 'ImportDeclaration' }, specs, specForKey(rel, key));
  });
  const after = shapeOf(out, rel);
  const last = [...after.imports, ...after.reexports].sort((a, b) => a.range[0] - b.range[0]).pop();
  const lines = out.split('\n');
  if (last) {
    lines.splice(last.loc.end.line, 0, ...newLines);
  } else {
    const at = purposeLines(out);
    const rest = lines.slice(at);
    const blank = rest.length && rest[0].trim() !== '' ? [''] : [];
    lines.splice(at, 0, ...newLines, ...blank);
  }
  out = lines.join('\n');
  return out;
}

function setExport(text, rel, name, on) {
  const shape = shapeOf(text, rel);
  const d = shape.decls.get(name);
  if (!d) return text;
  if (on && !shape.isExported(name)) return applyEdits(text, [{ start: d.st.range[0], end: d.st.range[0], text: 'export ' }]);
  if (!on && d.exported) return applyEdits(text, [{ start: d.st.range[0], end: d.decl.range[0], text: '' }]);
  return text;
}

// The statement's lines with its contiguous comment block above it. The walk stops at a data-block marker: an end marker
// belongs to the block above, never to the declaration after it.
function chunkOf(text, rel, st, ast) {
  const lines = text.split('\n');
  const { start: s, end: e } = wholeLines(text, st, rel);
  const idx = ast.body.indexOf(st);
  const floor = idx > 0 ? ast.body[idx - 1].loc.end.line : 0;
  let start = s;
  while (start - 1 > floor) {
    const above = lines[start - 2];
    if (DATA_MARK.test(above)) break;
    if (/^\s*\/\//.test(above)) {
      start--;
      continue;
    }
    if (/^\s*\/\*/.test(above) && /\*\/\s*$/.test(above)) {
      start--;
      continue;
    }
    if (/\*\/\s*$/.test(above)) {
      let k = start - 1;
      while (k > floor && !/\/\*/.test(lines[k - 1])) k--;
      if (k > floor && /^\s*\/\*/.test(lines[k - 1])) {
        start = k;
        continue;
      }
    }
    break;
  }
  // never the purpose comment (it is followed by a blank line, so it is not contiguous; this guards line 1 alone)
  if (start === 1 && purposeLines(text) === 2) start = 3;
  return { start, end: e, lines: lines.slice(start - 1, e) };
}
// The data blocks of a file, [{ name, begin, end }] (1-based lines), and the first marker name that is not paired (a begin
// without its end, an end without its begin, or a begin inside another block), or null.
function dataBlocks(text) {
  const blocks = [];
  let open = null;
  let unpaired = null;
  text.split('\n').forEach((line, i) => {
    const m = DATA_MARK.exec(line);
    if (!m || unpaired) return;
    if (m[2] === 'begin') {
      if (open) unpaired = open.name;
      else open = { name: m[1], begin: i + 1 };
    } else if (!open || open.name !== m[1]) unpaired = m[1];
    else {
      blocks.push({ ...open, end: i + 1 });
      open = null;
    }
  });
  return { blocks, unpaired: unpaired || (open && open.name) || null };
}
const trimBlank = (lines) => {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === '') a++;
  while (b > a && lines[b - 1].trim() === '') b--;
  return lines.slice(a, b);
};
// a blank line between two bodies when the first ends with a comment (it would join the next declaration's comment block)
function joinBodies(bodies) {
  const out = [];
  for (const body of bodies) {
    if (!body.length) continue;
    if (out.length && /^\s*\/\//.test(out[out.length - 1])) out.push('');
    out.push(...body);
  }
  return out;
}

// Tarjan's strongly connected components of `nodes` under `edges` (Map node -> Set).
function scc(nodes, edges) {
  const index = new Map();
  const low = new Map();
  const stack = [];
  const on = new Set();
  const out = [];
  const visit = (v) => {
    index.set(v, index.size);
    low.set(v, index.get(v));
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) || []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const comp = [];
    let w;
    do {
      w = stack.pop();
      on.delete(w);
      comp.push(w);
    } while (w !== v);
    out.push(comp);
  };
  nodes.forEach((n) => index.has(n) || visit(n));
  return out;
}

// The marked (`// load-time:`) declarations of a module, in source order.
function markedNames(text, rel) {
  const ast = parse(text, rel);
  const lines = text.split('\n');
  const out = [];
  for (const st of ast.body) {
    const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (!d) continue;
    const at = (line) => loadTimeMarker(lines, line).marked || (line !== st.loc.start.line && loadTimeMarker(lines, st.loc.start.line).marked);
    if (d.type === 'VariableDeclaration') {
      for (const x of d.declarations) if (at(x.loc.start.line)) out.push(x.id.type === 'Identifier' ? x.id.name : '(pattern)');
    } else if (d.type === 'ClassDeclaration' && at(d.loc.start.line)) out.push(d.id.name);
  }
  return out;
}

// The names tests/state_modules.js reads from each module it loads: `const { a } = await load('<path>')`, or
// `const m = await load('<path>')` and then `m.a`. Map path -> Set of names. They count as importers before an export is
// removed (a merge or a move would otherwise drop an export the test reads).
function stateModuleReads(text) {
  const out = new Map();
  if (text === undefined) return out;
  let ast;
  try {
    ast = espree.parse(text, { ecmaVersion: ECMA, sourceType: 'module' });
  } catch (e) {
    refuse(`${STATE_MODULES}: ${e.message}`);
  }
  const add = (p, n) => {
    if (!out.has(p)) out.set(p, new Set());
    out.get(p).add(n);
  };
  const loadPath = (init) => {
    const n = init && init.type === 'AwaitExpression' ? init.argument : init;
    if (!n || n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'load' || n.arguments.length !== 1) return null;
    const a = n.arguments[0];
    return a.type === 'Literal' && typeof a.value === 'string' ? a.value : null;
  };
  const loaded = new Map(); // variable -> path
  const members = []; // [variable, property]
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclarator') {
      const p = loadPath(node.init);
      if (p && node.id.type === 'Identifier') loaded.set(node.id.name, p);
      else if (p && node.id.type === 'ObjectPattern') for (const prop of node.id.properties) if (prop.type === 'Property' && !prop.computed) add(p, specName(prop.key));
    }
    if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier') members.push([node.object.name, node.property.name]);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  for (const [v, prop] of members) if (loaded.has(v)) add(loaded.get(v), prop);
  return out;
}

function genScripts(root) {
  const dir = path.join(root, 'scripts');
  if (!fs.existsSync(dir)) return [];
  let scripts = {};
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {};
  } catch (e) {
    scripts = {};
  }
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => /^gen-.*-rules\.js$/.test(n)).sort()) {
    const m = /findMarkerSource\(\s*root\s*,\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!m) continue;
    const npm = Object.entries(scripts).find(([, cmd]) => cmd.trim() === `node scripts/${f}`);
    out.push({ file: f, country: m[1], marker: m[2], npm: npm ? `npm run ${npm[0]}` : `node scripts/${f}` });
  }
  return out;
}

function regroup(root, operations, { dryRun = false } = {}) {
  if (!Array.isArray(operations)) throw new Error('operations must be an array');
  const srcDir = path.join(root, 'src');
  const disk = new Map(); // rel -> text as read (LF)
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) disk.set(path.relative(root, full).split(path.sep).join('/'), readText(full));
    }
  };
  walk(srcDir);
  const pkg = fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8');
  const staged = new Map(disk);
  const outsideDisk = new Map();
  for (const rel of OUTSIDE) if (fs.existsSync(path.join(root, rel))) outsideDisk.set(rel, readText(path.join(root, rel)));
  const outside = new Map(outsideDisk);
  const gens = genScripts(root);
  const markerSource = (g) => [...staged].filter(([rel, t]) => rel.startsWith(`src/${g.country}/`) && new RegExp(`^\\s*// ${g.marker}:begin\\s*$`, 'm').test(t)).map(([rel]) => rel).join(', ');
  const genBefore = gens.map(markerSource);
  const lines = [];
  const tempDirs = [];
  const deletedBy = new Map(); // rel -> op index
  const stateNotes = []; // a moved name tests/state_modules.js still reads from its old module
  let graphs = null;
  let order = null;

  // the staged src/ written into a fresh temp directory: graphs, the load-time order, and (with check) every guard
  function survey(touched, check) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'regroup-'));
    tempDirs.push(tmp);
    try {
      fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'src', 'package.json'), pkg);
      for (const [rel, text] of staged) {
        fs.mkdirSync(path.join(tmp, pp.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(tmp, rel), text);
      }
      if (check) guards(touched);
      const g = {};
      for (const c of COUNTRIES) {
        try {
          g[c] = buildGraph(tmp, c);
        } catch (e) {
          refuse(`import graph (${c}): ${e.message}`);
        }
      }
      if (check) graphGuards(g);
      const o = {};
      for (const c of COUNTRIES) {
        if (!staged.has(`src/${c}/main.js`)) continue;
        const out = path.join(tmp, 'out', `${c}.js`);
        try {
          require('esbuild').buildSync({
            entryPoints: [path.join(tmp, 'src', c, 'main.js')],
            outfile: out,
            bundle: true,
            write: true,
            format: 'iife',
            target: 'esnext',
            conditions: [c],
            charset: 'utf8',
            absWorkingDir: tmp,
            logLevel: 'silent',
          });
        } catch (e) {
          refuse(`build (${c}): ${(e.errors || []).map((x) => x.text).join('; ') || e.message}`);
        }
        const names = [];
        const seen = new Map();
        for (const line of fs.readFileSync(out, 'utf8').split('\n')) {
          const m = /^\s*\/\/ (src\/\S+\.js)$/.exec(line);
          if (!m || !staged.has(m[1])) continue;
          for (const n of markedNames(staged.get(m[1]), m[1])) {
            const k = (seen.get(n) || 0) + 1;
            seen.set(n, k);
            names.push(k === 1 ? n : `${n}#${k}`);
          }
        }
        o[c] = names;
      }
      return { graphs: g, order: o };
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  function guards(touched) {
    for (const [rel, text] of staged) {
      if (isCore(rel)) {
        const used = domGlobalsUsed(text);
        if (used.length) refuse(`core purity: ${rel} uses ${used[0].name} (line ${used[0].line})`);
        const stripped = stripComments(text);
        const m = DOM_METHODS.exec(stripped);
        if (m) refuse(`core purity: ${rel} calls a DOM method (${m[0]})`);
        for (const [, source] of stripped.matchAll(IMPORT_SOURCE)) {
          const target = source.startsWith('.') ? targetsOf(rel, source)[0].slice('src/'.length) : source;
          if (target.split('/').includes('ui')) refuse(`core purity: ${rel} imports ${source}, a ui/ module`);
        }
      }
      const owner = ownerOf(rel);
      const ast = parse(text, rel);
      for (const st of ast.body) {
        if (!isFromDecl(st) || !st.source.value.startsWith('.')) continue;
        const t = targetsOf(rel, st.source.value)[0];
        const to = ownerOf(t);
        if ((owner === 'shared' && (to === 'us' || to === 'canada')) || (owner === 'us' && to === 'canada') || (owner === 'canada' && to === 'us')) {
          refuse(`boundary: ${rel} imports ${st.source.value} (country code is reached through '#country/...' only)`);
        }
      }
    }
    // every named import and re-export finds its name exported by the module it names (the build sees only what the
    // planners reach)
    const exportsOf = new Map();
    const exported = (rel) => {
      if (!exportsOf.has(rel)) {
        const s = shapeOf(staged.get(rel), rel);
        const names = new Set([...s.exportList]);
        for (const [n, d] of s.decls) if (d.exported) names.add(n);
        let star = false;
        for (const st of s.reexports) {
          if (st.type === 'ExportAllDeclaration') star = true;
          else for (const sp of specsOf(st)) names.add(sp.exported);
        }
        exportsOf.set(rel, { names, star });
      }
      return exportsOf.get(rel);
    };
    for (const [rel, text] of staged) {
      for (const st of parse(text, rel).body) {
        if (!isFromDecl(st) || st.type === 'ExportAllDeclaration') continue;
        for (const target of targetsOf(rel, st.source.value)) {
          if (!staged.has(target)) continue; // reported by the import graph
          const ex = exported(target);
          if (ex.star) continue;
          for (const s of specsOf(st)) {
            const name = st.type === 'ImportDeclaration' ? s.imported : s.local;
            if (st.type === 'ImportDeclaration' && s.kind !== 'named') continue;
            if (!ex.names.has(name)) refuse(`missing export: ${rel} imports ${name} from ${st.source.value}, which ${target} does not export`);
          }
        }
      }
    }
    for (const rel of touched) {
      if (!staged.has(rel)) continue;
      const text = staged.get(rel);
      const pairs = dataBlocks(text);
      if (pairs.unpaired) refuse(`data-block markers are not paired in ${rel}: ${pairs.unpaired}`);
      const bad = undeclaredNames(text);
      if (bad.length) refuse(`undeclared names in ${rel}: ${bad.map((b) => `${b.name} (line ${b.line})`).join(', ')}`);
      // an initializer that runs at load must not read a binding declared later in the file (a TDZ error)
      const ast = parse(text, rel);
      const lexical = new Map(); // name -> statement index (let, const, class)
      ast.body.forEach((st, i) => {
        const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (!d) return;
        if (d.type === 'ClassDeclaration' && d.id) lexical.set(d.id.name, i);
        if (d.type === 'VariableDeclaration' && d.kind !== 'var') for (const x of d.declarations) for (const n of referencedNames(x.id, new Set())) lexical.set(n, i);
      });
      ast.body.forEach((st, i) => {
        const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (!d) return;
        const inits = d.type === 'VariableDeclaration' ? d.declarations.map((x) => [x.id.type === 'Identifier' ? x.id.name : '(pattern)', x.init]) : d.type === 'ClassDeclaration' && d.superClass ? [[d.id.name, d.superClass]] : [];
        for (const [name, init] of inits) {
          if (isInert(init)) continue;
          for (const r of referencedNames(init, new Set())) {
            if (lexical.has(r) && lexical.get(r) > i) refuse(`load order: ${name} in ${rel} reads ${r}, declared later in the file`);
          }
        }
      });
    }
  }

  function graphGuards(g) {
    const problems = new Set();
    for (const c of COUNTRIES) {
      const graph = g[c];
      const cyc = cycles(graph);
      const inCycle = new Map();
      for (const comp of cyc) {
        if (!comp.every(isUi)) refuse(`import cycle outside ui/ (${c}): ${comp.join(' <-> ')}`);
        for (const f of comp) inCycle.set(f, comp);
      }
      for (const f of graph.files) {
        if (!isUi(f) || graph.facades.has(f)) continue;
        const comp = inCycle.get(f);
        let opts = {};
        if (comp) {
          const partners = new Set();
          for (const [local, target] of graph.importsOf.get(f)) if (comp.includes(target)) partners.add(local);
          opts = { cyclePartners: partners, inCycle: true };
        }
        for (const p of checkLoadTime(staged.get(f), opts)) {
          problems.add(`load-time guard: ${f} line ${p.line}: ${p.name ? `${p.name}: ` : ''}${p.why}${p.ref ? ` (${p.ref})` : ''}`);
        }
      }
    }
    if (problems.size) refuse([...problems].join('; '));
  }

  // files that a '#country/...' specifier names (seam facades, storage-key.js): renamed, merged or moved only by hand
  function viaCountry(rel) {
    for (const [f, text] of staged) {
      for (const st of parse(text, f).body) {
        if (isFromDecl(st) && st.source.value.startsWith('#country/') && targetsOf(f, st.source.value).includes(rel)) return f;
      }
    }
    return null;
  }
  function checkSource(rel, role) {
    if (typeof rel !== 'string' || !staged.has(rel)) refuse(`${rel} does not exist`);
    if (isMain(rel)) refuse(`${rel} is a planner entry point; it cannot be ${role}`);
    const via = viaCountry(rel);
    if (via) refuse(`${rel} is imported through '#country/...' (by ${via}); it cannot be ${role}`);
    if (shapeOf(staged.get(rel), rel).facade) refuse(`${rel} is a facade; it cannot be ${role}`);
  }
  function checkTarget(rel) {
    if (typeof rel !== 'string' || !/^src\/.+\.js$/.test(rel) || pp.normalize(rel) !== rel) refuse(`${rel}: a target must be a .js path under src/`);
    if (isMain(rel) || SEAM_FILE.test(rel)) refuse(`${rel} cannot be a target`);
  }
  // every import and re-export declaration (other than in `skip`) whose relative specifier names one of `paths`
  function importersOf(paths, skip = new Set()) {
    const out = [];
    for (const [f, text] of staged) {
      if (skip.has(f)) continue;
      for (const st of parse(text, f).body) {
        if (isFromDecl(st) && st.source.value.startsWith('.') && paths.has(targetsOf(f, st.source.value)[0])) out.push({ file: f, st });
      }
    }
    return out;
  }
  // rewrites, in every file but `skip`, each relative specifier naming a path in `map` (old -> new)
  function retarget(map, skip = new Set()) {
    const files = new Set();
    for (const { file } of importersOf(new Set(map.keys()), skip)) files.add(file);
    for (const f of files) {
      const text = staged.get(f);
      const edits = [];
      for (const st of parse(text, f).body) {
        if (!isFromDecl(st) || !st.source.value.startsWith('.')) continue;
        const t = targetsOf(f, st.source.value)[0];
        if (!map.has(t)) continue;
        const q = st.source.raw[0];
        edits.push({ start: st.source.range[0], end: st.source.range[1], text: `${q}${relSpec(f, map.get(t))}${q}` });
      }
      staged.set(f, mergeDuplicateImports(applyEdits(text, edits), f, new Set([...map.values()].map((p) => `f:${p}`))));
    }
    return files;
  }
  function pathMoved(from, to) {
    for (const [rel, text] of outside) {
      const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      outside.set(rel, text.replace(new RegExp(`(?<![\\w./-])${esc}(?![\\w/-]|\\.\\w)`, 'g'), to));
    }
  }

  function rename(op) {
    const { rename: from, to } = op;
    checkSource(from, 'renamed');
    checkTarget(to);
    if (staged.has(to)) refuse(`rename target exists: ${to}`);
    let text = staged.get(from);
    const edits = [];
    for (const st of parse(text, from).body) {
      if (!isFromDecl(st) || !st.source.value.startsWith('.')) continue;
      const t = targetsOf(from, st.source.value)[0];
      const q = st.source.raw[0];
      edits.push({ start: st.source.range[0], end: st.source.range[1], text: `${q}${relSpec(to, t)}${q}` });
    }
    text = applyEdits(text, edits);
    staged.delete(from);
    staged.set(to, text);
    const files = retarget(new Map([[from, to]]), new Set([to]));
    pathMoved(from, to);
    return `rename ${from} -> ${to} (${files.size} importing file${files.size === 1 ? '' : 's'} rewritten)`;
  }

  function merge(op) {
    const { merge: sources, to } = op;
    if (!Array.isArray(sources) || !sources.length) refuse('merge needs a list of sources');
    if (new Set(sources).size !== sources.length) refuse('a merge source is listed twice');
    checkTarget(to);
    sources.forEach((s) => checkSource(s, 'merged'));
    const toExists = staged.has(to);
    const listed = sources.includes(to);
    if (toExists && !listed) checkSource(to, 'a merge target');
    const members = toExists && !listed ? [to, ...sources] : [...sources];
    if (members.length < 2) refuse('a merge needs two modules');
    const memberSet = new Set(members);
    // the import edges among the members (through facades, in either country)
    const edges = new Map(members.map((m) => [m, new Set()]));
    for (const c of COUNTRIES) for (const m of members) for (const t of graphs[c].edges.get(m) || []) if (memberSet.has(t) && t !== m) edges.get(m).add(t);
    const pos = (m) => (toExists && !listed && m === to ? -1 : sources.indexOf(m));
    const comps = scc(members, edges).map((comp) => comp.sort((a, b) => pos(a) - pos(b)));
    const compOf = new Map();
    comps.forEach((comp, i) => comp.forEach((m) => compOf.set(m, i)));
    // the members of one cycle keep the map's order and must pass the load-time guard with their cycle partners
    for (const comp of comps.filter((x) => x.length > 1)) {
      const problems = [];
      for (const m of comp) {
        const partners = new Set();
        for (const c of countriesOf(m)) for (const [local, t] of graphs[c].importsOf.get(m) || []) if (comp.includes(t) && t !== m) partners.add(local);
        for (const p of checkLoadTime(staged.get(m), { cyclePartners: partners, inCycle: true })) {
          problems.push(`${m} line ${p.line}: ${p.name ? `${p.name}: ` : ''}${p.why}${p.ref ? ` (${p.ref})` : ''}`);
        }
      }
      if (problems.length) refuse(`merge of cycle members: ${problems.join('; ')}`);
    }
    // components in dependency order (a component after every component it imports), ties by the map's position; an
    // existing target that is not listed comes first
    const placed = [];
    const done = new Set();
    const deps = (i) => new Set([...comps[i]].flatMap((m) => [...edges.get(m)].map((t) => compOf.get(t))).filter((j) => j !== i));
    if (toExists && !listed) {
      placed.push(...comps[compOf.get(to)]);
      done.add(compOf.get(to));
    }
    while (done.size < comps.length) {
      const ready = comps.map((_, i) => i).filter((i) => !done.has(i) && [...deps(i)].every((j) => done.has(j)));
      const pick = (ready.length ? ready : comps.map((_, i) => i).filter((i) => !done.has(i))).sort((a, b) => Math.min(...comps[a].map(pos)) - Math.min(...comps[b].map(pos)))[0];
      placed.push(...comps[pick]);
      done.add(pick);
    }
    // exports: a declaration exported only for another member loses its `export`
    const intraNames = new Set();
    for (const m of members) {
      for (const st of shapeOf(staged.get(m), m).imports) {
        if (!st.source.value.startsWith('.') || !memberSet.has(targetsOf(m, st.source.value)[0])) continue;
        for (const s of specsOf(st)) {
          if (s.kind !== 'named') refuse(`${m} imports ${st.source.value} with a ${s.kind} import, which a merge cannot resolve`);
          if (s.imported !== s.local) refuse(`${m} imports ${s.imported} as ${s.local} from ${st.source.value}, a module of the merge`);
          intraNames.add(s.imported);
        }
      }
    }
    const external = new Set();
    for (const { file, st } of importersOf(memberSet, memberSet)) {
      for (const s of specsOf(st) || [{ imported: '*' }]) external.add(st.type === 'ImportDeclaration' ? s.imported : s.local || '*');
    }
    const testReads = stateModuleReads(outside.get(STATE_MODULES));
    for (const m of members) for (const n of testReads.get(m) || []) external.add(n);
    // the bodies and imports
    const imports = new Map(); // key -> [{ kind, imported, local }]
    const bound = new Map(); // local -> key|imported
    const declared = new Map(); // name -> member
    const bodies = [];
    let purpose = [];
    for (const m of placed) {
      let text = staged.get(m);
      const shape0 = shapeOf(text, m);
      if (shape0.reexports.length) refuse(`${m} re-exports from another module; a merge does not move re-exports`);
      for (const name of shape0.decls.keys()) {
        if (intraNames.has(name) && !external.has(name)) text = setExport(text, m, name, false);
      }
      const shape = shapeOf(text, m);
      for (const name of shape.decls.keys()) {
        if (declared.has(name)) refuse(`name clash: ${name} in ${to}`);
        declared.set(name, m);
      }
      for (const st of shape.imports) {
        const t = st.source.value.startsWith('.') ? targetsOf(m, st.source.value)[0] : null;
        if (t && memberSet.has(t)) continue;
        const key = keyOf(m, st.source.value);
        if (!st.specifiers.length) refuse(`${m} has a side-effect import (${st.source.value})`);
        for (const s of specsOf(st)) {
          const id = `${key}|${s.kind}|${s.imported}`;
          if (bound.has(s.local)) {
            if (bound.get(s.local) !== id) refuse(`name clash: ${s.local} in ${to}`);
            continue;
          }
          bound.set(s.local, id);
          if (!imports.has(key)) imports.set(key, []);
          imports.get(key).push({ kind: s.kind, imported: s.imported, local: s.local });
        }
      }
      const p = purposeLines(text);
      const all = text.split('\n');
      if (m === to && p) purpose = all.slice(0, p);
      const importLines = shape.imports.map((st) => wholeLines(text, st, m));
      const drop = new Set();
      for (let n = 1; n <= p; n++) drop.add(n);
      for (const r of importLines) for (let n = r.start; n <= r.end; n++) drop.add(n);
      bodies.push(trimBlank(all.filter((_, i) => !drop.has(i + 1))));
    }
    for (const local of bound.keys()) if (declared.has(local)) refuse(`name clash: ${local} in ${to}`);
    const importText = [...imports].map(([key, specs]) => renderDecl({ type: 'ImportDeclaration' }, specs, specForKey(to, key)));
    const out = [...purpose, ...importText, ...(importText.length ? [''] : []), ...joinBodies(bodies), ''];
    for (const m of members) if (m !== to) staged.delete(m);
    staged.set(to, out.join('\n'));
    const map = new Map(members.filter((m) => m !== to).map((m) => [m, to]));
    const files = retarget(map, new Set([to]));
    for (const m of members) if (m !== to) pathMoved(m, to);
    return `merge ${sources.join(' + ')} -> ${to} (${toExists ? 'existing' : 'new'}; body order ${placed.map((m) => pp.basename(m)).join(', ')}; ${files.size} importing file${files.size === 1 ? '' : 's'} rewritten)`;
  }

  function move(op, i) {
    const { move: name, from, to } = op;
    if (typeof name !== 'string' || !name) refuse('move needs a name');
    checkSource(from, 'a move source');
    checkTarget(to);
    if (from === to) refuse('a move needs two modules');
    if (staged.has(to)) checkSource(to, 'a move target');
    const fromText = staged.get(from);
    const shape = shapeOf(fromText, from);
    const d = shape.decls.get(name);
    if (!d) refuse(`${name} is not a top-level declaration of ${from}`);
    if (d.group) refuse(`${name} shares its declaration with other names in ${from}`);
    if (shape.exportList.has(name)) refuse(`${name} is exported through an export list in ${from}`);
    const st = d.st;
    const block = dataBlocks(fromText).blocks.find((b) => b.begin < st.loc.start.line && st.loc.end.line < b.end);
    if (block) refuse(`${name} lies inside the data block ${block.name} in ${from} (lines ${block.begin}-${block.end}); a data block does not move`);
    const inside = (node) => node.range[0] >= st.range[0] && node.range[1] <= st.range[1];
    const sm = eslintScope.analyze(shape.ast, { ecmaVersion: ECMA, sourceType: 'module' });
    const modScope = sm.scopes.find((s) => s.type === 'module');
    const topOf = (node) => {
      const top = shape.ast.body.find((x) => node.range[0] >= x.range[0] && node.range[1] <= x.range[1]);
      const td = top && (top.type === 'ExportNamedDeclaration' ? top.declaration : top);
      if (td && td.id) return td.id.name;
      if (td && td.declarations) return td.declarations.map((x) => (x.id.type === 'Identifier' ? x.id.name : '(pattern)')).join(', ');
      return 'a top-level statement';
    };
    const self = modScope.variables.find((v) => v.name === name);
    // a mutable binding moves only with every writer
    if (d.kind === 'let' || d.kind === 'var') {
      const writers = [...new Set(self.references.filter((r) => r.isWrite() && !r.init && !inside(r.identifier)).map((r) => topOf(r.identifier)))];
      if (writers.length) refuse(`mutable binding ${name} is written by ${writers.join(', ')}, which stays in ${from}`);
    }
    // what the declaration uses from its module
    const needs = []; // for `to`: { key, imported, local, kind: 'import' }
    const fromDeclsUsed = [];
    const importVars = [];
    for (const v of modScope.variables) {
      if (v.name === name) continue;
      const refsIn = v.references.filter((r) => inside(r.identifier));
      const def = v.defs[0];
      if (!def) continue;
      if (def.type === 'ImportBinding') {
        importVars.push({ v, refsIn });
        if (!refsIn.length) continue;
        const spec = def.parent.source.value;
        const sp = def.node;
        if (sp.type !== 'ImportSpecifier') refuse(`${name} uses ${v.name}, a ${sp.type === 'ImportDefaultSpecifier' ? 'default' : 'namespace'} import of ${from}`);
        const t = spec.startsWith('.') ? targetsOf(from, spec)[0] : null;
        if (t === to) continue; // it is declared in `to`
        needs.push({ key: keyOf(from, spec), imported: specName(sp.imported), local: v.name, kind: 'import', ui: (t && isUi(t)) || /^#country\/ui\//.test(spec) });
      } else if (refsIn.length) {
        fromDeclsUsed.push(v.name);
        needs.push({ key: `f:${from}`, imported: v.name, local: v.name, kind: 'import', ui: isUi(from) });
      }
    }
    // nothing moves into core/ that uses a browser global, a DOM method or a ui/ module
    if (isCore(to)) {
      const g = sm.globalScope.through.find((r) => inside(r.identifier) && DOM_GLOBALS.has(r.identifier.name));
      if (g) refuse(`move into core/: ${name} uses ${g.identifier.name}`);
      const dm = DOM_METHODS.exec(stripComments(fromText.slice(st.range[0], st.range[1])));
      if (dm) refuse(`move into core/: ${name} calls a DOM method (${dm[0]})`);
      const u = needs.find((n) => n.ui);
      if (u) refuse(`move into core/: ${name} uses ${u.local}, from a ui/ module`);
    }
    const readersStay = self.references.some((r) => !inside(r.identifier));
    // the files that import the name from `from`
    const users = importersOf(new Set([from]), new Set([from])).filter(({ st: x }) => (specsOf(x) || []).some((s) => (x.type === 'ImportDeclaration' ? s.imported : s.local) === name));
    const hadImporters = users.length > 0;
    // ---- `to`
    const chunk = chunkOf(fromText, from, st, shape.ast);
    let toText;
    const created = !staged.has(to);
    if (created) toText = '';
    else {
      toText = staged.get(to);
      const tshape = shapeOf(toText, to);
      if (tshape.decls.has(name)) refuse(`name clash: ${name} in ${to}`);
      for (const x of tshape.imports) {
        for (const s of specsOf(x)) {
          if (s.local !== name) continue;
          const t = x.source.value.startsWith('.') ? targetsOf(to, x.source.value)[0] : null;
          if (t !== from || s.imported !== name) refuse(`name clash: ${name} in ${to}`);
        }
      }
      toText = dropSpecifiers(toText, to, (x, s) => x.type === 'ImportDeclaration' && x.source.value.startsWith('.') && targetsOf(to, x.source.value)[0] === from && s.imported === name);
    }
    for (const n of needs) {
      if (!created && shapeOf(toText, to).decls.has(n.local)) refuse(`name clash: ${n.local} in ${to}`);
    }
    if (created) {
      const importText = [];
      const byKey = new Map();
      for (const n of needs) {
        if (!byKey.has(n.key)) byKey.set(n.key, []);
        byKey.get(n.key).push({ kind: 'named', imported: n.imported, local: n.local });
      }
      for (const [key, specs] of byKey) importText.push(renderDecl({ type: 'ImportDeclaration' }, specs, specForKey(to, key)));
      toText = [...importText, ...(importText.length ? [''] : []), ...chunk.lines, ''].join('\n');
    } else {
      toText = addSpecifiers(toText, to, needs);
      const body = toText.split('\n');
      while (body.length && body[body.length - 1].trim() === '') body.pop();
      if (body.length && /^\s*\/\//.test(body[body.length - 1])) body.push('');
      toText = [...body, ...chunk.lines, ''].join('\n');
    }
    // ---- `from`
    let fromNew = removeLines(fromText, [{ start: chunk.start, end: chunk.end }]);
    for (const n of fromDeclsUsed) fromNew = setExport(fromNew, from, n, true);
    const unusedNow = new Set(importVars.filter(({ v, refsIn }) => refsIn.length && refsIn.length === v.references.length).map(({ v }) => v.name));
    fromNew = dropSpecifiers(fromNew, from, (x, s) => x.type === 'ImportDeclaration' && unusedNow.has(s.local));
    if (readersStay) fromNew = addSpecifiers(fromNew, from, [{ key: `f:${to}`, imported: name, local: name, kind: 'import' }]);
    // ---- the other importers
    let othersNeed = readersStay;
    const rewritten = new Set();
    for (const { file } of users) {
      if (file === to) continue;
      othersNeed = true;
      rewritten.add(file);
    }
    for (const file of rewritten) {
      let text = staged.get(file);
      const add = [];
      for (const x of parse(text, file).body) {
        if (!isFromDecl(x) || !x.source.value.startsWith('.') || targetsOf(file, x.source.value)[0] !== from) continue;
        for (const s of specsOf(x) || []) {
          if (x.type === 'ImportDeclaration' && s.imported === name) add.push({ key: `f:${to}`, imported: name, local: s.local, kind: 'import' });
          if (x.type !== 'ImportDeclaration' && s.local === name) add.push({ key: `f:${to}`, imported: name, local: s.exported, kind: 'export' });
        }
      }
      const only = parse(text, file).body.filter((x) => isFromDecl(x) && x.source.value.startsWith('.') && targetsOf(file, x.source.value)[0] === from);
      if (only.length === 1 && (specsOf(only[0]) || []).length === 1) {
        // the declaration names only the moved name: its specifier is rewritten in place
        const q = only[0].source.raw[0];
        text = mergeDuplicateImports(applyEdits(text, [{ start: only[0].source.range[0], end: only[0].source.range[1], text: `${q}${relSpec(file, to)}${q}` }]), file, new Set([`f:${to}`]));
      } else {
        text = dropSpecifiers(text, file, (x, s) => x.source && x.source.value.startsWith('.') && targetsOf(file, x.source.value)[0] === from && (x.type === 'ImportDeclaration' ? s.imported : s.local) === name);
        text = addSpecifiers(text, file, add);
      }
      staged.set(file, text);
    }
    // tests/state_modules.js reading the name from `from` counts as another importer (its path is not rewritten: reported)
    if ((stateModuleReads(outside.get(STATE_MODULES)).get(from) || new Set()).has(name)) {
      othersNeed = true;
      stateNotes.push(`note: ${STATE_MODULES} reads ${name} from ${from}, which op ${i} moved to ${to}`);
    }
    // `export` as uses require: kept or added when another file imports it, removed when only `to` did
    staged.set(to, toText);
    if (othersNeed) staged.set(to, setExport(staged.get(to), to, name, true));
    else if (hadImporters) staged.set(to, setExport(staged.get(to), to, name, false));
    // a source left with no declarations (and no other statement) is deleted
    const left = shapeOf(fromNew, from);
    let deleted = false;
    if (left.decls.size === 0 && left.statements === 0 && left.exportList.size === 0 && left.reexports.length === 0) {
      const still = importersOf(new Set([from]), new Set([from]));
      if (still.length) refuse(`${from} is left with no declarations but ${still[0].file} still imports it`);
      staged.delete(from);
      deletedBy.set(from, i);
      deleted = true;
    } else staged.set(from, fromNew);
    return `move ${name} ${from} -> ${to}${created ? ' (created)' : ''} (${rewritten.size} importing file${rewritten.size === 1 ? '' : 's'} rewritten${readersStay ? `; ${from} imports it back` : ''}${deleted ? `; ${from} deleted` : ''})`;
  }

  // the facade-side rule: a seam name's facades sit under ui/ in both countries when either country's target is under ui/
  function facadeSides() {
    const byName = new Map(); // name -> { us: rel, canada: rel }
    for (const rel of staged.keys()) {
      const m = SEAM_FILE.exec(rel);
      if (!m) continue;
      if (!byName.has(m[3])) byName.set(m[3], {});
      const e = byName.get(m[3]);
      if (e[m[1]]) refuse(`seam name ${m[3]} has two facades in ${m[1]} (${e[m[1]]}, ${rel})`);
      e[m[1]] = rel;
    }
    const out = [];
    for (const [name, e] of [...byName].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      for (const c of COUNTRIES) if (!e[c]) refuse(`seam name ${name} has a facade in ${COUNTRIES.find((x) => e[x])} only`);
      const targets = {};
      for (const c of COUNTRIES) {
        const st = parse(staged.get(e[c]), e[c]).body.find(isFromDecl);
        if (!st || !st.source.value.startsWith('.')) continue;
        targets[c] = targetsOf(e[c], st.source.value)[0];
      }
      const want = Object.values(targets).some(isUi) ? 'ui' : 'core';
      const have = SEAM_FILE.exec(e.us)[2];
      if (have === want && SEAM_FILE.exec(e.canada)[2] === want) continue;
      for (const c of COUNTRIES) {
        const old = e[c];
        const next = `src/${c}/${want}/seam-${name}.js`;
        if (old === next) continue;
        if (staged.has(next)) refuse(`seam name ${name}: ${next} exists`);
        let text = staged.get(old);
        const edits = [];
        for (const st of parse(text, old).body) {
          if (!isFromDecl(st) || !st.source.value.startsWith('.')) continue;
          const q = st.source.raw[0];
          edits.push({ start: st.source.range[0], end: st.source.range[1], text: `${q}${relSpec(next, targetsOf(old, st.source.value)[0])}${q}` });
        }
        text = applyEdits(text, edits);
        staged.delete(old);
        staged.set(next, text);
        pathMoved(old, next);
      }
      const oldSpec = `#country/${have}/seam-${name}`;
      const oldSpec2 = `#country/${SEAM_FILE.exec(e.canada)[2]}/seam-${name}`;
      const newSpec = `#country/${want}/seam-${name}`;
      for (const [f, text] of staged) {
        const edits = [];
        for (const st of parse(text, f).body) {
          if (!isFromDecl(st) || (st.source.value !== oldSpec && st.source.value !== oldSpec2)) continue;
          const q = st.source.raw[0];
          edits.push({ start: st.source.range[0], end: st.source.range[1], text: `${q}${newSpec}${q}` });
        }
        if (edits.length) staged.set(f, applyEdits(text, edits));
      }
      out.push(`  facades of ${name} moved to ${want}/ (us, canada)`);
    }
    return out;
  }

  const summary = (op) => {
    if (op && typeof op.rename === 'string') return `rename ${op.rename} -> ${op.to}`;
    if (op && Array.isArray(op.merge)) return `merge ${op.merge.join(' + ')} -> ${op.to}`;
    if (op && typeof op.move === 'string') return `move ${op.move} ${op.from} -> ${op.to}`;
    return JSON.stringify(op);
  };

  let index = -1;
  try {
    try {
      ({ graphs, order } = survey(new Set(), false));
    } catch (e) {
      if (e instanceof Refusal) throw new Error(`the tree before the map: ${e.message}`);
      throw e;
    }
    for (index = 0; index < operations.length; index++) {
      const op = operations[index];
      const before = new Map(staged);
      const outsideBefore = new Map(outside);
      let line;
      if (op && typeof op.rename === 'string' && Object.keys(op).length === 2 && 'to' in op) line = rename(op);
      else if (op && Array.isArray(op.merge) && Object.keys(op).length === 2 && 'to' in op) line = merge(op);
      else if (op && typeof op.move === 'string' && Object.keys(op).length === 3 && 'from' in op && 'to' in op) line = move(op, index);
      else refuse('unknown operation (rename/to, merge/to or move/from/to)');
      const facadeLines = facadeSides();
      const touched = new Set([...staged].filter(([rel, t]) => before.get(rel) !== t).map(([rel]) => rel));
      const next = survey(touched, true);
      lines.push(`op ${index}: ${line}`, ...facadeLines);
      for (const [rel, text] of outside) if (outsideBefore.get(rel) !== text) lines.push(`  paths rewritten in ${rel}`);
      for (const c of COUNTRIES) {
        // which modules joined or left an import cycle (a merge's source counts as its target)
        const was = new Set(cycles(graphs[c]).flat().map((f) => (op.merge && op.merge.includes(f) ? op.to : f)));
        const now = new Set(cycles(next.graphs[c]).flat());
        const joined = [...now].filter((f) => !was.has(f));
        const left = [...was].filter((f) => !now.has(f) && staged.has(f));
        if (joined.length || left.length) lines.push(`  import cycles (${c}): ${joined.length ? `joined ${joined.join(', ')}` : ''}${joined.length && left.length ? '; ' : ''}${left.length ? `left ${left.join(', ')}` : ''}`);
      }
      for (const c of COUNTRIES) {
        const a = next.order[c] || [];
        const b = order[c] || [];
        const pb = new Map(b.map((n, k) => [n, k]));
        for (let x = 0; x < a.length; x++) {
          if (!pb.has(a[x])) lines.push(`  load-time order (${c}): ${a[x]} added`);
          for (let y = 0; y < x; y++) {
            if (pb.has(a[x]) && pb.has(a[y]) && pb.get(a[y]) > pb.get(a[x])) lines.push(`  load-time order (${c}): ${a[x]} now initializes after ${a[y]}`);
          }
        }
        const pa = new Set(a);
        for (const n of b) if (!pa.has(n)) lines.push(`  load-time order (${c}): ${n} removed`);
      }
      graphs = next.graphs;
      order = next.order;
    }
  } catch (e) {
    const err = e instanceof Refusal ? new Error(`op ${index} (${summary(operations[index])}): ${e.message}`) : e;
    err.lines = lines;
    err.tempDirs = tempDirs;
    err.opIndex = index;
    throw err;
  }

  // outside src/: generated docs and stale mentions
  lines.push(...stateNotes);
  gens.forEach((g, k) => {
    const now = markerSource(g);
    if (now !== genBefore[k]) lines.push(`regenerate: ${g.npm}`);
  });
  for (const [rel, text] of outside) {
    for (const [gone, k] of deletedBy) if (new RegExp(`(?<![\\w./-])${gone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-]|\\.\\w)`).test(text)) lines.push(`note: ${rel} names ${gone}, which op ${k} deleted`);
  }

  // what changes on disk
  const writes = new Map();
  for (const [rel, text] of staged) if (disk.get(rel) !== text) writes.set(path.join(root, rel), text);
  for (const [rel, text] of outside) if (outsideDisk.get(rel) !== text) writes.set(path.join(root, rel), text);
  const deletes = [...disk.keys()].filter((rel) => !staged.has(rel));
  if (deletes.length) lines.push(`deleted: ${deletes.join(', ')}`);
  if (!dryRun) {
    const done = [];
    try {
      for (const [file, text] of writes) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.regroup-tmp`, text);
        done.push(file);
      }
    } catch (err) {
      done.forEach((file) => fs.rmSync(`${file}.regroup-tmp`, { force: true }));
      throw err;
    }
    done.forEach((file) => fs.renameSync(`${file}.regroup-tmp`, file));
    for (const rel of deletes) fs.rmSync(path.join(root, rel), { force: true });
  }
  return { lines, filesWritten: writes.size, deleted: deletes, tempDirs, operations: operations.length };
}

module.exports = { regroup };
