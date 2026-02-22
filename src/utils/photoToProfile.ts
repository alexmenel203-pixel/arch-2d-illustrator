/**
 * Extract a vessel profile from a side-view photo using CV:
 * grayscale → blur → binarize (Otsu) → largest component → half-width profile per row →
 * smooth → normalize & sample.
 */

import type { ProfilePoint } from '../types/find';

const MAX_WIDTH = 500;
/** Max pixels to process (avoid "array length must be a positive integer of safe magnitude" on mobile) */
const MAX_PIXELS = 500 * 800;
const DEFAULT_TARGET_POINTS = 18;

/** Options for profile extraction (exposed in UI). */
export interface ExtractProfileOptions {
  /** Apply blur before binarization (reduces noise). 0 = off, 1 = 3x3, 2 = 5x5. */
  blur?: 0 | 1 | 2;
  /** Median filter half-window for smoothing profile (0 = no smooth). */
  smoothing?: number;
  /** Force dark=foreground (true) or light=foreground (false). Undefined = auto. */
  invert?: boolean;
  /** Number of profile points to output (8–24). */
  targetPoints?: number;
}

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return out;
}

/** 3x3 box blur on grayscale (reduces noise before binarization) */
function blur3x3(gray: number[], width: number, height: number): number[] {
  const out = gray.slice();
  const w = width;
  const h = height;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) sum += gray[(y + dy) * w + (x + dx)];
      out[y * w + x] = sum / 9;
    }
  }
  return out;
}

/** 5x5 box blur (stronger smoothing) */
function blur5x5(gray: number[], width: number, height: number): number[] {
  const out = gray.slice();
  const w = width;
  const h = height;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) sum += gray[(y + dy) * w + (x + dx)];
      out[y * w + x] = sum / 25;
    }
  }
  return out;
}

/** Otsu threshold */
function otsuThreshold(gray: number[]): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.min(255, Math.floor(gray[i]))]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVar = 0;
  let bestT = 0;
  const total = gray.length;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) ** 2;
    if (varBetween > maxVar) {
      maxVar = varBetween;
      bestT = t;
    }
  }
  return bestT;
}

function binarize(gray: number[], threshold: number, darkIsForeground: boolean): boolean[] {
  return gray.map((g) => (darkIsForeground ? g <= threshold : g >= threshold));
}

/** Label connected components (4-connectivity); returns label array and count. */
function labelComponents(fg: boolean[], width: number, height: number): { labels: number[]; count: number } {
  const n = width * height;
  const labels = new Array(n).fill(0);
  let nextLabel = 1;
  const parent: number[] = [];
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!fg[i]) continue;
      const left = x > 0 ? labels[i - 1] : 0;
      const up = y > 0 ? labels[i - width] : 0;
      if (left && up) {
        const rl = find(left);
        const ru = find(up);
        const r = Math.min(rl, ru);
        parent[rl] = parent[ru] = r;
        labels[i] = r;
      } else if (left) labels[i] = find(left);
      else if (up) labels[i] = find(up);
      else {
        labels[i] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel++;
      }
    }
  }

  const root = (l: number) => (l === 0 ? 0 : find(l));
  for (let i = 0; i < n; i++) if (labels[i]) labels[i] = root(labels[i]);
  const uniq = new Set(labels.filter((l) => l > 0));
  return { labels, count: uniq.size };
}

/** Keep only the largest connected component. */
function keepLargestComponent(fg: boolean[], width: number, height: number): boolean[] {
  const { labels } = labelComponents(fg, width, height);
  const counts = new Map<number, number>();
  for (const l of labels) if (l > 0) counts.set(l, (counts.get(l) ?? 0) + 1);
  let bestLabel = 0;
  let bestCount = 0;
  for (const [l, c] of counts) if (c > bestCount) {
    bestCount = c;
    bestLabel = l;
  }
  return fg.map((v, i) => v && labels[i] === bestLabel);
}

