// Plan export (LKWkalk-qrd.15, spec docs/superpowers/specs/2026-07-17-export-design.md).
// Three ways out of the Ladeplan screen:
//   PDF  — the browser print dialog ("save as PDF"); the A4 sheet is already tuned in theme.css.
//   PNG  — the live cutaway SVGs recomposed into one sheet, rasterised via <canvas>.
//   JSON — load + layout verbatim (api-contract), for ERP/MCP consumers.
// Nothing here computes: export only serialises what the engine already produced.
//
// The cutaways paint with design tokens (var(--s1), var(--paper)…). Outside the document — inside
// an <img> fed from a serialised blob — a var() paint does not resolve and the plan would come out
// black, so the markup is resolved against the theme (resolveCssVars) before rasterising.
import { ENGINE_CONTRACT_VERSION, type Layout, type Load } from '@shadrin-v/engine';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PlanExport {
  exportedAt: string;
  engineContractVersion: string;
  load: Load;
  layout: Layout;
}

export interface CompositeSection {
  caption: string;
  svg: SVGSVGElement;
}

export interface CompositeOptions {
  title: string;
  meta: string[];
  figures: { label: string; value: string }[];
  legend: { label: string; color: string }[];
  sections: CompositeSection[];
  /** Sheet width in user units; the PNG is rasterised to `pngWidth` regardless. */
  width?: number;
}

const UMLAUTS: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', ê: 'e', á: 'a', à: 'a', â: 'a', ô: 'o', û: 'u', ç: 'c',
};

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[äöüßéèêáàâôûç]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip the combining marks NFKD split off
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'ladeplan';
}

export function planFilename(vehicleName: string, kind: 'json' | 'png', date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `ladungsplaner-${slugify(vehicleName)}-${day}.${kind}`;
}

export function buildPlanJson(load: Load, layout: Layout, exportedAt: Date): PlanExport {
  return {
    exportedAt: exportedAt.toISOString(),
    engineContractVersion: ENGINE_CONTRACT_VERSION,
    load,
    layout,
  };
}

/** Replaces every `var(--token)` (with or without a fallback) by its resolved value; an unresolved
 *  token falls back to the var()'s own fallback, else stays put. */
export function resolveCssVars(markup: string, resolve: (name: string) => string): string {
  return markup.replace(
    /var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g,
    (whole, name: string, fallback?: string) => resolve(name) || fallback?.trim() || whole,
  );
}

/** Reads the live theme tokens off :root — the source of truth for the exported colours. */
export function themeVarResolver(): (name: string) => string {
  const style = getComputedStyle(document.documentElement);
  return (name) => style.getPropertyValue(name).trim();
}

// Sheet geometry (user units ≈ px at width 1600).
const PAD = 40;
const TITLE_SIZE = 34;
const META_SIZE = 16;
const FIGURE_SIZE = 30;
const CAPTION_SIZE = 14;
const LEGEND_ROW = 24;

function text(
  parent: SVGElement,
  x: number,
  y: number,
  content: string,
  opts: { size: number; fill: string; weight?: number; anchor?: 'start' | 'end' } = {
    size: META_SIZE,
    fill: 'var(--ink)',
  },
): void {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('font-size', String(opts.size));
  el.setAttribute('fill', opts.fill);
  if (opts.weight) el.setAttribute('font-weight', String(opts.weight));
  if (opts.anchor) el.setAttribute('text-anchor', opts.anchor);
  el.textContent = content;
  parent.appendChild(el);
}

/** Aspect ratio (height / width) of an svg's own coordinate system. */
function aspectOf(svg: SVGSVGElement): number {
  const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  return w > 0 && h > 0 ? h / w : 1;
}

/**
 * Recomposes the live cutaways into a single standalone SVG sheet: brand line, vehicle meta,
 * summary figures, both projections, per-order legend. Sources are cloned, never mutated.
 */
export function buildCompositeSvg(opts: CompositeOptions): string {
  const W = opts.width ?? 1600;
  const innerW = W - PAD * 2;
  const root = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('font-family', 'Inter, system-ui, sans-serif');

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(W));
  bg.setAttribute('fill', 'var(--card)');
  root.appendChild(bg);

  let y = PAD + TITLE_SIZE;
  text(root, PAD, y, opts.title, { size: TITLE_SIZE, fill: 'var(--ink)', weight: 700 });

  // summary figures, right-aligned on the title line
  let fx = W - PAD;
  for (const fig of [...opts.figures].reverse()) {
    text(root, fx, y, fig.value, { size: FIGURE_SIZE, fill: 'var(--brand)', weight: 700, anchor: 'end' });
    text(root, fx, y + 16, fig.label, { size: 12, fill: 'var(--muted)', anchor: 'end' });
    fx -= Math.max(110, fig.value.length * 20 + 40);
  }

  y += META_SIZE + 12;
  for (const line of opts.meta) {
    text(root, PAD, y, line, { size: META_SIZE, fill: 'var(--muted)' });
    y += META_SIZE + 6;
  }

  y += 12;
  for (const section of opts.sections) {
    text(root, PAD, y, section.caption, { size: CAPTION_SIZE, fill: 'var(--faint)', weight: 600 });
    y += 8;
    const h = innerW * aspectOf(section.svg);
    const child = section.svg.cloneNode(true) as SVGSVGElement;
    // Screen-only chrome (selection outline, rotate handle) is not part of the plan.
    child.querySelectorAll('[class*="print:hidden"]').forEach((el) => el.remove());
    child.removeAttribute('style');
    child.removeAttribute('class');
    child.setAttribute('x', String(PAD));
    child.setAttribute('y', String(y));
    child.setAttribute('width', String(innerW));
    child.setAttribute('height', String(h));
    child.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    root.appendChild(child);
    y += h + 28;
  }

  for (const item of opts.legend) {
    const sw = document.createElementNS(SVG_NS, 'rect');
    sw.setAttribute('x', String(PAD));
    sw.setAttribute('y', String(y - 11));
    sw.setAttribute('width', '14');
    sw.setAttribute('height', '14');
    sw.setAttribute('fill', item.color);
    root.appendChild(sw);
    text(root, PAD + 22, y, item.label, { size: 14, fill: 'var(--ink)' });
    y += LEGEND_ROW;
  }

  const H = Math.round(y + PAD);
  root.setAttribute('viewBox', `0 0 ${W} ${H}`);
  root.setAttribute('width', String(W));
  root.setAttribute('height', String(H));
  bg.setAttribute('height', String(H));
  return new XMLSerializer().serializeToString(root);
}

/** Draws standalone SVG markup into a PNG blob. Browser only — jsdom has no canvas. */
export async function rasterize(markup: string, targetWidth = 2400): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('ERR_EXPORT_RASTERIZE'));
      img.src = url;
    });
    const scale = img.width > 0 ? targetWidth / img.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ERR_EXPORT_CANVAS');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ERR_EXPORT_CANVAS'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick, not inline: Safari/Firefox may still be starting the transfer when the
  // click returns, and pulling the url out from under them cancels the download without any error.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportPlanJson(load: Load, layout: Layout, now = new Date()): void {
  const json = JSON.stringify(buildPlanJson(load, layout, now), null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), planFilename(load.vehicle.name, 'json', now));
}

export async function exportPlanPng(
  vehicleName: string,
  opts: CompositeOptions,
  now = new Date(),
): Promise<void> {
  const markup = resolveCssVars(buildCompositeSvg(opts), themeVarResolver());
  downloadBlob(await rasterize(markup), planFilename(vehicleName, 'png', now));
}
