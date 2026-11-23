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
// - Смена пользователя: провайдер запоминает `user` первой полученной сессии. Любой следующий `sitzung`
//   с ДРУГИМ `user` (явная перепроверка, новый токен после 400, перепроверка после 403): токен не берётся,
//   запрос не повторяется, вызывающий получает `ERR_SESSION_CHANGED`, `onSessionChanged` — один раз, и
//   провайдер закрыт: дальше всё отклоняется тем же кодом без сети. Иначе на общем компьютере экран
//   прежнего сотрудника записал бы в ERP от имени нового. Оболочка закрывает провайдер и сама (`close`),
//   уходя из программы, — запоздавшие цепочки размонтированных экранов до сервера не доходят.
// - Пока идёт любая проверка сессии (`sitzung`: перепроверка при возврате во вкладку, новый токен после 400,
//   перепроверка после 403), новые запросы в сеть не уходят — ждут её исхода. Тот же пользователь — уходят;
//   другой — отклоняются `ERR_SESSION_CHANGED` без сети. Иначе быстрый GET старой вкладки успел бы прочитать
//   данные под сессией нового сотрудника до перехода на экран «вошёл другой пользователь». Проверка
//   сорвалась (сеть, сбой сервера, кривой ответ) — пользователь НЕ подтверждён: ожидавшие запросы
//   отклоняются той же ошибкой, что получила проверка, без сети, а следующий новый запрос сначала снова
//   проверяет сессию. Проверка в каждый момент одна: все (запросы, оболочка, новый токен после 400,
//   перепроверка после 403) ждут общий результат; новая начинается только после конца прежней. Иначе
//   запрос, дождавшийся «прежнего пользователя» от своей проверки, ушёл бы, пока параллельная ещё могла
//   найти смену. Проверка, не ответившая за 15 с, прерывается (`AbortController`) и считается сорвавшейся.
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
import { ERR_SESSION_CHANGED, isSessionChanged, isSessionExpired } from '../erp/erpErrors';

export const ERP_API_PREFIX = '/api/method/schaefer_erp.ladungsplaner.api.';

export interface FrappeDataProviderOptions {
  fetchImpl?: typeof fetch;
  /** Вызывается ровно один раз на каждый итоговый `ERR_NOT_LOGGED_IN` ОТКРЫТОГО провайдера. После закрытия
   *  (`close` или смена пользователя) намеренно не вызывается: отказ закрытого провайдера — не новое
   *  истечение, сигнал уже был или его заменила смена пользователя. */
  onSessionExpired?: () => void;
  /** Вызывается один раз: `sitzung` вернул другого пользователя, чем первая сессия. */
  onSessionChanged?: () => void;
}

/** Почему оболочка закрывает провайдер; закрытый отклоняет всё кодом причины, в сеть не ходит. */
export type SessionEnd = 'expired' | 'changed';
const CLOSED_CODE: Record<SessionEnd, string> = { expired: 'ERR_NOT_LOGGED_IN', changed: ERR_SESSION_CHANGED };

/** Предел строк поиска и списка строк (контракт §3, §4 п. 7). */
const MAX_QUERY = 140;
const MAX_LINES = 200;
/** Предел ожидания проверки сессии: дольше — сбой проверки, а не вечное ожидание придержанных запросов. */
export const SESSION_CHECK_TIMEOUT_MS = 15_000;
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

type Call =
  | { method: 'GET'; params?: URLSearchParams; signal?: AbortSignal }
  | { method: 'POST'; body: Record<string, unknown> };
interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
}

export class FrappeDataProvider implements DataProvider, ErpSource {
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionExpired?: () => void;
  private readonly onSessionChanged?: () => void;
  /** Только в памяти (контракт §1). */
  private csrfToken: string | undefined;
  /** Пользователь первой полученной сессии. */
  private user: string | undefined;
  /** Код, которым закрытый провайдер отклоняет всё; undefined — открыт. */
  private closedCode: string | undefined;
  /** Идущая проверка сессии — одна на всех; пока она есть, новые запросы ждут её исхода. */
  private sessionCheck: Promise<ErpSession> | undefined;
  /** Ошибка последней сорвавшейся проверки сессии; есть — пользователь не подтверждён. */
  private checkFailure: { error: unknown } | undefined;

