/**
 * Editor for archaeological sculpture illustration specs.
 * Edit profile points, wall thickness, decoration bands, handle, base, and fragment options.
 */

import { useState, useCallback, useRef } from 'react';
import type {
  FindIllustrationSpec,
  HandleSpec,
  HandleSide,
  ProfilePoint,
  DecorationBand,
  DecorationType,
  VesselForm,
} from '../types/find';
import FindIllustration from '../illustration/FindIllustration';
import { EditableProfilePreview } from './EditableProfilePreview';
import { createDefaultSpec } from '../data/defaultSpec';
import { exportSvg, exportPng } from '../utils/exportIllustration';
import { parseImportJson, parseSpecFromSvg } from '../utils/importSpec';
import { extractProfileFromImage, type ExtractProfileOptions } from '../utils/photoToProfile';

const DECORATION_TYPES: { value: DecorationType; label: string }[] = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'verticalHatch', label: 'Vertical hatch' },
  { value: 'horizontalHatch', label: 'Horizontal hatch' },
  { value: 'diagonalHatch', label: 'Diagonal hatch' },
  { value: 'crossHatch', label: 'Cross hatch' },
  { value: 'stippling', label: 'Stippling' },
  { value: 'circularImpressions', label: 'Circular impressions' },
];

const VESSEL_FORMS: { value: VesselForm; label: string }[] = [
  { value: 'pitcher', label: 'Pitcher' },
  { value: 'bowl', label: 'Bowl' },
  { value: 'cup', label: 'Cup' },
  { value: 'pot', label: 'Pot' },
  { value: 'jar', label: 'Jar' },
  { value: 'goblet', label: 'Goblet' },
  { value: 'fragment', label: 'Fragment' },
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface FindEditorProps {
  initialSpec?: FindIllustrationSpec;
  onReset?: () => void;
  /** Called when user exports (SVG/PNG) so the sculpture can be added to recently edited. */
  onSave?: (spec: FindIllustrationSpec) => void;
}

export function FindEditor({ initialSpec, onReset, onSave }: FindEditorProps) {
  const [spec, setSpec] = useState<FindIllustrationSpec>(
    () => initialSpec ?? createDefaultSpec()
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const exportFilename = spec.label || spec.id;
  const [scaleBarEnabled, setScaleBarEnabled] = useState(false);
  const [scaleBarLength, setScaleBarLength] = useState(5);
  const [scaleBarUnit, setScaleBarUnit] = useState('cm');
  const [scaleBarShowVertical, setScaleBarShowVertical] = useState(false);
  const [scaleBarVerticalLength, setScaleBarVerticalLength] = useState(5);
  const [scaleBarVerticalUnit, setScaleBarVerticalUnit] = useState('cm');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoExtractLoading, setPhotoExtractLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [extractOptions, setExtractOptions] = useState<ExtractProfileOptions>({
    blur: 1,
    smoothing: 2,
    targetPoints: 18,
  });

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMessage(null);
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (isSvg) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const importedSpec = parseSpecFromSvg(text);
        if (importedSpec) {
          setSpec(importedSpec);
          setImportMessage('Illustration loaded. You can edit it now.');
        } else {
          setPhotoPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
          });
          setImportMessage('SVG has no embedded data. Use "Extract profile" in From photo to trace it.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const specs = parseImportJson(text);
      if (specs.length === 0) {
        setImportMessage('No valid sculpture spec in file. Check JSON format.');
        return;
      }
      setSpec(specs[0]);
      if (specs.length > 1) setImportMessage(`Loaded first of ${specs.length} sculptures.`);
      else setImportMessage('Loaded.');
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setPhotoError(null);
    setImportMessage(null);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    e.target.value = '';
  }, []);

  const handleExtractProfile = useCallback(async () => {
    if (!photoPreviewUrl) return;
    setPhotoExtractLoading(true);
    setPhotoError(null);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = photoPreviewUrl;
      });
      const profile = extractProfileFromImage(img, extractOptions);
      if (profile.length < 2) {
        setPhotoError('Could not detect a clear profile. Try a side-view photo on a plain background.');
        return;
      }
      setSpec((s) => ({ ...s, profile }));
      setImportMessage('Profile extracted. Adjust points and add decoration as needed.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setPhotoExtractLoading(false);
    }
  }, [photoPreviewUrl, extractOptions]);

  const update = useCallback(<K extends keyof FindIllustrationSpec>(
    key: K,
    value: FindIllustrationSpec[K]
  ) => {
    setSpec((s) => ({ ...s, [key]: value }));
  }, []);

  const updateProfilePoint = useCallback((index: number, point: Partial<ProfilePoint>) => {
    setSpec((s) => {
      const profile = [...s.profile];
      profile[index] = { ...profile[index], ...point };
      return { ...s, profile };
    });
  }, []);

  const addProfilePoint = useCallback((afterIndex: number) => {
    setSpec((s) => {
      const profile = [...s.profile];
      const a = profile[afterIndex];
      const b = profile[afterIndex + 1];
      const mid: ProfilePoint = b
        ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        : { x: a.x, y: Math.min(1, a.y + 0.1) };
      profile.splice(afterIndex + 1, 0, mid);
      return { ...s, profile };
    });
  }, []);

  const removeProfilePoint = useCallback((index: number) => {
    setSpec((s) => {
      if (s.profile.length <= 2) return s;
      const profile = s.profile.filter((_, i) => i !== index);
      return { ...s, profile };
    });
  }, []);

  const addDecorationBand = useCallback(() => {
    setSpec((s) => ({
      ...s,
      decorationBands: [
        ...s.decorationBands,
        { type: 'zigzag', fromY: 0.3, toY: 0.7 },
      ],
    }));
  }, []);

  const updateDecorationBand = useCallback((index: number, band: Partial<DecorationBand>) => {
    setSpec((s) => {
      const decorationBands = [...s.decorationBands];
      decorationBands[index] = { ...decorationBands[index], ...band };
      return { ...s, decorationBands };
    });
  }, []);

  const removeDecorationBand = useCallback((index: number) => {
    setSpec((s) => ({
      ...s,
      decorationBands: s.decorationBands.filter((_, i) => i !== index),
    }));
  }, []);

  const handleList: HandleSpec[] = spec.handles ?? (spec.handle ? [spec.handle] : []);

  const setHandles = useCallback(
    (handles: HandleSpec[]) => {
      setSpec((s) => ({ ...s, handles: handles.length ? handles : undefined, handle: undefined }));
    },
    []
  );

  const updateHandle = useCallback((index: number, patch: Partial<HandleSpec>) => {
    setSpec((s) => {
      const list = s.handles ?? (s.handle ? [s.handle] : []);
      const next = [...list];
      next[index] = { ...next[index], ...patch };
      return { ...s, handles: next, handle: undefined };
    });
  }, []);

  const addHandle = useCallback(() => {
    setSpec((s) => {
      const list = s.handles ?? (s.handle ? [s.handle] : []);
      if (list.length >= 2) return s;
      if (list.length === 0) {
        const first: HandleSpec = {
          fromY: 0.25,
          toY: 0.65,
          outward: 0.35,
          side: 'left',
        };
        return { ...s, handles: [first], handle: undefined };
      }
      const first = list[0];
      const mirroredSide = first.side === 'right' ? 'left' : 'right';
      const second: HandleSpec = {
        fromY: first.fromY,
        toY: first.toY,
        outward: first.outward ?? 0.35,
        ...(first.apexY != null && { apexY: first.apexY }),
        ...(first.midT != null && { midT: first.midT }),
        side: mirroredSide,
        ...(first.decoration != null && { decoration: first.decoration }),
      };
      return { ...s, handles: [...list, second], handle: undefined };
    });
  }, []);

  const removeHandle = useCallback((index: number) => {
    setSpec((s) => {
      const list = s.handles ?? (s.handle ? [s.handle] : []);
      const next = list.filter((_, i) => i !== index);
      return { ...s, handles: next.length ? next : undefined, handle: undefined };
    });
  }, []);

  return (
    <div className="flex flex-col md:flex-row gap-1.5 md:gap-4 max-w-6xl mx-auto items-stretch max-h-[calc(100dvh-6rem)] md:max-h-none md:min-h-0">
      {/* Left: preview + save — compact on mobile */}
      <div className="flex-shrink-0 w-full md:w-56 flex flex-col items-center bg-white rounded-lg border border-stone-200 p-1.5 md:p-3 shadow-sm md:sticky md:top-4 relative">
        <span className="text-[10px] md:text-xs text-stone-500 mb-0.5 md:mb-1">Preview — drag dots to edit</span>
        <div className="text-black scale-[0.78] sm:scale-[0.88] md:scale-100 origin-top">
          <EditableProfilePreview
            spec={spec}
            scale={2}
            scaleBar={
              scaleBarEnabled
                ? {
                    length: scaleBarLength,
                    unit: scaleBarUnit,
                    showVertical: scaleBarShowVertical,
                    ...(scaleBarShowVertical && {
                      verticalLength: scaleBarVerticalLength,
                      verticalUnit: scaleBarVerticalUnit,
                    }),
                  }
                : null
            }
            onProfilePointChange={updateProfilePoint}
            onHandleChange={updateHandle}
            onWidthScaleChange={(scale) => update('widthScale', scale)}
            onHeightScaleChange={(scale) => update('heightScale', scale)}
            svgRef={svgRef}
          />
        </div>
        {spec.label && (
          <span className="text-[10px] md:text-xs text-stone-600 mt-0.5 md:mt-1 font-medium truncate max-w-full">{spec.label}</span>
        )}
        <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-2 w-full justify-start">
          <button
            type="button"
            onClick={() => onSave?.(JSON.parse(JSON.stringify(spec)))}
            className="text-xs font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-2 py-1 bg-white"
            title="Save to front page (recent list)"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => exportSvg(svgRef.current, exportFilename, JSON.parse(JSON.stringify(spec)))}
            className="text-xs font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-1 bg-white"
            title="Download as SVG"
          >
            SVG
          </button>
          <button
            type="button"
            onClick={() => exportPng(svgRef.current, exportFilename)}
            className="text-xs font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-1 bg-white"
            title="Download as PNG"
          >
            PNG
          </button>
        </div>
      </div>

      {/* Right: options — compact on mobile, scrolls in remaining space */}
      <div className="flex-1 min-h-0 min-w-0 space-y-1.5 md:space-y-3 bg-white rounded-lg border border-stone-200 p-2 md:p-3 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between gap-1.5 border-b border-stone-200 pb-1.5 md:pb-2 flex-wrap">
          <h2 className="text-xs md:text-sm font-semibold text-stone-800">Edit sculpture</h2>
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json,.svg,image/svg+xml"
              onChange={handleImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-0.5"
            >
              Import
            </button>
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-stone-600 hover:text-stone-800 font-medium flex items-center gap-1"
              >
                ← Back
              </button>
            )}
          </div>
        </div>
        {importMessage && (
          <p className="text-xs text-stone-500">{importMessage}</p>
        )}

        {/* From photo: CV extract profile */}
        <fieldset className="space-y-0.5 md:space-y-1">
          <legend className="text-[11px] md:text-xs font-medium text-stone-600">From photo</legend>
          <p className="text-[10px] text-stone-500">Side-view photo, plain background. Extract profile (CV).</p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-0.5"
            >
              Choose image
            </button>
            {photoPreviewUrl && (
              <>
                <img src={photoPreviewUrl} alt="Preview" className="h-14 w-auto rounded border border-stone-200 object-contain" />
                <button
                  type="button"
                  onClick={handleExtractProfile}
                  disabled={photoExtractLoading}
                  className="text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-0.5 disabled:opacity-50"
                >
                  {photoExtractLoading ? 'Extracting…' : 'Extract profile'}
                </button>
              </>
            )}
          </div>
          {/* Extract options */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] md:text-xs text-stone-600">
            <label className="flex items-center gap-1">
              Blur:
              <select
                value={extractOptions.blur ?? 1}
                onChange={(e) => setExtractOptions((o) => ({ ...o, blur: Number(e.target.value) as 0 | 1 | 2 }))}
                className="rounded border border-stone-300 px-1 py-0.5 text-xs"
              >
                <option value={0}>Off</option>
                <option value={1}>3×3</option>
                <option value={2}>5×5</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Smooth:
              <input
                type="number"
                min={0}
                max={5}
                value={extractOptions.smoothing ?? 2}
                onChange={(e) => setExtractOptions((o) => ({ ...o, smoothing: Math.max(0, Math.min(5, Number(e.target.value) || 0)) }))}
                className="w-8 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              Object:
              <select
                value={extractOptions.invert === undefined ? 'auto' : extractOptions.invert ? 'dark' : 'light'}
                onChange={(e) => {
                  const v = e.target.value;
                  setExtractOptions((o) => ({ ...o, invert: v === 'auto' ? undefined : v === 'dark' }));
                }}
                className="rounded border border-stone-300 px-1 py-0.5 text-xs"
              >
                <option value="auto">Auto</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Points:
              <input
                type="number"
                min={8}
                max={24}
                value={extractOptions.targetPoints ?? 18}
                onChange={(e) => setExtractOptions((o) => ({ ...o, targetPoints: Math.max(8, Math.min(24, Number(e.target.value) || 12)) }))}
                className="w-9 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
              />
            </label>
          </div>
          {photoError && (
            <p className="text-xs text-red-600">{photoError}</p>
          )}
        </fieldset>

        {/* Basic: one row */}
        <fieldset className="space-y-0.5 md:space-y-1">
          <legend className="text-[11px] md:text-xs font-medium text-stone-600">Basic</legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={spec.id}
              onChange={(e) => update('id', e.target.value)}
              placeholder="ID"
              className="w-20 rounded border border-stone-300 px-1.5 py-0.5 text-xs"
            />
            <input
              type="text"
              value={spec.label ?? ''}
              onChange={(e) => update('label', e.target.value || undefined)}
              placeholder="Label"
              className="w-24 rounded border border-stone-300 px-1.5 py-0.5 text-xs"
            />
            <select
              value={spec.form}
              onChange={(e) => update('form', e.target.value as VesselForm)}
              className="rounded border border-stone-300 px-1.5 py-0.5 text-xs"
            >
              {VESSEL_FORMS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1" title="Scale width from centerline (drag orange dot left/right)">
              <span className="text-xs text-stone-500">Width</span>
              <input
                type="number"
                min={0.25}
                max={2}
                step={0.05}
                value={round2(spec.widthScale ?? 1)}
                onChange={(e) => update('widthScale', Math.max(0.25, Math.min(2, Number(e.target.value) || 1)))}
                className="w-12 rounded border border-stone-300 px-1 py-0.5 text-xs"
              />
            </label>
            <label className="flex items-center gap-1" title="Scale height from center (drag orange dot up/down)">
              <span className="text-xs text-stone-500">Height</span>
              <input
                type="number"
                min={0.25}
                max={2}
                step={0.05}
                value={round2(spec.heightScale ?? 1)}
                onChange={(e) => update('heightScale', Math.max(0.25, Math.min(2, Number(e.target.value) || 1)))}
                className="w-12 rounded border border-stone-300 px-1 py-0.5 text-xs"
              />
            </label>
          </div>
        </fieldset>

        {/* Profile */}
        <fieldset className="space-y-0.5 md:space-y-1">
          <legend className="text-[11px] md:text-xs font-medium text-stone-600">Profile (x, y 0–1)</legend>
          <ul className="space-y-0.5">
            {spec.profile.map((p, i) => (
              <li key={i} className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-stone-400 w-4">{i + 1}</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={round2(p.x)}
                  onChange={(e) => updateProfilePoint(i, { x: Number(e.target.value) })}
                  className="w-12 rounded border border-stone-300 px-1 py-0.5 text-xs"
                  title="x"
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={round2(p.y)}
                  onChange={(e) => updateProfilePoint(i, { y: Number(e.target.value) })}
                  className="w-12 rounded border border-stone-300 px-1 py-0.5 text-xs"
                  title="y"
                />
                <button type="button" onClick={() => addProfilePoint(i)} className="text-stone-400 hover:text-stone-600 text-[10px]">+</button>
                {spec.profile.length > 2 && (
                  <button type="button" onClick={() => removeProfilePoint(i)} className="text-red-400 hover:text-red-600 text-[10px]">×</button>
                )}
              </li>
            ))}
          </ul>
        </fieldset>

        {/* Wall + Base + Scale in one row */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-3">
          <label className="flex items-center gap-1">
            <span className="text-xs text-stone-500">Wall</span>
            <input
              type="number"
              min={0.01}
              max={0.3}
              step={0.01}
              value={typeof spec.wallThickness === 'number' ? spec.wallThickness : spec.wallThickness[0]}
              onChange={(e) => update('wallThickness', Number(e.target.value))}
              className="w-14 rounded border border-stone-300 px-1 py-0.5 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-xs text-stone-500">Base</span>
            <select
              value={spec.baseDetail ?? 'flat'}
              onChange={(e) => update('baseDetail', e.target.value as 'flat' | 'ring' | 'foot')}
              className="rounded border border-stone-300 px-1 py-0.5 text-xs"
            >
              <option value="flat">Flat</option>
              <option value="ring">Ring</option>
              <option value="foot">Foot</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={scaleBarEnabled}
              onChange={(e) => setScaleBarEnabled(e.target.checked)}
            />
            <span className="text-xs">Scale</span>
          </label>
          {scaleBarEnabled && (
            <>
              <span className="text-[10px] text-stone-500 w-full">H:</span>
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={scaleBarLength}
                onChange={(e) => setScaleBarLength(Number(e.target.value))}
                className="w-10 rounded border border-stone-300 px-1 py-0.5 text-xs"
                title="Horizontal length"
              />
              <input
                type="text"
                value={scaleBarUnit}
                onChange={(e) => setScaleBarUnit(e.target.value)}
                className="w-8 rounded border border-stone-300 px-1 py-0.5 text-xs"
                title="Horizontal unit"
              />
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={scaleBarShowVertical}
                  onChange={(e) => setScaleBarShowVertical(e.target.checked)}
                />
                <span className="text-xs">V</span>
              </label>
              {scaleBarShowVertical && (
                <>
                  <span className="text-[10px] text-stone-500 w-full">V:</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={scaleBarVerticalLength}
                    onChange={(e) => setScaleBarVerticalLength(Number(e.target.value))}
                    className="w-10 rounded border border-stone-300 px-1 py-0.5 text-xs"
                    title="Vertical length"
                  />
                  <input
                    type="text"
                    value={scaleBarVerticalUnit}
                    onChange={(e) => setScaleBarVerticalUnit(e.target.value)}
                    className="w-8 rounded border border-stone-300 px-1 py-0.5 text-xs"
                    title="Vertical unit"
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* Decoration bands */}
        <fieldset className="space-y-0.5 md:space-y-1">
          <legend className="text-[11px] md:text-xs font-medium text-stone-600">Bands</legend>
          {spec.decorationBands.length === 0 ? (
            <p className="text-[10px] text-stone-500">None. Add to decorate.</p>
          ) : (
            <ul className="space-y-0.5 md:space-y-1">
              {spec.decorationBands.map((band, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1 py-1 rounded bg-stone-50 border border-stone-200 px-1.5">
                  <select
                    value={band.type}
                    onChange={(e) => updateDecorationBand(i, { type: e.target.value as DecorationType })}
                    className="rounded border border-stone-300 px-1 py-0.5 text-xs max-w-[7rem]"
                  >
                    {DECORATION_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={round2(band.fromY)}
                    onChange={(e) => updateDecorationBand(i, { fromY: Number(e.target.value) })}
                    className="w-10 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
                  />
                  <span className="text-stone-400 text-xs">→</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={round2(band.toY)}
                    onChange={(e) => updateDecorationBand(i, { toY: Number(e.target.value) })}
                    className="w-10 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
                  />
                  <button type="button" onClick={() => removeDecorationBand(i)} className="text-red-400 hover:text-red-600 text-xs">×</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={addDecorationBand} className="text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-0.5">+ Band</button>
        </fieldset>

        {/* Handles (1 or 2) */}
        <fieldset className="space-y-0.5 md:space-y-1">
          <legend className="text-[11px] md:text-xs font-medium text-stone-600">Handles</legend>
          {handleList.length === 0 ? (
            <button
              type="button"
              onClick={addHandle}
              className="text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-0.5"
            >
              + Add handle
            </button>
          ) : (
            <>
              {handleList.map((h, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5 flex-wrap">
                  <span className="text-[10px] text-stone-400 w-4">{i + 1}</span>
                  <select
                    value={h.side ?? 'left'}
                    onChange={(e) => updateHandle(i, { side: e.target.value as HandleSide })}
                    className="rounded border border-stone-300 px-0.5 py-0.5 text-xs w-14"
                    title="Side"
                  >
                    <option value="left">L</option>
                    <option value="right">R</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={round2(h.fromY)}
                    onChange={(e) => updateHandle(i, { fromY: Number(e.target.value) })}
                    className="w-10 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
                    title="from Y"
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={round2(h.toY)}
                    onChange={(e) => updateHandle(i, { toY: Number(e.target.value) })}
                    className="w-10 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
                    title="to Y"
                  />
                  <input
                    type="number"
                    min={0.1}
                    max={0.8}
                    step={0.05}
                    value={round2(h.outward ?? 0.35)}
                    onChange={(e) => updateHandle(i, { outward: Number(e.target.value) })}
                    className="w-10 rounded border border-stone-300 px-0.5 py-0.5 text-xs"
                    title="outward"
                  />
                  <button type="button" onClick={() => removeHandle(i)} className="text-red-400 hover:text-red-600 text-xs">×</button>
                </div>
              ))}
              {handleList.length < 2 && (
                <button
                  type="button"
                  onClick={addHandle}
                  className="text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded px-1.5 py-0.5"
                >
                  + Add 2nd handle
                </button>
              )}
            </>
          )}
        </fieldset>

        {/* Fragment: compact */}
        <fieldset className="space-y-0.5 md:space-y-1">
          <legend className="text-[11px] md:text-xs font-medium text-stone-600">Fragment</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!spec.isFragment}
              onChange={(e) => update('isFragment', e.target.checked)}
            />
            <span className="text-xs">Break lines</span>
          </label>
          {spec.isFragment && (
            <input
              type="text"
              value={(spec.breakLines ?? []).join(', ')}
              onChange={(e) => {
                const vals = e.target.value
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 1);
                update('breakLines', vals);
              }}
              className="w-full rounded border border-stone-300 px-1.5 py-0.5 text-xs mt-0.5"
              placeholder="0.2, 0.95"
            />
          )}
        </fieldset>
      </div>
    </div>
  );
}
