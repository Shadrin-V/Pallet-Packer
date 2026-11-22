// Провайдер данных сборки во встраивании в ERP: единственное место, которое говорит с ERP. Методы —
// whitelisted-методы `schaefer_erp.ladungsplaner.api` (контракт erp-y6tb9 api-vertrag, §1, §3, §5).
// Обычная сборка его не импортирует: у неё свой `HttpDataProvider`.
//
// Правила транспорта (§1):
// - HTTP 401 — сессии нет. HTTP 403 БЕЗ `message.code` — Frappe отклонил гостя до входа в метод:
//   один раз перепроверяется `sitzung`; ответ 401 → «сессия истекла», иначе — общий отказ. 403 С кодом —
//   отказ по правам, без перепроверки.
// - POST с ответом 400 без кода — устаревший CSRF: один `sitzung` за новым токеном и один повтор;
//   второй такой отказ — общий сбой.
// - CSRF-токен живёт только в поле этого объекта: ни в localStorage, ни в sessionStorage, ни в cookie.
// Количество, единицы и порядок провайдер не трогает — это решает сервер (§4 п. 2–3, 8).
import {
  isOpenLine,
  isOrderZone,
  isTripImport,
  normalizeOrderZone,
  parseErpSession,
  type ApiError,
  type Article,
  type ArticleInput,
  type ArticleRules,
  type ErpSession,
  type LoadingPlan,
  type LoadingPlanInput,
  type LoadingPlanSummary,
  type OpenLine,
  type OrderPosition,
  type OrderRef,
  type OrderZone,
  type TripImport,
  type Vehicle,
} from '@shadrin-v/contracts';
import { FORK_ACCESS, FORK_AXES, NESTING_MODES, NESTING_STATES, ROTATION_RULES } from '@shadrin-v/engine';
import type { DataProvider } from './DataProvider';
import type { ErpSource, OpenLinesQuery } from './ErpSource';
import { isSessionExpired } from '../erp/erpErrors';

export const ERP_API_PREFIX = '/api/method/schaefer_erp.ladungsplaner.api.';

export interface FrappeDataProviderOptions {
  fetchImpl?: typeof fetch;
  /** Вызывается ровно один раз на каждый итоговый `ERR_NOT_LOGGED_IN`. */
  onSessionExpired?: () => void;
}

/** Предел строк поиска и списка строк (контракт §3, §4 п. 7). */
const MAX_QUERY = 140;
const MAX_LINES = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isPositiveInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0;
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T =>
  typeof x === 'string' && (list as readonly string[]).includes(x);

/** У ответа есть `message.code` — значит, отказ сформулировал сам метод, а не Frappe до него. */
const hasCode = (body: unknown): boolean =>
  isRecord(body) && isRecord(body.message) && typeof body.message.code === 'string';

const badResponse = (): ApiError => ({ code: 'ERR_BAD_RESPONSE' });
const invalid = (field: string): ApiError => ({ code: 'ERR_VALIDATION', details: { field } });
const unsupported = <T>(): Promise<T> => Promise.reject<T>({ code: 'ERR_UNSUPPORTED' } satisfies ApiError);

/** Чистое отображение ответа-отказа в `ApiError`, без перепроверок (их делает провайдер). */
export function toApiError(status: number, body: unknown): ApiError {
  if (status === 401) return { code: 'ERR_NOT_LOGGED_IN' };
  if (isRecord(body) && isRecord(body.message) && typeof body.message.code === 'string') {
    const { code, details } = body.message;
    return isRecord(details) ? { code, details } : { code };
  }
  return { code: 'ERR_HTTP', details: { status } };
}

/** Строка поиска: без краевых пробелов и не длиннее предела в символах (не в UTF-16-единицах). */
const searchText = (s: string): string => [...s.trim()].slice(0, MAX_QUERY).join('');

// ---- правила упаковки ------------------------------------------------------------------------
// Сторожа пакета contracts проверяют `rules` только как объект. Здесь из них остаются лишь допустимые
// значения — поштучно: кривое правило не роняет страницу и не даёт груза, который движок отклонит
// без понятного сообщения. Отброшенное правило = «не задано»: экран берёт умолчание.

