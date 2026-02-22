/**
 * Parse and validate JSON into FindIllustrationSpec (single or array).
 */

import type { FindIllustrationSpec, HandleSpec, DecorationType, VesselForm } from '../types/find';

const VESSEL_FORMS: VesselForm[] = [
  'pitcher', 'bowl', 'cup', 'pot', 'jar', 'goblet', 'fragment',
];

const DECORATION_TYPES: DecorationType[] = [
  'smooth', 'zigzag', 'verticalHatch', 'horizontalHatch',
  'diagonalHatch', 'crossHatch', 'stippling', 'circularImpressions',
];

function isProfilePoint(x: unknown): x is { x: number; y: number } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'x' in x &&
    'y' in x &&
    typeof (x as { x: unknown }).x === 'number' &&
    typeof (x as { y: unknown }).y === 'number'
  );
}

function isDecorationBand(x: unknown): x is { type: DecorationType; fromY: number; toY: number } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'type' in x &&
    'fromY' in x &&
    'toY' in x &&
    DECORATION_TYPES.includes((x as { type: unknown }).type as DecorationType) &&
    typeof (x as { fromY: unknown }).fromY === 'number' &&
    typeof (x as { toY: unknown }).toY === 'number'
  );
}

/** Validate and normalize a single spec from parsed JSON. Returns null if invalid. */
export function parseFindSpec(data: unknown): FindIllustrationSpec | null {
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : 'imported';
  const form = VESSEL_FORMS.includes(o.form as VesselForm) ? (o.form as VesselForm) : 'pot';
  const profile = Array.isArray(o.profile)
    ? o.profile.filter(isProfilePoint)
    : [];
  if (profile.length < 2) return null;
  const wallThickness =
    typeof o.wallThickness === 'number'
      ? o.wallThickness
      : Array.isArray(o.wallThickness) && o.wallThickness.every((n) => typeof n === 'number')
        ? (o.wallThickness as number[])
        : 0.05;
  const decorationBands = Array.isArray(o.decorationBands)
    ? o.decorationBands.filter(isDecorationBand)
    : [];

  const spec: FindIllustrationSpec = {
    id,
    form,
    profile,
    wallThickness,
    decorationBands,
  };
  if (typeof o.label === 'string') spec.label = o.label;
  if (o.isFragment === true) spec.isFragment = true;
  if (Array.isArray(o.breakLines) && o.breakLines.every((n) => typeof n === 'number')) {
    spec.breakLines = o.breakLines as number[];
  }
  const parseOneHandle = (x: unknown): HandleSpec | null => {
    if (
      typeof x !== 'object' || x === null ||
      typeof (x as { fromY: unknown }).fromY !== 'number' ||
      typeof (x as { toY: unknown }).toY !== 'number' ||
      typeof (x as { outward: unknown }).outward !== 'number'
    ) return null;
    const h = x as { fromY: number; toY: number; outward: number; apexY?: number; midT?: number; side?: string; decoration?: DecorationType };
    const side = h.side === 'right' ? 'right' : h.side === 'left' ? 'left' : undefined;
    const result: HandleSpec = {
      fromY: h.fromY,
      toY: h.toY,
      outward: h.outward,
      ...(side && { side }),
      decoration: DECORATION_TYPES.includes(h.decoration as DecorationType) ? h.decoration : undefined,
    };
    if (typeof h.apexY === 'number') result.apexY = h.apexY;
    if (typeof h.midT === 'number') result.midT = h.midT;
    return result;
  };
  if (Array.isArray(o.handles)) {
    const parsed = o.handles.map(parseOneHandle).filter((h): h is HandleSpec => h !== null);
    if (parsed.length) spec.handles = parsed.slice(0, 2);
  } else {
    const one = parseOneHandle(o.handle);
    if (one) spec.handles = [one];
  }
  const bd = o.baseDetail;
  if (bd === 'flat' || bd === 'ring' || bd === 'foot') spec.baseDetail = bd;
  const ws = typeof o.widthScale === 'number' ? o.widthScale : undefined;
  if (ws !== undefined && ws >= 0.25 && ws <= 2) spec.widthScale = ws;
  const hs = typeof o.heightScale === 'number' ? o.heightScale : undefined;
  if (hs !== undefined && hs >= 0.25 && hs <= 2) spec.heightScale = hs;

  return spec;
}

/** Extract embedded sculpture spec from an SVG file string (from our export). Returns null if not found or invalid. */
export function parseSpecFromSvg(svgString: string): FindIllustrationSpec | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const meta = doc.getElementById('arch2d-spec');
    if (!meta || !meta.textContent) return null;
    const data = JSON.parse(meta.textContent) as unknown;
    return parseFindSpec(data);
  } catch {
    return null;
  }
}

/** Parse file content as JSON and return one or more specs. */
export function parseImportJson(jsonString: string): FindIllustrationSpec[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return [];
  }
  if (Array.isArray(data)) {
    return data.map(parseFindSpec).filter((s): s is FindIllustrationSpec => s !== null);
  }
  const single = parseFindSpec(data);
  return single ? [single] : [];
}
