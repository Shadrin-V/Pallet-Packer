import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from '@testing-library/react';
import { FrontCap, TrailerUnder, TopChrome, MetreRuler, VerticalRuler, GUTTER } from './truckChrome';

// NOTE: deliberately not `new URL('...', import.meta.url)` — Vite's asset-URL static analysis
// intercepts that literal pattern under the jsdom test environment and rewrites it to an
// http://localhost dev-server URL instead of a file:// path. dirname/join keeps this a plain Node fs
// read, independent of the bundler.
const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(here, '../../assets', name), 'utf8');

describe.each([
  ['truck-front-side.svg', '53 520 372 400'],
  ['truck-front-top.svg', '50 55 215 370'],
])('%s hygiene', (name, viewBox) => {
  const src = read(name);
  it('has no gradients, rasters, external refs, or editor cruft', () => {
    expect(src).not.toMatch(/linearGradient|radialGradient/);
    expect(src).not.toMatch(/<image|base64/);
    expect(src).not.toMatch(/xlink:href|url\(http|\bhref\s*=\s*["']https?:\/\//);
    expect(src).not.toMatch(/sodipodi|inkscape|<metadata/);
    expect(src).not.toMatch(/<text/);
  });
  it('themes via currentColor and keeps the contract viewBox', () => {
    expect(src).toMatch(/currentColor/);
    expect(src).toMatch(new RegExp(`viewBox="${viewBox}"`));
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
  it('VerticalRuler marks interior whole metres up from the floor, non-interactive', () => {
    // 2650 mm high → metres 1 and 2 (3 m is past the roof); metre 2 sits higher (smaller y) than 1.
    const { container } = render(<svg><VerticalRuler span={2650} floorY={2650} rearX={5000} font={200} /></svg>);
    const texts = [...container.querySelectorAll('text')];
    const labels = texts.map((t) => t.textContent);
    expect(labels).toContain('1');
    expect(labels).toContain('2');
    expect(labels).not.toContain('3');
    const y = (n: string) => Number(texts.find((t) => t.textContent === n)!.getAttribute('y'));
    expect(y('2')).toBeLessThan(y('1')); // metres count upward
    expect(y('1')).toBe(2650 - 1000); // floor minus one metre
    // engineering look: 2 whole-metre majors + 3 half-metre minors (0.5/1.5/2.5 m), all reaching IN
    // from the rear wall (x2 < rearX). Minors are shorter, so they stop closer to the wall than majors.
    const lines = [...container.querySelectorAll('line')];
    expect(lines).toHaveLength(5);
    const shortest = Math.max(...lines.map((l) => Number(l.getAttribute('x2'))));
    expect(lines.filter((l) => Number(l.getAttribute('x2')) === shortest)).toHaveLength(3); // the minors
    expect(container.querySelector('g')?.getAttribute('pointer-events')).toBe('none');
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
