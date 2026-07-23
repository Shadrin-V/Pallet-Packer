import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from '@testing-library/react';
import { FrontCap, TrailerUnder, TopChrome, MetreRuler, GUTTER } from './truckChrome';

// NOTE: deliberately not `new URL('...', import.meta.url)` — Vite's asset-URL static analysis
// intercepts that literal pattern under the jsdom test environment and rewrites it to an
// http://localhost dev-server URL instead of a file:// path. dirname/join keeps this a plain Node fs
// read, independent of the bundler.
const here = dirname(fileURLToPath(import.meta.url));
const frontSrc = readFileSync(join(here, '../../assets/truck-front-side.svg'), 'utf8');

describe('truck-front-side.svg hygiene', () => {
  it('has no gradients, rasters, external refs, or editor cruft', () => {
    expect(frontSrc).not.toMatch(/linearGradient|radialGradient/);
    expect(frontSrc).not.toMatch(/<image|base64/);
    expect(frontSrc).not.toMatch(/xlink:href|url\(http|\bhref\s*=\s*["']https?:\/\//);
    expect(frontSrc).not.toMatch(/sodipodi|inkscape|<metadata/);
    expect(frontSrc).not.toMatch(/<text/);
  });
  it('themes via currentColor and keeps the contract viewBox', () => {
    expect(frontSrc).toMatch(/currentColor/);
    expect(frontSrc).toMatch(/viewBox="53 520 372 400"/);
  });
});

describe('truck chrome', () => {
  it('FrontCap re-hosts the tractor asset, non-interactive, no external refs', () => {
    const { container } = render(<svg><FrontCap height={2700} /></svg>);
    const cap = container.querySelector('svg svg');
    expect(cap?.getAttribute('viewBox')).toBe('53 520 372 400');
    expect(cap?.getAttribute('pointer-events')).toBe('none');
    expect(container.innerHTML).not.toMatch(/xlink:href|url\(http/);
    // aero cab body/windows (paths) + two wheels with hubs (circles) from the reference asset
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(4);
  });
  it('TrailerUnder draws a tridem bogie + legs + rail + mudflap, non-interactive', () => {
    const { container } = render(<svg><TrailerUnder length={13600} height={2700} /></svg>);
    const g = container.querySelector('svg > g');
    expect(g?.getAttribute('pointer-events')).toBe('none');
    // three tridem wheels, each tyre + hub = 6 circles
    expect(container.querySelectorAll('circle').length).toBe(6);
    // rear mudflap rect present
    expect(container.querySelector('rect')).toBeTruthy();
  });
  it('MetreRuler labels interior metres and drops the one that would collide with the total', () => {
    const { container } = render(<svg><MetreRuler length={13600} y={0} unit="m" /></svg>);
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('12');
    expect(texts).not.toContain('13'); // 13 m sits within 800 mm of the 13.6 m total label
    expect(texts).toContain('13.6 m');
  });
  it('TopChrome re-hosts the top-view cab + rear fittings, non-interactive', () => {
    const { container } = render(<svg><TopChrome length={13600} width={2480} frontGutter={1773} /></svg>);
    const cap = container.querySelector('svg svg');
    expect(cap?.getAttribute('viewBox')).toBe('50 55 215 370');
    expect(cap?.getAttribute('pointer-events')).toBe('none');
    // two rear door fittings anchored at the box rear
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
    container.querySelectorAll('*').forEach((el) => {
      const pe = el.getAttribute('pointer-events');
      if (pe) expect(pe).toBe('none');
    });
  });
  it('GUTTER fractions are positive', () => {
    expect(GUTTER.front).toBeGreaterThan(0);
    expect(GUTTER.wheel).toBeGreaterThan(0);
    expect(GUTTER.ruler).toBeGreaterThan(0);
  });
});
