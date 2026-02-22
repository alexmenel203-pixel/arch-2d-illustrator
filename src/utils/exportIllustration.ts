/**
 * Export illustration SVG to file (SVG or PNG).
 * Optionally embed a sculpture spec so the SVG can be re-imported and edited.
 */

import type { FindIllustrationSpec } from '../types/find';

/** Download a blob as a file with the given filename. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export the given SVG element as an .svg file. If spec is provided, it is embedded so the file can be re-imported and edited. */
export function exportSvg(svgEl: SVGSVGElement | null, filenameBase: string, spec?: FindIllustrationSpec): void {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (spec) {
    const meta = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    meta.setAttribute('id', 'arch2d-spec');
    meta.textContent = JSON.stringify(spec);
    clone.appendChild(meta);
  }
  const serializer = new XMLSerializer();
  const str = serializer.serializeToString(clone);
  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
  const name = filenameBase.replace(/[^a-z0-9-_]/gi, '_');
  downloadBlob(blob, `${name}.svg`);
}

const PNG_SCALE = 3; // higher = larger PNG

/** Export the given SVG element as a .png file. */
export function exportPng(svgEl: SVGSVGElement | null, filenameBase: string): void {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const str = serializer.serializeToString(svgEl);
  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const w = img.width * PNG_SCALE;
    const h = img.height * PNG_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(
      (pngBlob) => {
        URL.revokeObjectURL(url);
        if (pngBlob) {
          const name = filenameBase.replace(/[^a-z0-9-_]/gi, '_');
          downloadBlob(pngBlob, `${name}.png`);
        }
      },
      'image/png',
      1
    );
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
