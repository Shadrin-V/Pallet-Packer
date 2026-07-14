import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { Vehicle } from '@shadrin-v/contracts';
import { listVehicles, upsertVehicle } from '../db/vehicles';

/** Vehicle library endpoints. */
export function vehiclesRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/vehicles', async () => listVehicles(db));
  app.put('/api/vehicles', async (req) => upsertVehicle(db, req.body as Vehicle));
}
