/**
 * Two bundles: the worker, and the panel that runs inside the page.
 *
 * The panel is an IIFE because it is injected into arbitrary documents, and
 * nothing from the worker's scope should ever be serialised into one.
 */
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
const common = { bundle: true, minify: true, target: 'chrome120', logLevel: 'warning' };

await Promise.all([
  build({
    ...common,
    entryPoints: ['background.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  }),
  build({ ...common, entryPoints: ['panel-entry.ts'], outfile: 'dist/panel.js', format: 'iife' }),
  build({ ...common, entryPoints: ['popup.ts'], outfile: 'dist/popup.js', format: 'esm' }),
]);

for (const f of fs.readdirSync('dist')) {
  console.log(`dist/${f}  ${(fs.statSync(`dist/${f}`).size / 1024).toFixed(1)} KB`);
}
