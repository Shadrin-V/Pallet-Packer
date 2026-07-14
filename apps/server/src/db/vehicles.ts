import type Database from 'better-sqlite3';
import type { Vehicle } from '@shadrin-v/contracts';

/** Insert or update a vehicle by id. */
export function upsertVehicle(db: Database.Database, v: Vehicle): Vehicle {
  db.prepare(
    `INSERT INTO vehicle (id, name, length, width, height)
     VALUES (@id, @name, @length, @width, @height)
     ON CONFLICT(id) DO UPDATE SET
       name = @name, length = @length, width = @width, height = @height`,
  ).run(v);
  return v;
}

/** All vehicles, ordered by name. */
export function listVehicles(db: Database.Database): Vehicle[] {
  return db
    .prepare('SELECT id, name, length, width, height FROM vehicle ORDER BY name')
    .all() as Vehicle[];
}
