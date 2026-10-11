// Unit tests for scripts/lib/assemble-html.js (plain Node, no browser).
const assert = require('assert');
const { assembleHtml } = require('../scripts/lib/assemble-html');

const shell = '<style>\n{{css}}\n</style>\n<script>{{js}}\n</script>\n';

// The final newline of each file belongs to the shell, so the output has no blank lines.
assert.strictEqual(
  assembleHtml({ shell, css: 'a{}\n', js: 'x();\n' }),
  '<style>\na{}\n</style>\n<script>x();\n</script>\n',
);

// Replacement patterns in the code stay literal.
const tricky = 'a = "$&" + "$1" + "$$" + "$`" + "$\'";\n';
assert.ok(assembleHtml({ shell, css: '\n', js: tricky }).includes(tricky.slice(0, -1)));

// "</script" inside the code would end the element early, so it is escaped (case preserved).
const escaped = assembleHtml({ shell, css: '\n', js: 's = "</script>" + "</SCRIPT>";\n' });
assert.ok(escaped.includes('s = "<\\/script>" + "<\\/SCRIPT>";'));
assert.strictEqual((escaped.match(/<\/script/gi) || []).length, 1, 'only the real closing tag remains');

// Inserted text is never re-scanned for placeholders.
assert.ok(assembleHtml({ shell, css: 'a::after{content:"{{js}}"}\n', js: 'x();\n' }).includes('content:"{{js}}"'));

// A stylesheet containing "</style" cannot be inlined safely.
assert.throws(() => assembleHtml({ shell, css: '/* </style> */\n', js: 'x();\n' }), /<\/style/);

// The shell must contain each placeholder exactly once.
assert.throws(() => assembleHtml({ shell: '<script>{{js}}</script>', css: '\n', js: '\n' }), /\{\{css\}\} exactly once, found 0/);
assert.throws(() => assembleHtml({ shell: shell + '{{js}}', css: '\n', js: '\n' }), /\{\{js\}\} exactly once, found 2/);

console.log('assemble_html OK');
