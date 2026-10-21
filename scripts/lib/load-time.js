// Load-time guard for ES modules (stage 4 design sections 5.3 and 6.4).
// A top-level initializer that is not inert runs when the module loads, so in an import cycle it could read a binding
// that is still in its temporal dead zone. The guard accepts only inert initializers, or ones marked by a
// `// load-time: <reason>` comment block directly above the declaration, and (inside a cycle) rejects a marked one that
// references anything but global names and literals (see checkLoadTime).
const espree = require('espree');

const ECMA = 2022;

function isInert(node) {
  if (node === null || node === undefined) return true;
  switch (node.type) {
    case 'Literal':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'ClassExpression':
      // a heritage that is not inert, a computed key and a static field or block all run when the class is evaluated
      return (
        isInert(node.superClass) &&
        !node.body.body.some((m) => m.type === 'StaticBlock' || m.computed || (m.static && m.type === 'PropertyDefinition'))
      );
    case 'UnaryExpression':
      return isInert(node.argument);
    case 'ObjectExpression':
      return node.properties.every((p) => p.type === 'Property' && !p.computed && isInert(p.value));
    case 'ArrayExpression':
      return node.elements.every((e) => e !== null && e.type !== 'SpreadElement' && isInert(e));
    default:
      return false;
  }
}

const SHARED_MARKER = /^\s*\/\/ @@shared:\S+ (?:begin|end)\s*$/;

// The contiguous `//` comment block directly above line declStartLine (1-based) starts with `// load-time:`.
function loadTimeMarker(lines, declStartLine) {
  let i = declStartLine - 2;
  while (i >= 0 && /^\s*\/\//.test(lines[i])) i--;
  let first = i + 1;
  // a `// @@shared:<name> begin|end` marker line (the sync tool's form) is not part of the comment
  while (first <= declStartLine - 2 && SHARED_MARKER.test(lines[first])) first++;
  if (first > declStartLine - 2) return { marked: false, reason: '' };
  const m = /^\s*\/\/ load-time:\s*(.*)$/.exec(lines[first]);
  if (!m) return { marked: false, reason: '' };
  return { marked: true, reason: m[1] };
}

// Names referenced anywhere in a node (identifier references; a non-computed member property or key is not one).
// Deliberately conservative: a name is matched wherever it appears, so a parameter or local that shadows a cycle
// partner's name still counts as a reference.
function referencedNames(node, out) {
  if (!node || typeof node.type !== 'string') return out;
  if (node.type === 'Identifier') {
    out.add(node.name);
    return out;
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'type') continue;
    if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
    if (key === 'key' && !node.computed && (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition')) continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => referencedNames(c, out));
    else if (v && typeof v === 'object') referencedNames(v, out);
  }
  return out;
}

// The names a module binds at its top level: declarations (functions, classes, variables, including names bound by a
// destructuring pattern) and import bindings.
function patternNames(node, out) {
  if (!node) return out;
  if (node.type === 'Identifier') out.add(node.name);
  else if (node.type === 'ObjectPattern') node.properties.forEach((p) => patternNames(p.type === 'RestElement' ? p.argument : p.value, out));
  else if (node.type === 'ArrayPattern') node.elements.forEach((e) => patternNames(e, out));
  else if (node.type === 'RestElement') patternNames(node.argument, out);
  else if (node.type === 'AssignmentPattern') patternNames(node.left, out);
  return out;
}
function moduleNames(ast) {
  const out = new Set();
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') {
      st.specifiers.forEach((sp) => out.add(sp.local.name));
      continue;
    }
    const d = st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration' ? st.declaration : st;
    if (!d) continue;
    if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) out.add(d.id.name);
    else if (d.type === 'VariableDeclaration') d.declarations.forEach((x) => patternNames(x.id, out));
  }
  return out;
}

