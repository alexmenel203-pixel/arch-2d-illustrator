/**
 * Preview with draggable profile points and handle points (from, to, apex).
 * Drag dots to edit profile shape and handle position/extent.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import FindIllustration from '../illustration/FindIllustration';
import type { FindIllustrationSpec, ProfilePoint, HandleSpec } from '../types/find';
import type { ScaleBarOption } from '../illustration/FindIllustration';

// Match FindIllustration viewBox so dots align
const WIDTH = 100;
const HEIGHT = 160;
const CENTER_X = 50;
const RADIUS_SCALE = 42;
const HEIGHT_SCALE = 120;
const BASE_Y = HEIGHT - 20;

/** Scale profile y around center 0.5 (for height scale). */
function scaleY(y: number, heightScale: number): number {
  return Math.max(0, Math.min(1, 0.5 + (y - 0.5) * heightScale));
}

function profileToSvg(p: ProfilePoint, widthScale: number, heightScale: number): { cx: number; cy: number } {
  return {
    cx: CENTER_X + p.x * widthScale * RADIUS_SCALE,
    cy: BASE_Y - scaleY(p.y, heightScale) * HEIGHT_SCALE,
  };
}

function svgToProfile(svgX: number, svgY: number): ProfilePoint {
  const x = Math.max(0, Math.min(1, (svgX - CENTER_X) / RADIUS_SCALE));
  const y = Math.max(0, Math.min(1, (BASE_Y - svgY) / HEIGHT_SCALE));
  return { x, y };
}

function bodyRadiusAt(profile: ProfilePoint[], y: number, widthScale: number): number {
  const p = profile.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
  return p.x * widthScale * RADIUS_SCALE;
}

