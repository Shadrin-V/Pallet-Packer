import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { ArticleInput } from '@shadrin-v/contracts';
import { searchArticles, upsertArticle } from '../db/articles';
import { articleInputBody } from './schemas';

/** Article catalogue endpoints — the source of the position-row autocomplete. */
export function articlesRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/articles', async (req) => {
    const { q } = req.query as { q?: string };
    return searchArticles(db, q ?? '');
  });

  app.put('/api/articles/:itemCode', { schema: { body: articleInputBody } }, async (req) => {
    const { itemCode } = req.params as { itemCode: string };
    const body = req.body as ArticleInput;
    // The path identifies the article; a mismatching body code is ignored, not honoured.
    return upsertArticle(db, { ...body, itemCode }, { now: new Date().toISOString() });
  });
}
