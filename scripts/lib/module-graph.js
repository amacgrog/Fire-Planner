// Import graph of the src/ tree for one country (stage 4 design section 5.2).
// Files are keyed by their path relative to `root`, with forward slashes (e.g. 'src/us/ui/render.js').
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ECMA = 2022;
const COUNTRIES = ['us', 'canada'];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function buildGraph(root, country) {
  const srcDir = path.join(root, 'src');
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const other = COUNTRIES.filter((c) => c !== country).map((c) => path.join(srcDir, c) + path.sep);
  const abs = walk(srcDir, []).filter((f) => !other.some((o) => f.startsWith(o)));
  const files = abs.map(rel).sort();
  const fileSet = new Set(files);

  function resolve(fromFile, spec) {
    let target = null;
    if (spec.startsWith('.')) target = path.resolve(path.dirname(path.join(root, fromFile)), spec);
    else if (spec.startsWith('#country/')) target = path.join(srcDir, country, spec.slice('#country/'.length) + '.js');
    else return null; // a bare package specifier is not part of the graph
    const r = rel(target);
    if (!fileSet.has(r)) throw new Error(`${fromFile}: unresolved import '${spec}' (expected ${r})`);
    return r;
  }

  // Parse each file once: its imports (specifier, source) and re-exports.
  const parsed = new Map();
  for (const f of files) {
    let ast;
    try {
      ast = espree.parse(fs.readFileSync(path.join(root, f), 'utf8'), { ecmaVersion: ECMA, sourceType: 'module' });
    } catch (e) {
      throw new Error(`${f}: ${e.message}`);
    }
    const imports = []; // { source, imported, local } ; imported null = side effect, '*' = namespace/default
    const reexports = []; // { source, imported, exported }
    let facade = ast.body.length > 0;
    for (const st of ast.body) {
      if (st.type === 'ImportDeclaration') {
        facade = false;
        if (st.specifiers.length === 0) imports.push({ source: st.source.value, imported: null, local: null });
        for (const sp of st.specifiers) {
          imports.push({
            source: st.source.value,
            imported: sp.type === 'ImportSpecifier' ? sp.imported.name || sp.imported.value : '*',
            local: sp.local.name,
          });
        }
      } else if (st.type === 'ExportNamedDeclaration' && st.source) {
        for (const sp of st.specifiers) {
          reexports.push({ source: st.source.value, imported: sp.local.name || sp.local.value, exported: sp.exported.name || sp.exported.value });
        }
        if (st.specifiers.length === 0) reexports.push({ source: st.source.value, imported: null, exported: null });
      } else if (st.type === 'ExportAllDeclaration') {
        reexports.push({ source: st.source.value, imported: '*', exported: null });
      } else {
        facade = false;
      }
    }
    parsed.set(f, { imports, reexports, facade });
  }

  // A facade maps each exported name to the module that really holds it (through chains of facades).
  const facadeCache = new Map();
  function facadeTargets(f, seen) {
    if (facadeCache.has(f)) return facadeCache.get(f);
    const map = new Map();
    const p = parsed.get(f);
    for (const re of p.reexports) {
      const t = resolve(f, re.source);
      if (!t) continue;
      let real = t;
      let name = re.imported;
      if (parsed.get(t).facade && !seen.has(t)) {
        const inner = facadeTargets(t, new Set([...seen, f]));
        real = (name && inner.get(name)) || inner.get('*first') || t;
      }
      map.set(re.exported || name || '*', real);
      if (!map.has('*first')) map.set('*first', real);
    }
    facadeCache.set(f, map);
    return map;
  }
  function through(target, importedName) {
    if (!parsed.get(target).facade) return target;
    const m = facadeTargets(target, new Set());
    return m.get(importedName) || m.get('*first') || target;
  }

  const edges = new Map();
  const importsOf = new Map();
  for (const f of files) {
    const set = new Set();
    const names = new Map();
    const p = parsed.get(f);
    for (const imp of p.imports) {
      const t = resolve(f, imp.source);
      if (!t) continue;
      const real = through(t, imp.imported);
      set.add(real);
      if (imp.local) names.set(imp.local, real);
    }
    if (!p.facade) {
      for (const re of p.reexports) {
        const t = resolve(f, re.source);
        if (t) set.add(through(t, re.imported));
      }
    } else {
      for (const t of facadeTargets(f, new Set()).values()) if (typeof t === 'string') set.add(t);
    }
    edges.set(f, set);
    importsOf.set(f, names);
  }
  const facades = new Set(files.filter((f) => parsed.get(f).facade));
  return { files, edges, importsOf, facades };
}

// Strongly connected components with more than one file, or a self-import (Tarjan). Facades are pass-through, never members.
function cycles(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const out = [];
  let n = 0;
  function visit(v) {
    index.set(v, n);
    low.set(v, n);
    n++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.edges.get(v) || []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      const self = comp.length === 1 && (graph.edges.get(v) || new Set()).has(v);
      if (comp.length > 1 || self) out.push(comp.sort());
    }
  }
  for (const f of graph.files) {
    if (graph.facades && graph.facades.has(f)) continue;
    if (!index.has(f)) visit(f);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

module.exports = { buildGraph, cycles };
