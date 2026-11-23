/* Production-readiness checks on the shipped bundle.
 *
 *   node tests/offline.test.mjs
 *
 * The point of this file is the promise in the README: double-click dist/index.html
 * on a laptop with no internet and the game still runs. That is only true if the
 * bundle makes no network requests, so that is what gets asserted.
 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

let dist = '';
let distError = '';
try {
  dist = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
} catch (err) {
  distError = err.message;
}

check('dist/index.html exists', !distError, distError);

if (dist) {
  const external = dist.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
  check('bundle makes no external requests', external.length === 0, external.join(', '));

  check('no un-inlined local script tags', !/<script src="(?:src|vendor)\//.test(dist));
  check('vendored Three.js is present', /THREE\.REVISION|three\.js/i.test(dist));
  check('rules engine is present', dist.includes('function applyAction') || dist.includes('applyAction'));
  check('world builders are present', dist.includes('buildLighthouse') || dist.includes('Lighthouse'));
  check('audio engine is present', dist.includes('AudioContext') || dist.includes('webkitAudioContext'));
  check('touch controls are present', dist.includes('ontouchstart') || dist.includes('isTouch'));

  // A single file that references a sibling file would break on a USB stick.
  const localRefs = dist.match(/(?:src|href)="(?!https?:|#|data:)([^"]+)"/g) || [];
  check('no relative file references', localRefs.length === 0, localRefs.join(', '));

  const kb = statSync(join(root, 'dist', 'index.html')).size / 1024;
  check('bundle is a sane size (< 2 MB)', kb < 2048, kb.toFixed(0) + ' KB');
}

/* Dependency and version information must be recorded, not guessed at. */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
check('package.json declares no runtime dependencies', Object.keys(pkg.dependencies || {}).length === 0,
  JSON.stringify(pkg.dependencies || {}));
check('Three.js version recorded in package.json', /^0\.\d+\.\d+$/.test(pkg.three || ''), pkg.three);

const vendor = readFileSync(join(root, 'vendor', 'three.min.js'));
const digest = createHash('sha256').update(vendor).digest('hex');
check('vendored Three.js matches the recorded checksum', digest === pkg.threeSha256,
  digest.slice(0, 16) + '… vs ' + String(pkg.threeSha256).slice(0, 16) + '…');
check('vendored Three.js source URL is pinned to the declared version',
  typeof pkg.threeSource === 'string' && pkg.threeSource.includes('three@' + pkg.three + '/'),
  pkg.threeSource);

const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(results.map((r) => r[0].padEnd(5) + ' | ' + r[1].padEnd(42) + ' | ' + r[2]).join('\n'));
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
