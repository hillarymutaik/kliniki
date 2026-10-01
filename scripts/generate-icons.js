// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ASSETS = path.join(__dirname, '..', 'assets', 'images');

function render(svg, width, height) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

// ─── SVG templates ──────────────────────────────────────────────────────────

// Shared mark definition (white shapes, no background)
const MARK_SHAPES = `
  <rect x="178" y="447" width="131" height="130"/>
  <rect x="309" y="182" width="146" height="660"/>
  <rect x="455" y="447" width="440" height="130" transform="rotate(-37, 455, 512)"/>
  <rect x="455" y="447" width="440" height="130" transform="rotate(37, 455, 512)"/>`;

// Mark only (white on transparent) – used for splash, android foreground
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g fill="white">${MARK_SHAPES}
  </g>
</svg>`;

// Full icon (green gradient bg + white mark)
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#25866B"/>
      <stop offset="100%" stop-color="#186549"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <g fill="white">${MARK_SHAPES}
  </g>
</svg>`;

// Android background – solid brand green, full square
const ANDROID_BG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#1F7A5A"/>
</svg>`;

// Monochrome – white mark on transparent (Android tints this at runtime)
const MONOCHROME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g fill="white">${MARK_SHAPES}
  </g>
</svg>`;

// ─── Generate ────────────────────────────────────────────────────────────────

const assets = [
  { name: 'icon.png',                     svg: ICON_SVG,      size: 1024 },
  { name: 'splash-icon.png',              svg: MARK_SVG,      size: 480  },
  { name: 'favicon.png',                  svg: ICON_SVG,      size: 64   },
  { name: 'android-icon-foreground.png',  svg: MARK_SVG,      size: 1024 },
  { name: 'android-icon-background.png',  svg: ANDROID_BG_SVG, size: 1024 },
  { name: 'android-icon-monochrome.png',  svg: MONOCHROME_SVG, size: 1024 },
];

for (const { name, svg, size } of assets) {
  const png = render(svg, size, size);
  const dest = path.join(ASSETS, name);
  fs.writeFileSync(dest, png);
  console.log(`✓ ${name} (${size}×${size})`);
}
