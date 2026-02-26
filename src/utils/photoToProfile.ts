/**
 * Extract a vessel profile from a side-view photo using CV:
 * grayscale → blur → binarize (Otsu) → largest component → half-width profile per row →
 * smooth → normalize & sample.
 */

import type { ProfilePoint, DecorationBand } from '../types/find';

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
  /** Shift binarization threshold (-30 to +30). Use when object is not clearly separated. */
  thresholdBias?: number;
  /** Morphological cleanup: 0 = off, 1 = light (fill holes), 2 = medium. Helps noisy/reflective photos. */
  cleanup?: 0 | 1 | 2;
  /** Stretch contrast to full range before binarization. Helps low-contrast images. */
  contrastStretch?: boolean;
}

function toGrayscale(data: Uint8ClampedArray, _w: number, _h: number): number[] {
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

/** Stretch grayscale to use full 0–255 range (helps low-contrast images). */
function contrastStretch(gray: number[]): number[] {
  let min = 255;
  let max = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  return gray.map((v) => Math.max(0, Math.min(255, ((v - min) / range) * 255)));
}

/** 3x3 dilate (expand foreground). */
function dilate3(fg: boolean[], w: number, h: number): boolean[] {
  const out = fg.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (fg[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (fg[(y + dy) * w + (x + dx)]) { out[y * w + x] = true; break; }
        }
    }
  }
  return out;
}

/** 3x3 erode (shrink foreground). */
function erode3(fg: boolean[], w: number, h: number): boolean[] {
  const out = fg.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!fg[y * w + x]) continue;
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (!fg[(y + dy) * w + (x + dx)]) { all = false; break; }
      if (!all) out[y * w + x] = false;
    }
  }
  return out;
}

/** Morphological close (dilate then erode) to fill small holes. */
function morphClose(fg: boolean[], w: number, h: number): boolean[] {
  return erode3(dilate3(fg, w, h), w, h);
}

