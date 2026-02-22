/**
 * Data model for archaeological sculptures and their 2D technical illustration.
 * Supports vessels (complete/reconstructible) and fragments with
 * half-exterior / half-section convention and surface decoration.
 */

export type DecorationType =
  | 'smooth'
  | 'zigzag'
  | 'verticalHatch'
  | 'horizontalHatch'
  | 'diagonalHatch'
  | 'crossHatch'
  | 'stippling'
  | 'circularImpressions';

/** Normalized vertical band (0–1 from base to rim) where a decoration applies */
export interface DecorationBand {
  type: DecorationType;
  fromY: number; // 0 = base, 1 = rim
  toY: number;
}

export type VesselForm =
  | 'pitcher'
  | 'bowl'
  | 'cup'
  | 'pot'
  | 'jar'
  | 'goblet'
  | 'fragment';

/**
 * Profile points define the exterior outline from base to rim (one side).
 * Coordinates: x 0 = centerline, 1 = max radius; y 0 = base, 1 = rim.
 * Used to draw both exterior and cross-section.
 */
export interface ProfilePoint {
  x: number; // 0 = center, 1 = outer edge (normalized radius)
  y: number; // 0 = base, 1 = rim (normalized height)
}

export interface FindIllustrationSpec {
  /** Unique id for the sculpture */
  id: string;
  /** Short label (e.g. "SF 42", "Vessel 1") */
  label?: string;
  /** Vessel form or fragment */
  form: VesselForm;
  /**
   * Exterior profile from base to rim (right side only).
   * First point = base, last = rim. x is normalized radius (0 = center).
   */
  profile: ProfilePoint[];
  /**
   * Wall thickness as fraction of radius at each profile segment.
   * If single number, uniform thickness.
   */
  wallThickness: number | number[];
  /** Decoration bands from base to rim */
  decorationBands: DecorationBand[];
  /** If true, draw as fragment with irregular break edges */
  isFragment?: boolean;
  /**
   * For fragments: normalized y positions where break lines occur (0–1).
   * Lines are drawn roughly perpendicular to profile.
   */
  breakLines?: number[];
  /** Optional: one or two handles (e.g. for pitchers, amphorae). Use handles for 1 or 2. */
  handle?: HandleSpec;
  /** Handles (use this when supporting 2 handles; overrides handle if set) */
  handles?: HandleSpec[];
  /** Optional: foot/base detail (e.g. ring base) */
  baseDetail?: 'flat' | 'ring' | 'foot';
  /**
   * Scale profile width from the centerline (1 = unchanged).
   * Like dragging the center top/bottom handle in Office: makes vessel wider or narrower.
   */
  widthScale?: number;
  /**
   * Scale profile height from the center (1 = unchanged).
   * Like dragging the center left/right handle in Office: makes vessel taller or shorter.
   */
  heightScale?: number;
}

export type HandleSide = 'left' | 'right';

export interface HandleSpec {
  fromY: number;
  toY: number;
  /** How far the handle sticks out (0.1–0.8). */
  outward?: number;
  /** Y position of the quadratic control point (0–1). Default (fromY+toY)/2. */
  apexY?: number;
  /** Where along the curve the middle dot sits (0–1). Default 0.5. Lets the dot move closer to either end. */
  midT?: number;
  /** Which side of the vessel the handle is on */
  side?: HandleSide;
  decoration?: DecorationType;
}
