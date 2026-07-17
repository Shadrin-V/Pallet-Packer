import { describe, it, expect, vi, afterEach } from 'vitest';
import { ENGINE_CONTRACT_VERSION, type Layout, type Load } from '@shadrin-v/engine';
import {
  buildCompositeSvg,
  buildPlanJson,
  downloadBlob,
  planFilename,
  resolveCssVars,
  slugify,
} from './exportPlan';

const SVG_NS = 'http://www.w3.org/2000/svg';

const load: Load = {
  vehicle: { id: 'v1', name: 'LKW Standard', length: 13600, width: 2480, height: 2700 },
  cargo: [
    {
      id: 'c1',
      name: 'EPAL 1',
      length: 1200,
      width: 800,
      height: 144,
      quantity: 2,
      rotation: 'yawOnly',
      stacking: { stackable: false },
      nesting: { nestable: false },
      state: 'entschachtelt',
      orderId: 'SO-1001',
    },
  ],
};

const layout: Layout = {
  placements: [
    { cargoTypeId: 'c1', x: 0, y: 0, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt' },
    { cargoTypeId: 'c1', x: 1200, y: 0, z: 0, orientation: 'lwh', tier: 1, state: 'entschachtelt' },
  ],
  unplaced: [],
  metrics: { totalPlaced: 2, usedFloorPositions: 2, floorFillPercent: 5.7, volumeFillPercent: 0.3 },
  contractVersion: ENGINE_CONTRACT_VERSION,
};

function cutaway(viewBox: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', '100%');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('fill', 'var(--s1)');
  svg.appendChild(rect);
  const chrome = document.createElementNS(SVG_NS, 'g');
  chrome.setAttribute('class', 'print:hidden');
  chrome.appendChild(document.createElementNS(SVG_NS, 'circle'));
  svg.appendChild(chrome);
  return svg;
}

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('LKW Standard')).toBe('lkw-standard');
  });

  it('transliterates umlauts and drops punctuation', () => {
    expect(slugify('Mega-Auflieger «Schäfer» 3,0m')).toBe('mega-auflieger-schaefer-3-0m');
  });

  it('falls back for a name with no usable characters', () => {
    expect(slugify('———')).toBe('ladeplan');
  });
});

describe('planFilename', () => {
  it('joins slug, date and extension', () => {
    expect(planFilename('LKW Standard', 'json', new Date('2026-07-17T10:00:00Z'))).toBe(
      'ladungsplaner-lkw-standard-2026-07-17.json',
    );
    expect(planFilename('LKW Standard', 'png', new Date('2026-07-17T10:00:00Z'))).toBe(
      'ladungsplaner-lkw-standard-2026-07-17.png',
    );
  });
});

describe('buildPlanJson', () => {
  it('carries load, layout, contract version and the export timestamp', () => {
    const json = buildPlanJson(load, layout, new Date('2026-07-17T10:00:00Z'));
    expect(json.engineContractVersion).toBe(ENGINE_CONTRACT_VERSION);
    expect(json.exportedAt).toBe('2026-07-17T10:00:00.000Z');
    expect(json.load).toEqual(load);
    expect(json.layout).toEqual(layout);
  });

  it('survives a JSON round-trip (no functions, no cycles)', () => {
    const json = buildPlanJson(load, layout, new Date('2026-07-17T10:00:00Z'));
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe('resolveCssVars', () => {
  it('substitutes each var() with the resolved token value', () => {
    const out = resolveCssVars('<rect fill="var(--s1)" stroke="var(--brand)"/>', (n) =>
      n === '--s1' ? '#2e7d32' : '#104f25',
    );
    expect(out).toBe('<rect fill="#2e7d32" stroke="#104f25"/>');
  });

  it('leaves the markup unchanged when a token does not resolve', () => {
    const out = resolveCssVars('<rect fill="var(--s1)"/>', () => '');
    expect(out).toBe('<rect fill="var(--s1)"/>');
  });

  it('honours a var() fallback when the token does not resolve', () => {
    expect(resolveCssVars('<rect fill="var(--s9, #ccc)"/>', () => '')).toBe('<rect fill="#ccc"/>');
    // a resolving token still wins over its fallback
    expect(resolveCssVars('<rect fill="var(--s1, #ccc)"/>', () => '#2e7d32')).toBe(
      '<rect fill="#2e7d32"/>',
    );
  });
});

describe('buildCompositeSvg', () => {
  const opts = {
    title: 'LKW Standard',
    meta: ['13 600 × 2 480 × 2,70 m', 'SO-1001 · SO-1002'],
    figures: [
      { label: 'Paletten', value: '34' },
      { label: 'Auslastung', value: '93 %' },
    ],
    legend: [{ label: 'SO-1001 · 34', color: 'var(--s1)' }],
    sections: [
      { caption: 'Draufsicht', svg: cutaway('0 0 13600 2480') },
      { caption: 'Seitenansicht', svg: cutaway('0 0 13600 2700') },
    ],
  };

  it('embeds both projections, in order, as nested svg with their own viewBox', () => {
    const markup = buildCompositeSvg(opts);
    const boxes = [...markup.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]);
    // sheet viewBox first, then top view, then side view
    expect(boxes.slice(1)).toEqual(['0 0 13600 2480', '0 0 13600 2700']);
  });

  it('includes the title, meta, figures and legend text', () => {
    const markup = buildCompositeSvg(opts);
    for (const text of ['LKW Standard', '13 600 × 2 480 × 2,70 m', 'Paletten', '34', 'Auslastung', 'SO-1001 · 34']) {
      expect(markup).toContain(text);
    }
  });

  it('carries a legend label verbatim, including an unplaced remark', () => {
    const markup = buildCompositeSvg({
      ...opts,
      legend: [{ label: 'SO-1001 — EPAL 1 ×34 (6 nicht platziert)', color: 'var(--s1)' }],
    });
    expect(markup).toContain('SO-1001 — EPAL 1 ×34 (6 nicht platziert)');
  });

  it('drops screen-only chrome (print:hidden) from the exported image', () => {
    expect(buildCompositeSvg(opts)).not.toContain('circle');
  });

  it('keeps the source svg elements untouched (clones before mutating)', () => {
    const svg = cutaway('0 0 13600 2480');
    buildCompositeSvg({ ...opts, sections: [{ caption: 'Draufsicht', svg }] });
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.querySelector('.print\\:hidden')).not.toBeNull();
  });

  it('sizes the sheet to fit the header, both projections and the legend', () => {
    const markup = buildCompositeSvg(opts);
    const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(markup);
    expect(box).not.toBeNull();
    const [w, h] = [Number(box![1]), Number(box![2])];
    expect(w).toBeGreaterThan(0);
    // both cutaways are ~5.5:1 and 5:1 — the sheet must be far taller than a single strip
    expect(h).toBeGreaterThan(w / 3);
  });
});

describe('downloadBlob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers the blob under the given filename and releases the object url', () => {
    vi.useFakeTimers();
    const createUrl = vi.fn(() => 'blob:fake');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const blob = new Blob(['{}'], { type: 'application/json' });
    downloadBlob(blob, 'ladungsplaner-lkw-standard-2026-07-17.json');

    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('ladungsplaner-lkw-standard-2026-07-17.json');
    expect(anchor.getAttribute('href')).toBe('blob:fake');
    // the url must outlive the click — Safari/Firefox can still be starting the transfer
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
    // no leftovers in the document
    expect(document.querySelector('a[download]')).toBeNull();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
