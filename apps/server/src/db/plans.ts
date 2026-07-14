import type Database from 'better-sqlite3';
import type { Layout } from '@shadrin-v/engine';
import type { LoadingPlan, LoadingPlanInput, LoadingPlanSummary } from '@shadrin-v/contracts';

interface PlanRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  vehicle_json: string;
  load_input_json: string;
  layout_result_json: string;
  erpnext_refs_json: string;
  notes: string | null;
}

/**
 * Persist a plan as a reproducible snapshot: input Load + the Layout the caller already computed
 * (the route runs the engine's calculateLayout — the repo only stores). `meta` carries id + timestamp
 * so the repo stays pure/deterministic (no clock, no id generation here).
 */
export function savePlan(
  db: Database.Database,
  input: LoadingPlanInput,
  layout: Layout,
  meta: { id: string; now: string },
): LoadingPlan {
  db.prepare(
    `INSERT INTO loading_plan
       (id, name, created_at, updated_at, vehicle_json, load_input_json, layout_result_json, erpnext_refs_json, notes)
     VALUES (@id, @name, @now, @now, @vehicle, @load, @layout, @refs, @notes)`,
  ).run({
    id: meta.id,
    name: input.name,
    now: meta.now,
    vehicle: JSON.stringify(input.load.vehicle),
    load: JSON.stringify(input.load),
    layout: JSON.stringify(layout),
    refs: JSON.stringify(input.erpnextOrderIds),
    notes: input.notes ?? null,
  });
  return getPlan(db, meta.id);
}

/** Load a full plan by id; throws { code: 'ERR_NOT_FOUND' } when absent. */
export function getPlan(db: Database.Database, id: string): LoadingPlan {
  const row = db.prepare('SELECT * FROM loading_plan WHERE id = ?').get(id) as PlanRow | undefined;
  if (!row) {
    const err = new Error('loading plan not found') as Error & { code: string };
    err.code = 'ERR_NOT_FOUND';
    throw err;
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    load: JSON.parse(row.load_input_json),
    layout: JSON.parse(row.layout_result_json),
    erpnextOrderIds: JSON.parse(row.erpnext_refs_json),
    notes: row.notes ?? undefined,
  };
}

/** Plan summaries, newest first. */
export function listPlans(db: Database.Database): LoadingPlanSummary[] {
  return db
    .prepare(
      `SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
       FROM loading_plan ORDER BY updated_at DESC`,
    )
    .all() as LoadingPlanSummary[];
}
