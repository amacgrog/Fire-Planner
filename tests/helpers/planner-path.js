const fs = require('fs');
const path = require('path');

// Where a planner lives: dist/ in a built checkout, the checkout root in a pre-refactor worktree
// (tests that take `--root DIR` compare against old commits, where the file sat at the root).
function plannerPath(file, root = path.resolve(__dirname, '..', '..')) {
  const built = path.join(root, 'dist', file);
  return fs.existsSync(built) ? built : path.join(root, file);
}

module.exports = { plannerPath };
