import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
