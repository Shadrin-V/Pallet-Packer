import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { listVehicles, upsertVehicle, type StorableVehicle } from '../db/vehicles';
import { vehicleBody } from './schemas';

/** Vehicle library endpoints. The catalogue cannot hold `compartments` yet — `StorableVehicle`
 *  (see db/vehicles.ts, находка 2 финального ревью p3p) makes that a compile-time fact, not a
 *  silent runtime drop. `vehicleBody`'s JSON schema also has no `compartments` property. */
export function vehiclesRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/vehicles', async () => listVehicles(db));
  app.put('/api/vehicles', { schema: { body: vehicleBody } }, async (req) =>
    upsertVehicle(db, req.body as StorableVehicle),
  );
}
