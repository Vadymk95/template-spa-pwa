#!/usr/bin/env node
// Generates "REPLACE ME" placeholder PWA icons in public/icons/.
// Pure Node — no image libraries. Solid red (#dc2626) with a centered white
// "PWA" stamp drawn from a hand-coded 5x7 bitmap font.
//
// Re-run after editing palette / mark; commit the resulting PNGs.
// Forks MUST replace these before deploying — see .cursor/brain/PWA.md.

import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(__dirname, '..', 'public', 'icons');

const RED = [0xdc, 0x26, 0x26];
const WHITE = [0xff, 0xff, 0xff];

// 5x7 bitmap font: only glyphs needed for "PWA" + "REPLACE ME".
const FONT = {
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    W: ['10001', '10001', '10001', '10001', '10101', '11011', '10001'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

const drawText = (canvas, text, startX, startY, scale, color) => {
    const w = canvas.width;
    let cursorX = startX;
    for (const ch of text) {
        const glyph = FONT[ch];
        if (!glyph) {
            cursorX += 6 * scale;
            continue;
        }
        for (let gy = 0; gy < 7; gy++) {
            for (let gx = 0; gx < 5; gx++) {
                if (glyph[gy][gx] !== '1') continue;
                for (let py = 0; py < scale; py++) {
                    for (let px = 0; px < scale; px++) {
                        const x = cursorX + gx * scale + px;
                        const y = startY + gy * scale + py;
                        if (x < 0 || y < 0 || x >= w || y >= canvas.height) continue;
                        const i = (y * w + x) * 3;
                        canvas.pixels[i] = color[0];
                        canvas.pixels[i + 1] = color[1];
                        canvas.pixels[i + 2] = color[2];
                    }
                }
            }
        }
        cursorX += 6 * scale;
    }
};

const makeCanvas = (size, bg) => {
    const pixels = Buffer.alloc(size * size * 3);
    for (let i = 0; i < pixels.length; i += 3) {
        pixels[i] = bg[0];
        pixels[i + 1] = bg[1];
        pixels[i + 2] = bg[2];
    }
    return { width: size, height: size, pixels };
};

const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBytes = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([len, typeBytes, data, crc]);
};

const encodePNG = (canvas) => {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(canvas.width, 0);
    ihdr.writeUInt32BE(canvas.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: RGB
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    const stride = canvas.width * 3;
    const filtered = Buffer.alloc((stride + 1) * canvas.height);
    for (let y = 0; y < canvas.height; y++) {
        filtered[y * (stride + 1)] = 0; // filter: none
        canvas.pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const idat = deflateSync(filtered);

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0))
    ]);
};

const drawIcon = (size) => {
    const canvas = makeCanvas(size, RED);
    // Center-anchored "PWA" marker, then "REPLACE ME" below — both white on red.
    const titleScale = Math.max(2, Math.floor(size / 32));
    const titleW = 'PWA'.length * 6 * titleScale - titleScale;
    drawText(
        canvas,
        'PWA',
        Math.floor((size - titleW) / 2),
        Math.floor(size * 0.32),
        titleScale,
        WHITE
    );

    const subScale = Math.max(1, Math.floor(size / 80));
    const subW = 'REPLACE ME'.length * 6 * subScale - subScale;
    drawText(
        canvas,
        'REPLACE ME',
        Math.floor((size - subW) / 2),
        Math.floor(size * 0.6),
        subScale,
        WHITE
    );
    return canvas;
};

const TARGETS = [
    { name: '192x192.png', size: 192 },
    { name: '512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 }
];

mkdirSync(ICONS_DIR, { recursive: true });
for (const { name, size } of TARGETS) {
    const png = encodePNG(drawIcon(size));
    const outPath = resolve(ICONS_DIR, name);
    writeFileSync(outPath, png);
    console.log(`wrote ${outPath} (${size}x${size}, ${png.length} bytes)`);
}
