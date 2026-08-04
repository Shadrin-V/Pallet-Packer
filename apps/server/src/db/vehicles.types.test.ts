// Type-only guard (финальное ревью ветки p3p, находка 2). `apps/server`'s `vehicle` table has
// columns for id/name/length/width/height only (schema.ts) — it cannot store `Compartment[]`.
// `upsertVehicle` used to take a plain `@shadrin-v/contracts` `Vehicle` (which HAS `compartments`),
// so a road-train `Vehicle` saved to the catalogue came back as a single 16 600mm hold and the
// packer would seat cargo in the coupling gap. `npm test` cannot catch this — it is a compile-time
// shape problem, not a runtime one — so this file has no assertions; it exists purely for
// `npm run typecheck` to evaluate. Before the fix (`upsertVehicle(db, v: Vehicle)`), the
// `@ts-expect-error` below is unused and `tsc --noEmit` fails with "Unused '@ts-expect-error'
// directive" — that is this test's proven RED. After narrowing the parameter to `StorableVehicle`
// (`Omit<Vehicle, 'compartments'> & { compartments?: undefined }`), passing a value whose
// `compartments` field is a real `Compartment[]` is a genuine type error and `tsc` passes GREEN.
import { it } from 'vitest';
import type Database from 'better-sqlite3';
import type { Vehicle } from '@shadrin-v/contracts';
import { upsertVehicle } from './vehicles';

// vitest fails a file with zero tests ("no test suite found"); this file's real assertion is
// `npm run typecheck` on the function below, so this is a no-op placeholder for the runner.
it('is a type-only guard, see file doc comment (checked by npm run typecheck, not vitest)', () => {});

// Never called — type-checked only.
function typeOnly_upsertVehicleRejectsCompartments(db: Database.Database): void {
  const trainVehicle: Vehicle = {
    id: 'train',
    name: 'Gliederzug',
    length: 16600,
    width: 2450,
    height: 3050,
    compartments: [
      { id: 'tractor', x: 0, length: 7700 },
      { id: 'trailer', x: 8900, length: 7700 },
    ],
  };
  // @ts-expect-error — a Vehicle whose `compartments` is a real Compartment[] must not silently
  // type-check against the DB layer's storage type (see file doc comment).
  upsertVehicle(db, trainVehicle);
}
void typeOnly_upsertVehicleRejectsCompartments;
