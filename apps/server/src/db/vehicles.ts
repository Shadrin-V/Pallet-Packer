import type Database from 'better-sqlite3';
import type { Vehicle } from '@shadrin-v/contracts';

/**
 * A vehicle this catalogue can actually store (финальное ревью ветки p3p, находка 2). The `vehicle`
 * table (schema.ts) has columns for id/name/length/width/height only — no `compartments`. Plain
 * `Vehicle` (from `@shadrin-v/contracts`, the full engine type) HAS `compartments?: Compartment[]`,
 * so typing this module's functions as `Vehicle` let a road-train vehicle be "saved" here and come
 * back as a single 16 600mm hold — the coupling gap silently vanishes and the packer seats cargo in
 * it. `Omit<Vehicle, 'compartments'>` alone does NOT close this hole: TS structural typing still
 * lets a `Vehicle` value (superset of the omitted type) flow into an `Omit<...>`-typed parameter
 * with no error, because the check is against a variable, not an object literal (no excess-property
 * check fires). Intersecting with `{ compartments?: undefined }` does work: it forces the
 * `compartments` property's *type* to be `undefined`, so a `Vehicle` whose `compartments` is typed
 * as `Compartment[] | undefined` fails to be assignable — a real compiler error, not a silent drop.
 * See `vehicles.types.test.ts` for the proof. Full compartment storage is tracked as a follow-up
 * (LKWkalk-p3p child bead) rather than done here — the two options were adding a
 * `compartments_json` column (some duplication until anything actually reads it back) or widening
 * every table consumer's assumption of "one hold"; neither is a two-line fix, and nothing today
 * calls `HttpDataProvider.listVehicles`/`saveVehicle` from any screen (plans store the whole `Load`,
 * where compartments already survive), so there is no live bug to rush.
 */
export type StorableVehicle = Omit<Vehicle, 'compartments'> & { compartments?: undefined };

/** Insert or update a vehicle by id. */
export function upsertVehicle(db: Database.Database, v: StorableVehicle): StorableVehicle {
  db.prepare(
    `INSERT INTO vehicle (id, name, length, width, height)
     VALUES (@id, @name, @length, @width, @height)
     ON CONFLICT(id) DO UPDATE SET
       name = @name, length = @length, width = @width, height = @height`,
  ).run(v);
  return v;
}

/** All vehicles, ordered by name. */
export function listVehicles(db: Database.Database): StorableVehicle[] {
  return db
    .prepare('SELECT id, name, length, width, height FROM vehicle ORDER BY name')
    .all() as StorableVehicle[];
}