/** Quadratic Bezier at t: B(t) = (1-t)²P0 + 2(1-t)t P1 + t²P2 */
function quadAt(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

interface EditableProfilePreviewProps {
  spec: FindIllustrationSpec;
  scale?: number;
  scaleBar?: ScaleBarOption | null;
  onProfilePointChange: (index: number, point: ProfilePoint) => void;
  onHandleChange: (handleIndex: number, patch: Partial<HandleSpec>) => void;
  onWidthScaleChange?: (scale: number) => void;
  onHeightScaleChange?: (scale: number) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

type Dragging =
  | { type: 'profile'; index: number }
  | { type: 'handle'; handleIndex: number; end: 0 | 1 | 2 } // 0=fromY, 1=toY, 2=apex/outward
  | { type: 'centerline'; startWidthScale: number; startHeightScale: number };

const WIDTH_SCALE_MIN = 0.25;
const WIDTH_SCALE_MAX = 2;
const WIDTH_SCALE_SENSITIVITY = 0.015;
const HEIGHT_SCALE_MIN = 0.25;
const HEIGHT_SCALE_MAX = 2;
const HEIGHT_SCALE_SENSITIVITY = 0.012;
const CENTERLINE_Y = BASE_Y - 0.5 * HEIGHT_SCALE;

export function EditableProfilePreview({
  spec,
  scale = 2,
  scaleBar,
  onProfilePointChange,
  onHandleChange,
  onWidthScaleChange,
  onHeightScaleChange,
  svgRef,
}: EditableProfilePreviewProps) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const widthScale = Math.max(WIDTH_SCALE_MIN, Math.min(WIDTH_SCALE_MAX, spec.widthScale ?? 1));
  const heightScale = Math.max(HEIGHT_SCALE_MIN, Math.min(HEIGHT_SCALE_MAX, spec.heightScale ?? 1));

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * WIDTH;
    const y = (clientY - rect.top) / rect.height * HEIGHT;
    return { x, y };
  }, []);

  const handleList = spec.handles ?? (spec.handle ? [spec.handle] : []);

  const handleProfilePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging({ type: 'profile', index });
  }, []);

  const handleHandlePointerDown = useCallback((e: React.PointerEvent, handleIndex: number, end: 0 | 1 | 2) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging({ type: 'handle', handleIndex, end });
  }, []);

  const handleCenterlinePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging({ type: 'centerline', startWidthScale: widthScale, startHeightScale: heightScale });
  }, [widthScale, heightScale]);

  useEffect(() => {
    if (dragging === null) return;
    const ws = Math.max(WIDTH_SCALE_MIN, Math.min(WIDTH_SCALE_MAX, spec.widthScale ?? 1));
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const pt = clientToSvg(e.clientX, e.clientY);
      if (!pt) return;
      if (dragging.type === 'centerline') {
        const newWidth = Math.max(WIDTH_SCALE_MIN, Math.min(WIDTH_SCALE_MAX,
          dragging.startWidthScale + (pt.x - CENTER_X) * WIDTH_SCALE_SENSITIVITY));
        const newHeight = Math.max(HEIGHT_SCALE_MIN, Math.min(HEIGHT_SCALE_MAX,
          dragging.startHeightScale + (pt.y - CENTERLINE_Y) * HEIGHT_SCALE_SENSITIVITY));
        onWidthScaleChange?.(newWidth);
        onHeightScaleChange?.(newHeight);
        return;
      }
      if (dragging.type === 'profile') {
        const profilePoint = svgToProfile(pt.x, pt.y);
        onProfilePointChange(dragging.index, profilePoint);
        return;
      }
      const h = handleList[dragging.handleIndex];
      if (!h) return;
      const side = h.side === 'right' ? 1 : -1;
      if (dragging.end === 0) {
        const y = Math.max(0, Math.min(1, (BASE_Y - pt.y) / HEIGHT_SCALE));
        onHandleChange(dragging.handleIndex, { fromY: y });
      } else if (dragging.end === 1) {
        const y = Math.max(0, Math.min(1, (BASE_Y - pt.y) / HEIGHT_SCALE));
        onHandleChange(dragging.handleIndex, { toY: y });
      } else {
        const rFrom = bodyRadiusAt(spec.profile, h.fromY, ws);
        const rTo = bodyRadiusAt(spec.profile, h.toY, ws);
        const p0 = { x: CENTER_X + side * rFrom, y: BASE_Y - h.fromY * HEIGHT_SCALE };
        const p3 = { x: CENTER_X + side * rTo, y: BASE_Y - h.toY * HEIGHT_SCALE };
        const ptYNorm = (BASE_Y - pt.y) / HEIGHT_SCALE;
        const span = h.toY - h.fromY;
        const t = span > 0.01
          ? Math.max(0.05, Math.min(0.95, (ptYNorm - h.fromY) / span))
          : (h.midT ?? 0.5);
        const u = 1 - t;
        const denom = 2 * u * t;
        const control = denom > 0.001
          ? { x: (pt.x - u * u * p0.x - t * t * p3.x) / denom, y: (pt.y - u * u * p0.y - t * t * p3.y) / denom }
          : { x: 2 * pt.x - 0.5 * p0.x - 0.5 * p3.x, y: 2 * pt.y - 0.5 * p0.y - 0.5 * p3.y };
        const outRaw = (control.x - CENTER_X) / (side * RADIUS_SCALE) - 1;
        const outward = Math.max(0.1, Math.min(0.8, outRaw));
        const apexY = Math.max(0, Math.min(1, (BASE_Y - control.y) / HEIGHT_SCALE));
        onHandleChange(dragging.handleIndex, { outward, apexY, midT: t });
      }
    };
    const onUp = () => setDragging(null);
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    window.addEventListener('pointermove', onMove, { capture: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [dragging, clientToSvg, onProfilePointChange, onHandleChange, onWidthScaleChange, onHeightScaleChange, handleList, spec.profile, spec.widthScale, spec.heightScale]);

  return (
    <div className="relative inline-block [&_svg]:max-w-full [&_svg]:h-auto">
      <FindIllustration
        ref={svgRef}
        spec={spec}
        scale={scale}
        scaleBar={scaleBar}
      />
      <svg
        ref={overlayRef}
        className="absolute top-0 left-0 w-full h-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH * scale}
        height={HEIGHT * scale}
        style={{ pointerEvents: 'none' }}
      >
        <g style={{ pointerEvents: 'auto' }} aria-label="Profile control points">
          {spec.profile.map((p, i) => {
            const { cx, cy } = profileToSvg(p, widthScale, heightScale);
            const isDragging = dragging?.type === 'profile' && dragging.index === i;
            return (
              <circle
                key={`p-${i}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={isDragging ? '#2563eb' : '#1e40af'}
                stroke="#fff"
                strokeWidth={1.2}
                style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', pointerEvents: 'auto' }}
                onPointerDown={(e) => handleProfilePointerDown(e, i)}
              />
            );
          })}
        </g>
        {/* Centerline control: drag left/right = width, up/down = height */}
        {(onWidthScaleChange != null || onHeightScaleChange != null) && (
          <g style={{ pointerEvents: 'auto' }} aria-label="Width and height (centerline) control">
            <circle
              cx={CENTER_X}
              cy={CENTERLINE_Y}
              r={3.5}
              fill={dragging?.type === 'centerline' ? '#d97706' : '#b45309'}
              stroke="#fff"
              strokeWidth={1.2}
              style={{ cursor: dragging?.type === 'centerline' ? 'grabbing' : 'move', touchAction: 'none', pointerEvents: 'auto' }}
              onPointerDown={handleCenterlinePointerDown}
            />
          </g>
        )}
        <g style={{ pointerEvents: 'auto' }} aria-label="Handle control points">
          {handleList.map((h, hi) => {
            const side = h.side === 'right' ? 1 : -1;
            const rFrom = bodyRadiusAt(spec.profile, h.fromY, widthScale);
            const rTo = bodyRadiusAt(spec.profile, h.toY, widthScale);
            const out = RADIUS_SCALE * (1 + (h.outward ?? 0.3));
            const apexY = h.apexY ?? (h.fromY + h.toY) / 2;
            const ctrlY = BASE_Y - scaleY(apexY, heightScale) * HEIGHT_SCALE;
            const p0 = { x: CENTER_X + side * rFrom, y: BASE_Y - scaleY(h.fromY, heightScale) * HEIGHT_SCALE };
            const p3 = { x: CENTER_X + side * rTo, y: BASE_Y - scaleY(h.toY, heightScale) * HEIGHT_SCALE };
            const midT = Math.max(0.05, Math.min(0.95, h.midT ?? 0.5));
            const denom = 1 - 2 * (1 - midT) * midT;
            const ctrlYFromMidT = Math.abs(denom) > 0.001
              ? ((1 - midT) ** 2 * p0.y + midT ** 2 * p3.y) / denom
              : (p0.y + p3.y) / 2;
            const ctrl = h.midT != null
              ? { x: CENTER_X + side * out, y: ctrlYFromMidT }
              : { x: CENTER_X + side * out, y: ctrlY };
            const midOnCurve = quadAt(midT, p0, ctrl, p3);
            const dots: { cx: number; cy: number; end: 0 | 1 | 2 }[] = [
              { cx: CENTER_X + side * rFrom, cy: BASE_Y - scaleY(h.fromY, heightScale) * HEIGHT_SCALE, end: 0 },
              { cx: CENTER_X + side * rTo, cy: BASE_Y - scaleY(h.toY, heightScale) * HEIGHT_SCALE, end: 1 },
              { cx: midOnCurve.x, cy: midOnCurve.y, end: 2 },
            ];
            return dots.map((d) => {
              const isDragging = dragging?.type === 'handle' && dragging.handleIndex === hi && dragging.end === d.end;
              return (
                <circle
                  key={`h-${hi}-${d.end}`}
                  cx={d.cx}
                  cy={d.cy}
                  r={2.5}
                  fill={isDragging ? '#16a34a' : '#15803d'}
                  stroke="#fff"
                  strokeWidth={1}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleHandlePointerDown(e, hi, d.end)}
                />
              );
            });
          })}
        </g>
      </svg>
    </div>
  );
}
