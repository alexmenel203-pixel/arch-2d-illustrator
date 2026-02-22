/**
 * Recently edited sculptures — persisted in localStorage.
 * Add when user saves/exports; show in gallery.
 */

import type { FindIllustrationSpec } from '../types/find';

const STORAGE_KEY = 'arch2d-recent-finds';
const MAX_RECENT = 20;

const VALID_FORMS = ['pitcher', 'bowl', 'cup', 'pot', 'jar', 'goblet', 'fragment'];

function isValidSpec(s: unknown): s is FindIllustrationSpec {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  if (typeof o.id !== 'string') return false;
  if (!VALID_FORMS.includes(o.form as string)) return false;
  if (!Array.isArray(o.profile) || o.profile.length < 2) return false;
  if (!o.profile.every((p: unknown) => {
    if (typeof p !== 'object' || p === null) return false;
    const pt = p as { x?: unknown; y?: unknown };
    return typeof pt.x === 'number' && typeof pt.y === 'number';
  })) return false;
  if (!Array.isArray(o.decorationBands)) return false;
  return true;
}

function load(): FindIllustrationSpec[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSpec);
  } catch {
    return [];
  }
}

function save(specs: FindIllustrationSpec[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(specs));
  } catch {
    // ignore quota / private mode
  }
}

/** Get recently edited finds (most recent first). */
export function getRecentFinds(): FindIllustrationSpec[] {
  return load();
}

/** Add or update a sculpture in recent list (by id). Moves to front; limits to MAX_RECENT. */
export function addRecentFind(spec: FindIllustrationSpec): void {
  const list = load();
  const next = list.filter((s) => s.id !== spec.id);
  next.unshift(JSON.parse(JSON.stringify(spec)));
  save(next.slice(0, MAX_RECENT));
}

/** Remove a sculpture from the recent list by id. */
export function removeRecentFind(id: string): void {
  const list = load().filter((s) => s.id !== id);
  save(list);
}
