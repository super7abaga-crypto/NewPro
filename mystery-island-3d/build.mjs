/* Build step: inline src/*.js into a single dist/index.html.
 *
 * The game is developed as separate files (rules / world / audio / ui), but
 * shipping one file means it can be opened from disk, dropped on a USB stick,
 * or served by anything, with no module resolution to go wrong.
 *
 *   node build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

let out = html;
let inlined = 0;
const pattern = /<script src="((?:src|vendor)\/[^"]+)"><\/script>/g;

out = out.replace(pattern, (_match, path) => {
  const code = readFileSync(join(here, path), 'utf8');
  inlined += 1;
  return '<script>\n/* ==== ' + path + ' ==== */\n' + code + '\n</script>';
});

// Embed the character model so the single file stays self-contained.
try {
  const glb = readFileSync(join(here, 'assets/survivor.glb'));
  const b64 = glb.toString('base64');
  out = out.replace('</head>', '<script>window.__SURVIVOR_GLB="data:model/gltf-binary;base64,' + b64 + '";</script>\n</head>');
  console.log('character embedded: ' + (glb.length / 1048576).toFixed(2) + ' MB');
} catch (err) {
  console.log('no character model to embed (fallback rig will be used)');
}

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), out, 'utf8');

const remaining = out.match(/<script src="[^"]+"><\/script>/g) || [];
console.log('inlined ' + inlined + ' local scripts');
console.log('external scripts left: ' + remaining.length + (remaining.length ? ' → ' + remaining.join(', ') : ''));
console.log('dist/index.html written: ' + (out.length / 1024).toFixed(1) + ' KB');
if (remaining.length) {
  console.error('ERROR: a script was not inlined: ' + remaining.join(', '));
  process.exit(1);
}
const external = out.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
if (external.length) {
  console.error('ERROR: dist still reaches the network: ' + external.join(', '));
  process.exit(1);
}
console.log('offline check: dist makes zero external requests');