function cleanRules(raw: unknown): Partial<ArticleRules> {
  if (!isRecord(raw)) return {};
  return {
    ...(oneOf(NESTING_STATES, raw.state) ? { state: raw.state } : {}),
    ...(oneOf(NESTING_MODES, raw.nestingMode) ? { nestingMode: raw.nestingMode } : {}),
    ...(oneOf(ROTATION_RULES, raw.rotation) ? { rotation: raw.rotation } : {}),
    ...(isPositiveInt(raw.maxNested) ? { maxNested: raw.maxNested } : {}),
    ...(isPositiveInt(raw.maxTiers) ? { maxTiers: raw.maxTiers } : {}),
    ...(typeof raw.allowUnpairedTop === 'boolean' ? { allowUnpairedTop: raw.allowUnpairedTop } : {}),
    ...(oneOf(FORK_ACCESS, raw.forkAccess) ? { forkAccess: raw.forkAccess } : {}),
    ...(oneOf(FORK_AXES, raw.forkAxis) ? { forkAxis: raw.forkAxis } : {}),
  };
}

const cleanSteps = (s: { nestStepPairwise?: unknown; nestStepSequential?: unknown }) => ({
  ...(isPositiveInt(s.nestStepPairwise) ? { nestStepPairwise: s.nestStepPairwise } : {}),
  ...(isPositiveInt(s.nestStepSequential) ? { nestStepSequential: s.nestStepSequential } : {}),
});

// Очищенные правила могут быть неполными, хотя тип `ArticleRules` требует state/nestingMode/rotation:
// экран применяет их как частичные (`rulesPatch`), недостающее остаётся умолчанием позиции.
function cleanPosition(p: OrderPosition): OrderPosition {
  const { rules, nestStepPairwise, nestStepSequential, ...rest } = p;
  const r = cleanRules(rules);
  return {
    ...rest,
    ...cleanSteps({ nestStepPairwise, nestStepSequential }),
    ...(Object.keys(r).length > 0 ? { rules: r as ArticleRules } : {}),
  };
}

const cleanZone = (z: OrderZone): OrderZone => {
  const n = normalizeOrderZone(z);
  return { ...n, positions: n.positions.map(cleanPosition) };
};

/** Запись каталога: без этих полей поле поиска артикула упало бы на первом же совпадении. */
const isArticleShape = (x: unknown): x is Article =>
  isRecord(x) && typeof x.itemCode === 'string' && typeof x.name === 'string' &&
  isRecord(x.rules) && Array.isArray(x.erpFields);

function cleanArticle(a: Article): Article {
  const { rules, nestStepPairwise, nestStepSequential, length, width, height, ...rest } = a;
  return {
    ...rest,
    ...(isPositiveInt(length) ? { length } : {}),
    ...(isPositiveInt(width) ? { width } : {}),
    ...(isPositiveInt(height) ? { height } : {}),
    ...cleanSteps({ nestStepPairwise, nestStepSequential }),
    rules: cleanRules(rules) as ArticleRules,
  };
}

/** Только поля `ArticleInput`: лишний ключ сервер отклоняет (контракт §4 п. 5). */
function articleInput(a: ArticleInput): ArticleInput {
  const { itemCode, name, length, width, height, nestStepPairwise, nestStepSequential, rules } = a;
  return {
    itemCode,
    name,
    ...(length !== undefined ? { length } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(nestStepPairwise !== undefined ? { nestStepPairwise } : {}),
    ...(nestStepSequential !== undefined ? { nestStepSequential } : {}),
    rules,
  };
}

// ---- транспорт -------------------------------------------------------------------------------

type Call = { method: 'GET'; params?: URLSearchParams } | { method: 'POST'; body: Record<string, unknown> };
interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
}

export class FrappeDataProvider implements DataProvider, ErpSource {
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionExpired?: () => void;
  /** Только в памяти (контракт §1). */
  private csrfToken: string | undefined;

  constructor(opts: FrappeDataProviderOptions = {}) {
    // Через globalThis: браузер требует `window` получателем `fetch` (LKWkalk-7wb).
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.onSessionExpired = opts.onSessionExpired;
  }