  constructor(opts: FrappeDataProviderOptions = {}) {
    // Через globalThis: браузер требует `window` получателем `fetch` (LKWkalk-7wb).
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.onSessionExpired = opts.onSessionExpired;
    this.onSessionChanged = opts.onSessionChanged;
  }

  /** Закрыть провайдер: все дальнейшие вызовы — отказ без сети. Повторное закрытие причину не меняет. */
  close(reason: SessionEnd): void {
    this.closedCode ??= CLOSED_CODE[reason];
  }

  private closedError(): ApiError {
    return { code: this.closedCode ?? ERR_SESSION_CHANGED };
  }

  private async send(method: string, call: Call): Promise<Reply> {
    // Сам `sitzung` не ждёт — он и есть проверка. Без идущей проверки — без лишнего ожидания.
    if (method !== 'sitzung') await this.confirmedUser();
    // И здесь, а не только на входе публичного метода: цепочка, начатая до закрытия, после него не шлёт.
    if (this.closedCode !== undefined) throw this.closedError();
    const headers: Record<string, string> = { Accept: 'application/json' };
    let url = ERP_API_PREFIX + method;
    const init: RequestInit = { method: call.method, credentials: 'same-origin', headers };
    if (call.method === 'GET') {
      const qs = call.params?.toString() ?? '';
      if (qs) url += '?' + qs;
      if (call.signal) init.signal = call.signal;
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
      if (isSessionChanged(e)) return e as ApiError;
    }
    return { code: 'ERR_HTTP', details: { status: 403 } };
  }

  /** Пропустить запрос в сеть, только когда пользователь подтверждён: дождаться идущей проверки (и той,
   *  что началась за время ожидания); она сорвалась — отказ её ошибкой. Сорвалась прежняя, а идущей
   *  нет — начать новую. */
  private async confirmedUser(): Promise<void> {
    let pending = this.sessionCheck ?? (this.checkFailure !== undefined ? this.fetchSession() : undefined);
    while (pending) {
      await pending;
      pending = this.sessionCheck;
    }
    if (this.closedCode !== undefined) throw this.closedError();
    if (this.checkFailure !== undefined) throw this.checkFailure.error;
  }

  /** Общая проверка сессии: идёт — вернуть её же, иначе начать новую. Исход записывается раньше, чем
   *  его увидит любой ждущий (обработчик повешен первым). */
  private fetchSession(): Promise<ErpSession> {
    if (this.sessionCheck) return this.sessionCheck;
    const check = this.readSession();
    this.sessionCheck = check;
    const finish = (failure: { error: unknown } | undefined) => {
      if (this.sessionCheck === check) this.sessionCheck = undefined;
      this.checkFailure = failure;
    };
    check.then(
      () => finish(undefined),
      (error: unknown) => finish({ error }),
    );
    return check;
  }

  /** `sitzung` с пределом времени: не ответил за `SESSION_CHECK_TIMEOUT_MS` — запрос прерван, отказ
   *  `TimeoutError` (так же, как `fetch` с истёкшим `AbortSignal.timeout`). */
  private async sitzungWithTimeout(): Promise<unknown> {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const reason = new DOMException('session check timed out', 'TimeoutError');
        ctl.abort(reason);
        reject(reason);
      }, SESSION_CHECK_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.call('sitzung', { method: 'GET', signal: ctl.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readSession(): Promise<ErpSession> {
    const s = parseErpSession(await this.sitzungWithTimeout());
    if (!s) throw badResponse();
    if (this.closedCode !== undefined) throw this.closedError();
    if (this.user !== undefined && s.user !== this.user) {
      // Чужой токен не берётся; запрос, ради которого шли за сессией, не повторяется.
      this.closedCode = ERR_SESSION_CHANGED;
      this.onSessionChanged?.();
      throw this.closedError();
    }
    this.user = s.user;
    this.csrfToken = s.csrfToken;
    return s;
  }

  /** Граница публичного метода: итоговый `ERR_NOT_LOGGED_IN` сообщается ровно один раз. */
  private async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.closedCode !== undefined) throw this.closedError();
    try {
      return await work();
    } catch (e) {
      // Отказ закрытого провайдера — не новое истечение: сигнал уже был (или его заменила смена).
      if (isSessionExpired(e) && this.closedCode === undefined) this.onSessionExpired?.();
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
