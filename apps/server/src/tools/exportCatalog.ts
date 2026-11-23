import type Database from 'better-sqlite3';
import type { ArticleInput, ArticleRules } from '@shadrin-v/contracts';

interface Row {
  item_code: string;
  name: string;
  length: number | null;
  width: number | null;
  height: number | null;
  nest_step_pairwise: number | null;
  nest_step_sequential: number | null;
  rules_json: string;
}

const DEFAULT_RULES: ArticleRules = { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' };

/**
 * One-off catalogue dump: every `article` row as `ArticleInput` (the input of the ERP method
 * `artikel_speichern`), ordered by item code. Missing values are omitted, not null; legacy rows with
 * empty rules get the defaults. Provenance (`source`, `erpFields`, timestamps) is not exported.
 */
export function exportCatalog(db: Database.Database): ArticleInput[] {
  const rows = db
    .prepare(
      `SELECT item_code, name, length, width, height, nest_step_pairwise, nest_step_sequential, rules_json
       FROM article ORDER BY item_code`,
    )
    .all() as Row[];
  return rows.map((r) => {
    const out: ArticleInput = {
      itemCode: r.item_code,
      name: r.name,
      rules: { ...DEFAULT_RULES, ...(JSON.parse(r.rules_json) as Partial<ArticleRules>) },
    };
    if (r.length !== null) out.length = r.length;
    if (r.width !== null) out.width = r.width;
    if (r.height !== null) out.height = r.height;
    if (r.nest_step_pairwise !== null) out.nestStepPairwise = r.nest_step_pairwise;
    if (r.nest_step_sequential !== null) out.nestStepSequential = r.nest_step_sequential;
    return out;
  });
}
