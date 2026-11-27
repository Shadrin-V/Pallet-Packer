import type Database from 'better-sqlite3';
import type { ArticleInput, ArticleRules } from '@shadrin-v/contracts';
import { FORK_ACCESS, FORK_AXES, NESTING_MODES, NESTING_STATES, ROTATION_RULES } from '@shadrin-v/engine';

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

export type SkipReason =
  | 'EMPTY_CODE'
  | 'CODE_NOT_TRIMMED'
  | 'TEXT_TOO_LONG'
  | 'DIMENSION_OUT_OF_RANGE'
  | 'RULES_NOT_JSON'
  | 'RULES_INCOMPLETE'
  | 'RULES_UNKNOWN_KEY'
  | 'RULES_BAD_VALUE';

export interface CatalogExport {
  articles: ArticleInput[];
  skipped: Array<{ itemCode: string; reason: SkipReason }>;
}

// Limits of the ERP contract (api-vertrag §4 item 5 "Пределы" and the dimension rule there); the
// same limits apply on the ERP side, so a row beyond them would be rejected at import.
const MAX_MM = 20000; // dimensions and nesting steps: integer 1..20000 mm
const MAX_COUNT = 1000; // maxNested, maxTiers: integer 1..1000
const MAX_TEXT = 140; // itemCode, name: at most 140 characters
const isMm = (v: number): boolean => Number.isInteger(v) && v >= 1 && v <= MAX_MM;
const isCount = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_COUNT;
const oneOf = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v);

const RULE_CHECKS: Record<keyof ArticleRules, (v: unknown) => boolean> = {
  state: (v) => oneOf(NESTING_STATES, v),
  nestingMode: (v) => oneOf(NESTING_MODES, v),
  rotation: (v) => oneOf(ROTATION_RULES, v),
  maxNested: isCount,
  maxTiers: isCount,
  allowUnpairedTop: (v) => typeof v === 'boolean',
  forkAccess: (v) => oneOf(FORK_ACCESS, v),
  forkAxis: (v) => oneOf(FORK_AXES, v),
};
const REQUIRED_RULES = ['state', 'nestingMode', 'rotation'] as const;

const DEFAULT_RULES: ArticleRules = { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' };

/**
 * Rules as stored. Only a strictly empty `{}` (legacy rows) gets the defaults; anything partial,
 * unknown or out of range is rejected rather than repaired — the page applies catalogue rules to
 * the layout, so an invented value would silently change it.
 */
function parseRules(json: string): ArticleRules | SkipReason {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return 'RULES_NOT_JSON';
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'RULES_BAD_VALUE';
  const rec = raw as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 0) return { ...DEFAULT_RULES };
  if (keys.some((k) => !Object.hasOwn(RULE_CHECKS, k))) return 'RULES_UNKNOWN_KEY';
  if (REQUIRED_RULES.some((k) => rec[k] === undefined)) return 'RULES_INCOMPLETE';
  if (keys.some((k) => !RULE_CHECKS[k as keyof ArticleRules](rec[k]))) return 'RULES_BAD_VALUE';
  return rec as unknown as ArticleRules;
}

/**
 * One-off catalogue dump: every `article` row that is valid as `ArticleInput` (the input of the ERP
 * method `artikel_speichern`), ordered by item code. Missing values are omitted, not null. Rows the
 * contract would reject are not written; they are returned in `skipped` with a closed reason code.
 * Provenance (`source`, `erpFields`, timestamps) is not exported.
 */
export function exportCatalog(db: Database.Database): CatalogExport {
  const rows = db
    .prepare(
      `SELECT item_code, name, length, width, height, nest_step_pairwise, nest_step_sequential, rules_json
       FROM article ORDER BY item_code`,
    )
    .all() as Row[];
  const result: CatalogExport = { articles: [], skipped: [] };
  for (const r of rows) {
    const skip = (reason: SkipReason): void => void result.skipped.push({ itemCode: r.item_code, reason });
    if (r.item_code.trim() === '') {
      skip('EMPTY_CODE');
      continue;
    }
    if (r.item_code !== r.item_code.trim()) {
      skip('CODE_NOT_TRIMMED');
      continue;
    }
    if (r.item_code.length > MAX_TEXT || r.name.length > MAX_TEXT) {
      skip('TEXT_TOO_LONG');
      continue;
    }
    const nums = [r.length, r.width, r.height, r.nest_step_pairwise, r.nest_step_sequential];
    if (nums.some((v) => v !== null && !isMm(v))) {
      skip('DIMENSION_OUT_OF_RANGE');
      continue;
    }
    const rules = parseRules(r.rules_json);
    if (typeof rules === 'string') {
      skip(rules);
      continue;
    }
    const out: ArticleInput = { itemCode: r.item_code, name: r.name, rules };
    if (r.length !== null) out.length = r.length;
    if (r.width !== null) out.width = r.width;
    if (r.height !== null) out.height = r.height;
    if (r.nest_step_pairwise !== null) out.nestStepPairwise = r.nest_step_pairwise;
    if (r.nest_step_sequential !== null) out.nestStepSequential = r.nest_step_sequential;
    result.articles.push(out);
  }
  return result;
}
