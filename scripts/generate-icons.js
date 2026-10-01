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
//
// Design: Bold K letterform with a short medical-cross arm extending left.
//
//   ┌─ stem ─┐
//   │        │╲ upper arm
//   │   ┤    │  ╲
//   │        │  ╱ lower arm
//   │        │╱
//
// The left stub (┤) is the cross arm. The stem's vertical bar doubles as
// the cross's vertical bar. Trapezoid arms give consistent-looking strokes
// while keeping the K's mouth clearly open to the right.
//
// All coordinates are on a 1024×1024 canvas.
// Horizontal: content spans x=143–880 (737 px), centred with 143 px margins.
// Vertical:   content spans y=182–842 (660 px), centred with 182 px margins.
// All four bars are exactly 100 px wide, so the cross and K arms share
// a unified stroke weight. The cross arm (left stub) sits at y=462-562,
// which is the exact height of the K's mid-notch — they are one element.
// Arms are parallelograms (both edges parallel) so stroke width is
// constant along the full length of each arm.
//
// Horizontal span: x=162–862 = 700 px → centred with 162 px margins.
// Vertical span:   y=182–842 = 660 px → centred with 182 px margins.
const MARK_SHAPES = `
  <rect    x="162" y="462" width="100" height="100"/>
  <rect    x="262" y="182" width="100" height="660"/>
  <polygon points="362,362 862,182 862,282 362,462"/>
  <polygon points="362,562 862,730 862,830 362,662"/>`;

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
