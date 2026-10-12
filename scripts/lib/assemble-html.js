'use strict';
// Splices a planner's stylesheet, script and shared HTML partials into its HTML shell.
//
// The shell holds the markup plus two placeholders: {{css}} inside <style> and {{js}} inside <script>, and
// include lines, `<!-- @@include name -->`, each replaced by the text of partials[name] (a file under
// src/shared/partials/). css, js and each partial are passed as read from disk (each ends with a newline); the
// shell supplies the newline that follows the placeholder or include line.

const PLACEHOLDER = /\{\{(css|js)\}\}/g;
const INCLUDE = /^[ \t]*<!-- @@include (\S+) -->[ \t]*$/gm;

const count = (text, token) => text.split(token).length - 1;
const dropFinalNewline = (text) => text.replace(/\n$/, '');

function assembleHtml({ shell, css, js, partials = {} }) {
  const withPartials = shell.replace(INCLUDE, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(partials, name)) throw new Error(`the shell includes "${name}", which is not a partial`);
    return dropFinalNewline(partials[name]);
  });
  for (const token of ['{{css}}', '{{js}}']) {
    const found = count(withPartials, token);
    if (found !== 1) throw new Error(`shell must contain ${token} exactly once, found ${found}`);
  }
  if (/<\/style/i.test(css)) throw new Error('stylesheet contains "</style", which would end the <style> element early');
  const safeCss = dropFinalNewline(css);
  const safeJs = dropFinalNewline(js).replace(/<\/(script)/gi, '<\\/$1');
  // One pass with a function replacer: inserted text is never re-scanned, and `$&`, `$1` and friends
  // inside the code stay literal (a string replacement would interpret them).
  return withPartials.replace(PLACEHOLDER, (_, which) => (which === 'css' ? safeCss : safeJs));
}

module.exports = { assembleHtml };