/** Morphological open (erode then dilate) to remove small specks. */
function morphOpen(fg: boolean[], w: number, h: number): boolean[] {
  return dilate3(erode3(fg, w, h), w, h);
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

export interface ExtractProfileResult {
  profile: ProfilePoint[];
  decorationBands: DecorationBand[];
}

/**
 * Extract profile from a side-view photo.
 * Expects vessel as main dark or light region; returns normalized profile points (base → rim).
 * Uses midline half-width so x = 0 is centerline, x = 1 is outer edge.
 */
export function extractProfileFromImage(
  image: HTMLImageElement | HTMLCanvasElement,
  options: ExtractProfileOptions = {}
): ExtractProfileResult {
  const blurLevel = options.blur ?? 1;
  const smoothing = options.smoothing ?? 2;
  const targetPoints = Math.max(8, Math.min(24, options.targetPoints ?? DEFAULT_TARGET_POINTS));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { profile: [], decorationBands: [] };

  let w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  let h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    return { profile: [], decorationBands: [] };
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
  if (w < 1 || h < 1) return { profile: [], decorationBands: [] };

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(image, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  let gray = toGrayscale(imageData.data, w, h);
  if (options.contrastStretch) gray = contrastStretch(gray);
  if (blurLevel === 1) gray = blur3x3(gray, w, h);
  else if (blurLevel === 2) gray = blur5x5(gray, w, h);

  // Detect background color from image borders (helps with dark backgrounds)
  function detectBackgroundColor(gray: number[], w: number, h: number): { isDark: boolean; avgValue: number } {
    const borderPixels: number[] = [];
    // Sample border pixels (top, bottom, left, right edges)
    for (let x = 0; x < w; x++) {
      borderPixels.push(gray[x]); // top
      borderPixels.push(gray[(h - 1) * w + x]); // bottom
    }
    for (let y = 0; y < h; y++) {
      borderPixels.push(gray[y * w]); // left
      borderPixels.push(gray[y * w + w - 1]); // right
    }
    const avgBorder = borderPixels.reduce((a, b) => a + b, 0) / borderPixels.length;
    return { isDark: avgBorder < 128, avgValue: avgBorder };
  }

  let thresh = otsuThreshold(gray);
  const bias = Math.max(-50, Math.min(50, options.thresholdBias ?? 0));
  thresh = Math.max(0, Math.min(255, thresh + bias));

  // Auto-detect foreground/background if not explicitly set
  let darkIsForeground = options.invert !== undefined ? options.invert : true;
  
  if (options.invert === undefined) {
    // Check border to determine likely background
    const bgInfo = detectBackgroundColor(gray, w, h);
    // If border is dark, background is likely dark, so foreground is light
    // If border is light, background is likely light, so foreground is dark
    darkIsForeground = !bgInfo.isDark;
  }

  let fg = binarize(gray, thresh, darkIsForeground);

  if (options.invert === undefined) {
    const fgCount = fg.filter(Boolean).length;
    const total = gray.length;
    const frac = fgCount / total;
    
    // If foreground fraction is too small or too large, try inverting
    if (frac < 0.12 || frac > 0.88) {
      darkIsForeground = !darkIsForeground;
      fg = binarize(gray, thresh, darkIsForeground);
    }
    
    const fgCount2 = fg.filter(Boolean).length;
    const frac2 = fgCount2 / total;
    
    // If still problematic, try adjusting threshold
    if (frac2 < 0.12 || frac2 > 0.88) {
      const bgInfo = detectBackgroundColor(gray, w, h);
      // Adjust threshold toward background color to better separate
      const threshAlt = bgInfo.isDark 
        ? Math.max(0, Math.min(255, thresh - 30)) // dark bg: lower threshold
        : Math.max(0, Math.min(255, thresh + 30)); // light bg: higher threshold
      const fgAlt = binarize(gray, threshAlt, !bgInfo.isDark);
      const fracAlt = fgAlt.filter(Boolean).length / total;
      if (fracAlt >= 0.12 && fracAlt <= 0.88) {
        fg = fgAlt;
        darkIsForeground = !bgInfo.isDark;
      }
    }
  }

  fg = keepLargestComponent(fg, w, h);

  const cleanupLevel = options.cleanup ?? 0;
  if (cleanupLevel >= 1) {
    // Fill small holes (helps with decorated vessels)
    fg = morphClose(fg, w, h);
    fg = keepLargestComponent(fg, w, h);
  }
  if (cleanupLevel >= 2) {
    // More aggressive: remove small specks, then fill holes
    fg = morphOpen(fg, w, h);
    fg = morphClose(fg, w, h);
    fg = keepLargestComponent(fg, w, h);
  }

  // For decorated vessels, try to extract outer contour by filling from edges
  // This helps when internal decorations create holes in the binarized image
  function fillFromEdges(fg: boolean[], w: number, h: number): boolean[] {
    // Mark all pixels connected to edges as background
    const isBackground = new Array(w * h).fill(false);
    const visited = new Set<number>();
    const queue: number[] = [];
    
    // Add edge pixels that are NOT foreground (i.e., background) to queue
    // Skip bottom edge since vessel base often touches it
    for (let x = 0; x < w; x++) {
      const topIdx = x;
      if (!fg[topIdx]) queue.push(topIdx); // top edge only
    }
    for (let y = 0; y < h; y++) {
      const leftIdx = y * w;
      const rightIdx = y * w + w - 1;
      if (!fg[leftIdx]) queue.push(leftIdx); // left edge
      if (!fg[rightIdx]) queue.push(rightIdx); // right edge
    }
    
    // Flood fill from edges: mark all background pixels connected to edges
    while (queue.length > 0) {
      const idx = queue.shift()!;
      if (visited.has(idx) || fg[idx]) continue; // Skip if visited or is foreground
      visited.add(idx);
      isBackground[idx] = true;
      
      const x = idx % w;
      const y = Math.floor(idx / w);
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && !visited.has(n) && !fg[n]) {
          queue.push(n);
        }
      }
    }
    
    // Result: foreground is everything NOT marked as background (vessel + internal holes)
    // Then we'll use keepLargestComponent to get just the vessel
    return isBackground.map(v => !v);
  }

  // Apply edge-based filling if cleanup is enabled and original extraction looks problematic
  // This helps with decorated vessels where internal decorations create holes
  if (cleanupLevel >= 1) {
    const fgCount = fg.filter(Boolean).length;
    const total = w * h;
    const fracOriginal = fgCount / total;
    
    // Only use edge-filling if the original extraction seems problematic
    // (too small/large fraction suggests binarization issues)
    if (fracOriginal < 0.12 || fracOriginal > 0.88) {
      const fgFilled = fillFromEdges(fg, w, h);
      const fgFilledCount = fgFilled.filter(Boolean).length;
      const fracFilled = fgFilledCount / total;
      
      // Use filled version if it gives a more reasonable foreground fraction
      if (fracFilled >= 0.12 && fracFilled <= 0.88) {
        fg = keepLargestComponent(fgFilled, w, h);
      }
    }
  }

  // Extract outer contour using edge detection - this helps with decorated vessels
  // where binarization picks up internal decorations
  function extractOuterContour(fg: boolean[], w: number, h: number): boolean[] {
    const contour = new Array(w * h).fill(false);
    
    // For each row, find the leftmost and rightmost foreground pixels
    // This gives us the outer silhouette, ignoring internal decorations
    for (let y = 0; y < h; y++) {
      let leftmost = -1;
      let rightmost = -1;
      
      // Find leftmost foreground pixel
      for (let x = 0; x < w; x++) {
        if (fg[y * w + x]) {
          leftmost = x;
          break;
        }
      }
      
      // Find rightmost foreground pixel
      for (let x = w - 1; x >= 0; x--) {
        if (fg[y * w + x]) {
          rightmost = x;
          break;
        }
      }
      
      // Fill between leftmost and rightmost (outer contour)
      if (leftmost >= 0 && rightmost >= leftmost) {
        for (let x = leftmost; x <= rightmost; x++) {
          contour[y * w + x] = true;
        }
      }
    }
    
    return contour;
  }

  // Use outer contour extraction for better results with decorated vessels
  // This fills the space between leftmost and rightmost edges, ignoring internal holes
  fg = extractOuterContour(fg, w, h);

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
  if (height < 10) return { profile: [], decorationBands: [] };

  // Find the overall centerline of the vessel (axis of symmetry)
  // Use the median x-position of foreground pixels across all rows for robustness
  const xPositions: number[] = [];
  for (let y = yMin; y <= yMax; y++) {
    for (let x = 0; x < w; x++) {
      if (fg[y * w + x]) {
        xPositions.push(x);
      }
    }
  }
  xPositions.sort((a, b) => a - b);
  const centerlineX = xPositions.length > 0 
    ? xPositions[Math.floor(xPositions.length / 2)]
    : Math.floor((xMin + xMax) / 2);

  // Determine which side to extract (left or right of centerline)
  // For side-view photos, we want the side with more pixels (the visible side)
  let leftPixels = 0;
  let rightPixels = 0;
  for (let y = yMin; y <= yMax; y++) {
    for (let x = 0; x < w; x++) {
      if (fg[y * w + x]) {
        if (x < centerlineX) leftPixels++;
        else if (x > centerlineX) rightPixels++;
      }
    }
  }
  const extractRightSide = rightPixels >= leftPixels;

  // Per row: find distance from centerline to outer edge on ONE SIDE only
  // This gives the true half-profile for a side-view photo
  let maxRadius = 0;
  const radiusByRow: number[] = [];
  for (let y = yMin; y <= yMax; y++) {
    let maxDist = 0;
    if (extractRightSide) {
      // Extract right side: find rightmost pixel distance from centerline
      for (let x = centerlineX; x < w; x++) {
        if (fg[y * w + x]) {
          const dist = x - centerlineX;
          if (dist > maxDist) maxDist = dist;
        }
      }
    } else {
      // Extract left side: find leftmost pixel distance from centerline
      for (let x = centerlineX; x >= 0; x--) {
        if (fg[y * w + x]) {
          const dist = centerlineX - x;
          if (dist > maxDist) maxDist = dist;
        }
      }
    }
    radiusByRow.push(maxDist);
    if (maxDist > maxRadius) maxRadius = maxDist;
  }
  if (maxRadius < 2) return { profile: [], decorationBands: [] };

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

  return { profile: out, decorationBands: [] };
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}
