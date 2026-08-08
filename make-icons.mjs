/**
 * Generate the icon set from one SVG, so every size comes from the same source.
 * Flat fills only: the SVG rasteriser available here silently drops gradients
 * to black.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#15131c"/>
  <!-- A slip of paper with a line pulled out of it and translated: the top
       line is the raw string, the one below is what it turns out to mean. -->
  <rect x="26" y="30" width="76" height="10" rx="5" fill="#4a4560"/>
  <rect x="26" y="48" width="56" height="10" rx="5" fill="#4a4560"/>
  <rect x="26" y="72" width="76" height="12" rx="6" fill="#f0c86a"/>
  <rect x="26" y="92" width="44" height="12" rx="6" fill="#f0c86a"/>
  <circle cx="90" cy="98" r="6" fill="#4a4560"/>
</svg>`;

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync('icons/icon.svg', svg);

for (const size of [16, 32, 48, 128, 512]) {
  execFileSync('convert', [
    '-background',
    'none',
    '-density',
    '900',
    'icons/icon.svg',
    '-resize',
    `${size}x${size}`,
    `icons/icon-${size}.png`,
  ]);
  console.log(`icons/icon-${size}.png  ${fs.statSync(`icons/icon-${size}.png`).size} B`);
}
