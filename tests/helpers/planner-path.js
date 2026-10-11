const fs = require('fs');
const path = require('path');

// Where a planner lives: dist/ in a built checkout, the checkout root in a pre-refactor worktree
// (tests that take `--root DIR` compare against old commits, where the file sat at the root).
function plannerPath(file, root = path.resolve(__dirname, '..', '..')) {
  const built = path.join(root, 'dist', file);
  if (fs.existsSync(built)) return built;
  const atRoot = path.join(root, file);
  if (fs.existsSync(atRoot)) return atRoot;
  throw new Error(`${file} not found under ${root}: run "npm run build" there first (or use a pre-refactor checkout that has it at its root)`);
}

module.exports = { plannerPath };
