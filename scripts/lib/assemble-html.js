'use strict';
// Splices a planner's stylesheet and script into its HTML shell.
//
// The shell holds the markup plus two placeholders: {{css}} inside <style> and {{js}} inside <script>.
// css and js are passed as read from disk (each ends with a newline); the shell supplies the newline
// that follows the placeholder.

const PLACEHOLDER = /\{\{(css|js)\}\}/g;

const count = (text, token) => text.split(token).length - 1;
const dropFinalNewline = (text) => text.replace(/\n$/, '');

function assembleHtml({ shell, css, js }) {
  for (const token of ['{{css}}', '{{js}}']) {
    const found = count(shell, token);
    if (found !== 1) throw new Error(`shell must contain ${token} exactly once, found ${found}`);
  }
  if (/<\/style/i.test(css)) throw new Error('stylesheet contains "</style", which would end the <style> element early');
  const safeCss = dropFinalNewline(css);
  const safeJs = dropFinalNewline(js).replace(/<\/(script)/gi, '<\\/$1');
  // One pass with a function replacer: inserted text is never re-scanned, and `$&`, `$1` and friends
  // inside the code stay literal (a string replacement would interpret them).
  return shell.replace(PLACEHOLDER, (_, which) => (which === 'css' ? safeCss : safeJs));
}

module.exports = { assembleHtml };
