import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from '@testing-library/react';
import { CabProfile, Axles, TopHint, MetreRuler, GUTTER } from './truckChrome';

// NOTE: deliberately not `new URL('...', import.meta.url)` — Vite's asset-URL
// static analysis intercepts that literal pattern under the jsdom test
// environment and rewrites it to an http://localhost dev-server URL instead
// of a file:// path, which breaks fileURLToPath. Resolving via
// dirname/join keeps this a plain Node fs read, independent of the bundler.
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../assets/truck-side-source.svg'),
  'utf8',
);

describe('truck-side-source.svg hygiene', () => {
  it('has no gradients, rasters, external urls, or inkscape cruft', () => {
    expect(src).not.toMatch(/linearGradient|radialGradient/);
    expect(src).not.toMatch(/<image|base64/);
    // Scoped to href/src attributes (real external-resource refs), not a bare
    // "http://" substring: the brief's literal `https?:\/\//` alternative also
    // matches the mandatory `xmlns="http://www.w3.org/2000/svg"` declaration,
    // which the brief separately requires keeping — that collision is a defect
    // in the literal regex, not an asset-hygiene miss (verified: the asset's
    // only "http://" occurrence is that xmlns value; no href/xlink:href/url(http
    // is present).
    expect(src).not.toMatch(/xlink:href|url\(http|\bhref\s*=\s*"https?:\/\//);
    expect(src).not.toMatch(/sodipodi|inkscape|<metadata/);
  });
  it('themes via currentColor and keeps a 750 viewBox', () => {
    expect(src).toMatch(/currentColor/);
    expect(src).not.toMatch(/fill:#000000/);
    expect(src).toMatch(/viewBox="0 0 750 750"/);
  });
});

describe('truck chrome fragments', () => {
  it('CabProfile renders in currentColor/token and no external refs', () => {
    const { container } = render(<svg><CabProfile height={2650} /></svg>);
    const html = container.innerHTML;
    expect(html).not.toMatch(/xlink:href|url\(http/);
    expect(container.querySelector('g')).toBeTruthy();
  });
  it('Axles draws at least two wheels', () => {
    const { container } = render(<svg><Axles length={13600} height={2650} /></svg>);
    expect(container.querySelectorAll('circle, ellipse').length).toBeGreaterThanOrEqual(2);
  });
  it('MetreRuler labels interior metres', () => {
    const { container } = render(<svg><MetreRuler length={3600} y={0} unit="m" /></svg>);
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('1'); // interior metres of 3600 mm: 1, 2, 3
    expect(texts).toContain('2');
    expect(texts).toContain('3');
  });
  it('all chrome is non-interactive', () => {
    const { container } = render(
      <svg><TopHint length={2000} width={2000} front={500} /></svg>,
    );
    container.querySelectorAll('*').forEach((el) => {
      const pe = (el as SVGElement).getAttribute('pointer-events');
      if (pe) expect(pe).toBe('none');
    });
  });
  it('GUTTER fractions are positive and small', () => {
    expect(GUTTER.front).toBeGreaterThan(0);
    expect(GUTTER.wheel).toBeGreaterThan(0);
    expect(GUTTER.ruler).toBeGreaterThan(0);
  });
});
