'use strict';
// Where a source path sits: the one definition of a module's side (core, ui or entry) that every tool uses.

const SIDE = /^src\/(shared|us|canada)\/(core|ui)\/(.+\.js)$/;
const ENTRY = /^src\/(us|canada)\/(main|storage-key)\.js$/;
const FACADE = /^src\/(us|canada)\/(core|ui)\/seam-[^/]+\.js$/;

// 'core' | 'ui' | 'entry' | null for a repo-relative path (backslashes are normalized).
function sideOf(rel) {
  const p = String(rel).split(String.fromCharCode(92)).join('/');
  if (ENTRY.test(p)) return 'entry';
  const m = SIDE.exec(p);
  if (!m) return null;
  const dirs = m[3].split('/').slice(0, -1);
  if (dirs.includes('core') || dirs.includes('ui')) return null;
  return m[2];
}
const isUi = (rel) => sideOf(rel) === 'ui';
const isCore = (rel) => sideOf(rel) === 'core';
// facades live only at the top of a side
const isFacade = (rel) => FACADE.test(String(rel).split(String.fromCharCode(92)).join('/'));

module.exports = { sideOf, isUi, isCore, isFacade };