  private async send(method: string, call: Call): Promise<Reply> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let url = ERP_API_PREFIX + method;
    const init: RequestInit = { method: call.method, credentials: 'same-origin', headers };
    if (call.method === 'GET') {
      const qs = call.params?.toString() ?? '';
      if (qs) url += '?' + qs;
    } else {
      headers['Content-Type'] = 'application/json';
      headers['X-Frappe-CSRF-Token'] = this.csrfToken ?? '';
      init.body = JSON.stringify(call.body);
    }
    const res = await this.fetchImpl(url, init);
    const text = await res.text().catch(() => '');
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined; // HTML-страница прокси или Frappe
    }
    return { ok: res.ok, status: res.status, body };
  }

  /** Один вызов метода по правилам §1; возвращает `message` успешного ответа. */
  private async call(method: string, call: Call): Promise<unknown> {
    if (call.method === 'POST' && this.csrfToken === undefined) await this.fetchSession();
    let reply = await this.send(method, call);
    if (call.method === 'POST' && reply.status === 400 && !hasCode(reply.body)) {
      await this.fetchSession();
      reply = await this.send(method, call);
    }
    if (reply.ok) {
      if (!isRecord(reply.body) || !('message' in reply.body)) throw badResponse();
      return reply.body.message;
    }
    if (reply.status === 403 && !hasCode(reply.body) && method !== 'sitzung') throw await this.refusalAfterRecheck();
    throw toApiError(reply.status, reply.body);
  }

  /** 403 без кода: «сессия истекла» только если `sitzung` сам ответил 401, иначе общий отказ. */
  private async refusalAfterRecheck(): Promise<ApiError> {
    try {
      await this.fetchSession();
    } catch (e) {
      if (isSessionExpired(e)) return { code: 'ERR_NOT_LOGGED_IN' };
    }
    return { code: 'ERR_HTTP', details: { status: 403 } };
  }

  private async fetchSession(): Promise<ErpSession> {
    const s = parseErpSession(await this.call('sitzung', { method: 'GET' }));
    if (!s) throw badResponse();
    this.csrfToken = s.csrfToken;
    return s;
  }

  /** Граница публичного метода: итоговый `ERR_NOT_LOGGED_IN` сообщается ровно один раз. */
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      if (isSessionExpired(e)) this.onSessionExpired?.();
      throw e;
    }
  }

  // ---- ErpSource ----

  session(): Promise<ErpSession> {
    return this.run(() => this.fetchSession());
  }

  loadTrip(name: string): Promise<TripImport> {
    return this.run(async () => {
      const tripName = name.trim();
      if (!tripName) throw invalid('name');
      const m = await this.call('reise', { method: 'GET', params: new URLSearchParams({ name: tripName }) });
      if (!isTripImport(m)) throw badResponse();
      return { ...m, zones: m.zones.map(cleanZone) };
    });
  }

  listOpenLines(q: OpenLinesQuery = {}): Promise<OpenLine[]> {
    return this.run(async () => {
      const params = new URLSearchParams();
      const query = q.query === undefined ? '' : searchText(q.query);
      if (query) params.set('query', query);
      if (q.dueBefore !== undefined && q.dueBefore !== '') {
        if (!ISO_DATE.test(q.dueBefore)) throw invalid('dueBefore');
        params.set('dueBefore', q.dueBefore);
      }
      if (q.limit !== undefined && !Number.isNaN(q.limit)) {
        params.set('limit', String(Math.min(MAX_LINES, Math.max(1, Math.trunc(q.limit)))));
      }
      const m = await this.call('bestellpositionen', { method: 'GET', params });
      if (!Array.isArray(m) || !m.every(isOpenLine)) throw badResponse();
      return m;
    });
  }

  importLines(lineRefs: readonly string[]): Promise<OrderZone[]> {
    return this.run(async () => {
      if (lineRefs.length === 0 || lineRefs.length > MAX_LINES || new Set(lineRefs).size !== lineRefs.length) {
        throw invalid('lineRefs');
      }
      const m = await this.call('positionen', { method: 'POST', body: { lineRefs: [...lineRefs] } });
      if (!Array.isArray(m) || !m.every(isOrderZone)) throw badResponse();
      return m.map(cleanZone);
    });
  }

  // ---- DataProvider: каталог ----

  searchArticles(query: string): Promise<Article[]> {
    return this.run(async () => {
      const params = new URLSearchParams({ query: searchText(query) });
      const m = await this.call('artikel_suchen', { method: 'GET', params });
      if (!Array.isArray(m) || !m.every(isArticleShape)) throw badResponse();
      return m.map(cleanArticle);
    });
  }

  upsertArticle(a: ArticleInput): Promise<Article> {
    return this.run(async () => {
      const m = await this.call('artikel_speichern', { method: 'POST', body: { article: articleInput(a) } });
      if (!isArticleShape(m)) throw badResponse();
      return cleanArticle(m);
    });
  }

  // ---- DataProvider: в ERP-сборке не поддерживается (контракт §0 п. 7, §3) ----

  listVehicles(): Promise<Vehicle[]> {
    return unsupported();
  }
  upsertVehicle(_v: Vehicle): Promise<Vehicle> {
    return unsupported();
  }
  saveLoadingPlan(_p: LoadingPlanInput): Promise<LoadingPlan> {
    return unsupported();
  }
  listLoadingPlans(): Promise<LoadingPlanSummary[]> {
    return unsupported();
  }
  getLoadingPlan(_id: string): Promise<LoadingPlan> {
    return unsupported();
  }
  importOrder(_erpOrderId: string): Promise<OrderZone> {
    return unsupported();
  }
  searchOrders(_query: string): Promise<OrderRef[]> {
    return unsupported();
  }
}
