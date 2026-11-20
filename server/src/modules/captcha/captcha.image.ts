import crypto from 'node:crypto';

/**
 * 用 5x7 点阵字模拼 SVG 矩形，而不是直接输出 <text>。
 * 这样验证码不会以可读文本出现在响应里，简单脚本无法直接提取字符。
 */
const GLYPHS: Record<string, string[]> = {
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
};

const COLORS = ['#1b4f8a', '#0f6b5c', '#8a3b1b', '#5b2a86', '#166534'];
const SCALE = 4;
const GLYPH_WIDTH = 5 * SCALE;
const GLYPH_HEIGHT = 7 * SCALE;
const IMAGE_WIDTH = 132;
const IMAGE_HEIGHT = 48;
const CHAR_GAP = 8;

function randomInt(min: number, max: number): number {
  return crypto.randomInt(min, max);
}

function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length)];
}

/** 每行连续像素合并成一个 rect，减少 SVG 体积 */
function glyphToRects(pattern: string[]): string {
  let rects = '';
  for (let row = 0; row < pattern.length; row += 1) {
    const line = pattern[row];
    let column = 0;
    while (column < line.length) {
      if (line[column] !== '1') {
        column += 1;
        continue;
      }
      let end = column;
      while (end + 1 < line.length && line[end + 1] === '1') end += 1;
      rects += `<rect x="${column * SCALE}" y="${row * SCALE}" width="${(end - column + 1) * SCALE}" height="${SCALE}" rx="0.8"/>`;
      column = end + 1;
    }
  }
  return rects;
}

export function randomCaptchaCode(length = 4): string {
  const chars = Object.keys(GLYPHS);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += pick(chars);
  }
  return code;
}

export function renderCaptchaSvg(code: string): string {
  const chars = [...code];
  const totalWidth = chars.length * GLYPH_WIDTH + (chars.length - 1) * CHAR_GAP;
  const startX = Math.max(6, Math.round((IMAGE_WIDTH - totalWidth) / 2));

  const groups = chars
    .map((char, index) => {
      const pattern = GLYPHS[char];
      if (!pattern) return '';
      const x = startX + index * (GLYPH_WIDTH + CHAR_GAP) + randomInt(-2, 3);
      const y = randomInt(9, 15);
      const rotate = randomInt(-12, 13);
      return `<g transform="translate(${x} ${y}) rotate(${rotate} ${GLYPH_WIDTH / 2} ${GLYPH_HEIGHT / 2})" fill="${pick(COLORS)}">${glyphToRects(pattern)}</g>`;
    })
    .join('');

  const lines = Array.from({ length: 4 }, () => {
    const x1 = randomInt(0, IMAGE_WIDTH);
    const y1 = randomInt(0, IMAGE_HEIGHT);
    const x2 = randomInt(0, IMAGE_WIDTH);
    const y2 = randomInt(0, IMAGE_HEIGHT);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${pick(COLORS)}" stroke-width="1" opacity="0.26"/>`;
  }).join('');

  const dots = Array.from({ length: 18 }, () => {
    const cx = randomInt(0, IMAGE_WIDTH);
    const cy = randomInt(0, IMAGE_HEIGHT);
    const r = randomInt(1, 3);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pick(COLORS)}" opacity="0.18"/>`;
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" role="img" aria-label="验证码">`,
    `<rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="#f3f7fc"/>`,
    lines,
    dots,
    groups,
    '</svg>',
  ].join('');
}

export function renderCaptchaDataUrl(code: string): string {
  const svg = renderCaptchaSvg(code);
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