// opts.cyclePartners: the local names this module imports from the other modules of its import cycle (a marked
// initializer that reads one is reported as 'reads the cycle').
// opts.inCycle: the module is part of an import cycle (default: true when cyclePartners is given). Then a marked
// initializer may reference global names only (browser globals and ES built-ins such as Set, Map, Object, Math) and
// literals: a name declared in its own module or imported is reported as 'reads its module in a cycle' (`ref` names it).
// A reference check of partner names alone is not transitive (a marked call of a local function that reads a partner
// passed it), hence the stricter rule. Outside a cycle the marker alone is enough.
function checkLoadTime(code, opts) {
  const partners = opts && opts.cyclePartners;
  const inCycle = opts && opts.inCycle !== undefined ? !!opts.inCycle : !!partners;
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const lines = code.split(/\r?\n/);
  const problems = [];
  const own = inCycle ? moduleNames(ast) : null;

  // Reports static fields and blocks; returns how many problems it added.
  function checkClass(cls, name) {
    const before = problems.length;
    for (const m of cls.body.body) {
      if (m.type === 'StaticBlock') problems.push({ line: m.loc.start.line, name, why: 'class static' });
      else if (m.type === 'PropertyDefinition' && m.static && !isInert(m.value)) {
        problems.push({ line: m.loc.start.line, name, why: 'class static' });
      }
    }
    return problems.length - before;
  }
  // A class declaration's heritage and computed keys are load-time expressions of the statement.
  function checkClassHead(cls, name, stmtLine) {
    if (cls.superClass) checkInit(cls.superClass, name, stmtLine, stmtLine);
    for (const m of cls.body.body) if (m.computed) checkInit(m.key, name, stmtLine, stmtLine);
  }
  function checkInit(init, name, declLine, stmtLine) {
    if (isInert(init)) return;
    let mk = loadTimeMarker(lines, declLine);
    if (!mk.marked && stmtLine !== declLine) mk = loadTimeMarker(lines, stmtLine);
    if (!mk.marked) {
      problems.push({ line: declLine, name, why: 'not inert and not marked' });
      return;
    }
    if ((partners && partners.size) || own) {
      const used = referencedNames(init, new Set());
      for (const p of partners || []) {
        if (used.has(p)) {
          problems.push({ line: declLine, name, why: 'reads the cycle' });
          return;
        }
      }
      if (own) {
        for (const u of used) {
          if (own.has(u)) {
            problems.push({ line: declLine, name, why: 'reads its module in a cycle', ref: u });
            return;
          }
        }
      }
    }
  }
  function checkDecl(d, stmtLine) {
    if (d.type === 'VariableDeclaration') {
      for (const decl of d.declarations) {
        const name = decl.id.type === 'Identifier' ? decl.id.name : '(pattern)';
        // a destructuring pattern evaluates its initializer at load time
        const init = decl.id.type === 'Identifier' ? decl.init : decl.init || { type: 'Identifier' };
        // a class expression already reported by checkClass is not reported again as an initializer
        if (init && init.type === 'ClassExpression' && checkClass(init, name) > 0) continue;
        checkInit(init, name, decl.loc.start.line, stmtLine);
      }
    } else if (d.type === 'ClassDeclaration') {
      const cname = d.id ? d.id.name : 'default';
      checkClass(d, cname);
      checkClassHead(d, cname, stmtLine);
    } else if (d.type === 'FunctionDeclaration') {
      // inert
    } else {
      // export default <expression>
      if (d.type === 'ClassExpression' && checkClass(d, 'default') > 0) return;
      checkInit(d, 'default', d.loc.start.line, stmtLine);
    }
  }

  for (const st of ast.body) {
    const line = st.loc.start.line;
    if (st.type === 'ImportDeclaration') continue;
    if (st.type === 'ExportAllDeclaration') continue;
    if (st.type === 'ExportNamedDeclaration') {
      if (st.declaration) checkDecl(st.declaration, line);
      continue;
    }
    if (st.type === 'ExportDefaultDeclaration') {
      checkDecl(st.declaration, line);
      continue;
    }
    if (st.type === 'VariableDeclaration' || st.type === 'ClassDeclaration' || st.type === 'FunctionDeclaration') {
      checkDecl(st, line);
      continue;
    }
    problems.push({ line, name: '', why: 'top-level statement' });
  }
  return problems;
}

module.exports = { isInert, loadTimeMarker, checkLoadTime, referencedNames, moduleNames };
