// Load-time guard for ES modules (stage 4 design sections 5.3 and 6.4).
// A top-level initializer that is not inert runs when the module loads, so in an import cycle it could read a binding
// that is still in its temporal dead zone. The guard accepts only inert initializers, or ones marked by a
// `// load-time: <reason>` comment block directly above the declaration, and (inside a cycle) rejects a marked one that
// reads a name bound to a module of the same cycle.
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
      return !node.body.body.some((m) => m.type === 'StaticBlock' || (m.static && m.type === 'PropertyDefinition'));
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

// The contiguous `//` comment block directly above line declStartLine (1-based) starts with `// load-time:`.
function loadTimeMarker(lines, declStartLine) {
  let i = declStartLine - 2;
  while (i >= 0 && /^\s*\/\//.test(lines[i])) i--;
  const first = i + 1;
  if (first > declStartLine - 2) return { marked: false, reason: '' };
  const m = /^\s*\/\/ load-time:\s*(.*)$/.exec(lines[first]);
  if (!m) return { marked: false, reason: '' };
  return { marked: true, reason: m[1] };
}

// Names referenced anywhere in a node (identifier references; a non-computed member property or key is not one).
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

function checkLoadTime(code, opts) {
  const partners = opts && opts.cyclePartners;
  const ast = espree.parse(code, { ecmaVersion: ECMA, sourceType: 'module', range: true, loc: true });
  const lines = code.split(/\r?\n/);
  const problems = [];

  function checkClass(cls, name) {
    for (const m of cls.body.body) {
      if (m.type === 'StaticBlock') problems.push({ line: m.loc.start.line, name, why: 'class static' });
      else if (m.type === 'PropertyDefinition' && m.static && !isInert(m.value)) {
        problems.push({ line: m.loc.start.line, name, why: 'class static' });
      }
    }
  }
  function checkInit(init, name, declLine, stmtLine) {
    if (isInert(init)) return;
    let mk = loadTimeMarker(lines, declLine);
    if (!mk.marked && stmtLine !== declLine) mk = loadTimeMarker(lines, stmtLine);
    if (!mk.marked) {
      problems.push({ line: declLine, name, why: 'not inert and not marked' });
      return;
    }
    if (partners && partners.size) {
      const used = referencedNames(init, new Set());
      for (const p of partners) {
        if (used.has(p)) {
          problems.push({ line: declLine, name, why: 'reads the cycle' });
          return;
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
        if (init && init.type === 'ClassExpression') checkClass(init, name);
        checkInit(init, name, decl.loc.start.line, stmtLine);
      }
    } else if (d.type === 'ClassDeclaration') {
      checkClass(d, d.id ? d.id.name : 'default');
    } else if (d.type === 'FunctionDeclaration') {
      // inert
    } else {
      // export default <expression>
      if (d.type === 'ClassExpression') checkClass(d, 'default');
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

module.exports = { isInert, loadTimeMarker, checkLoadTime };
