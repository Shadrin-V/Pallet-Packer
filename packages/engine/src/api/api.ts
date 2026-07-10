import type { EngineError, Layout, Load, Report, ReportPerType } from '../model/index';
import { ENGINE_CONTRACT_VERSION } from '../index';
import { validateLoad } from '../validation/validate';
import { packLoad } from '../packing/orchestrator';

/** Empty layout (zero metrics), optionally carrying validation error codes (api-contract 0.5.0). */
function emptyLayout(errors?: EngineError[]): Layout {
  const layout: Layout = {
    placements: [],
    unplaced: [],
    metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: ENGINE_CONTRACT_VERSION,
  };
  if (errors && errors.length > 0) layout.errors = errors;
  return layout;
}

/**
 * Public engine entry point (qrd.10): validate a `Load`, then pack it.
 *
 * On validation failure returns an empty `Layout` (no placements, zero metrics) whose `errors`
 * carries the codes (api-contract §3); the UI localises them via @shadrin-v/i18n. On success
 * returns the packed layout with metrics — `errors` is absent. Pure and deterministic.
 */
export function calculateLayout(load: Load): Layout {
  const errors = validateLoad(load);
  if (errors.length > 0) return emptyLayout(errors);
  return packLoad(load);
}

/**
 * Build a display/export report from a layout alone (qrd.10). Per-type counts are derived from the
 * layout: `placed` = placements of that type, `unplaced` = the layout's unplaced count, and
 * `requested` = placed + unplaced. Types appear in first-appearance order (placements first, then
 * any unplaced-only types), so the report is deterministic. Human text is assembled by the UI.
 */
export function getLayoutReport(layout: Layout): Report {
  const placed = new Map<string, number>();
  const order: string[] = [];
  for (const p of layout.placements) {
    if (!placed.has(p.cargoTypeId)) order.push(p.cargoTypeId);
    placed.set(p.cargoTypeId, (placed.get(p.cargoTypeId) ?? 0) + 1);
  }
  const unplaced = new Map<string, number>();
  for (const u of layout.unplaced) {
    if (!placed.has(u.cargoTypeId) && !unplaced.has(u.cargoTypeId)) order.push(u.cargoTypeId);
    unplaced.set(u.cargoTypeId, (unplaced.get(u.cargoTypeId) ?? 0) + u.count);
  }

  const perType: ReportPerType[] = order.map((id) => {
    const p = placed.get(id) ?? 0;
    const u = unplaced.get(id) ?? 0;
    return { cargoTypeId: id, requested: p + u, placed: p, unplaced: u };
  });

  return { layout, perType };
}