/** 1D median filter (odd window) to smooth profile radii. */
function medianFilter(arr: number[], halfWindow: number): number[] {
  const out: number[] = [];
  const n = arr.length;
  const win = 2 * halfWindow + 1;
  const buf: number[] = [];
  for (let i = 0; i < n; i++) {
    buf.length = 0;
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const k = Math.max(0, Math.min(n - 1, i + j));
      buf.push(arr[k]);
    }
    buf.sort((a, b) => a - b);
    out.push(buf[Math.floor(buf.length / 2)]);
  }
  return out;
}

/**
 * Extract profile from a side-view photo.
 * Expects vessel as main dark or light region; returns normalized profile points (base → rim).
 * Uses midline half-width so x = 0 is centerline, x = 1 is outer edge.
 */
export function extractProfileFromImage(
  image: HTMLImageElement | HTMLCanvasElement,
  options: ExtractProfileOptions = {}
): ProfilePoint[] {
  const blurLevel = options.blur ?? 1;
  const smoothing = options.smoothing ?? 2;
  const targetPoints = Math.max(8, Math.min(24, options.targetPoints ?? DEFAULT_TARGET_POINTS));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  let w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  let h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    return [];
  }
  if (w > MAX_WIDTH) {
    h = Math.floor((h * MAX_WIDTH) / w);
    w = MAX_WIDTH;
  }
  if (w * h > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (w * h));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
  }
  w = Math.floor(w);
  h = Math.floor(h);
  if (w < 1 || h < 1) return [];

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(image, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  let gray = toGrayscale(imageData.data, w, h);
  if (blurLevel === 1) gray = blur3x3(gray, w, h);
  else if (blurLevel === 2) gray = blur5x5(gray, w, h);

  const thresh = otsuThreshold(gray);
  const darkIsForeground =
    options.invert !== undefined ? options.invert : true;
  let fg = binarize(gray, thresh, darkIsForeground);
  if (options.invert === undefined) {
    const fgCount = fg.filter(Boolean).length;
    if (fgCount < gray.length * 0.15 || fgCount > gray.length * 0.85) {
      fg = binarize(gray, thresh, !darkIsForeground);
    }
  }

  fg = keepLargestComponent(fg, w, h);

  // Bounding box of foreground (vessel)
  let yMin = h;
  let yMax = 0;
  let xMin = w;
  let xMax = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (fg[y * w + x]) {
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
      }
    }
  }
  const height = yMax - yMin + 1;
  if (height < 10) return [];

  // Per row: left/right extent → half-width (radius from midline). Profile x = radius / maxRadius.
  let maxRadius = 0;
  const radiusByRow: number[] = [];
  for (let y = yMin; y <= yMax; y++) {
    let left = w;
    let right = -1;
    for (let x = 0; x < w; x++) {
      if (fg[y * w + x]) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    const halfWidth = right >= left ? (right - left) / 2 : 0;
    radiusByRow.push(halfWidth);
    if (halfWidth > maxRadius) maxRadius = halfWidth;
  }
  if (maxRadius < 2) return [];

  const smoothed =
    smoothing > 0 ? medianFilter(radiusByRow, Math.min(smoothing, 5)) : radiusByRow;

  // Normalize: y 0 = base (bottom), 1 = rim (top); x 0 = center, 1 = max radius
  const rawPoints: ProfilePoint[] = [];
  const len = smoothed.length;
  for (let i = 0; i < len; i++) {
    const yNorm = len > 1 ? 1 - i / (len - 1) : 0.5;
    const xNorm = maxRadius > 0 ? Math.min(1, smoothed[i] / maxRadius) : 0;
    rawPoints.push({ x: xNorm, y: yNorm });
  }

  // Downsample to targetPoints (evenly spaced by y)
  const out: ProfilePoint[] = [];
  for (let k = 0; k < targetPoints; k++) {
    const yTarget = targetPoints > 1 ? k / (targetPoints - 1) : 0.5;
    let best = rawPoints[0];
    let bestDy = Math.abs(rawPoints[0].y - yTarget);
    for (let i = 1; i < rawPoints.length; i++) {
      const dy = Math.abs(rawPoints[i].y - yTarget);
      if (dy < bestDy) {
        bestDy = dy;
        best = rawPoints[i];
      }
    }
    out.push({ ...best });
  }
  out[0].y = 0;
  out[out.length - 1].y = 1;
  out.sort((a, b) => a.y - b.y);

  return out;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}
