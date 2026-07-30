// One input replaces the old preset <select> + name field (LKWkalk-8a0, closes rgv.8). Suggestions
// come from the server catalogue via the DataProvider seam, plus the built-in pallet presets as a
// static fallback that works offline and outside a provider.
import { useEffect, useId, useRef, useState } from 'react';
import type { Article, ArticleRules, ArticleErpField } from '@shadrin-v/contracts';
import { useOptionalDataProvider } from '../../data/DataProviderContext';
import { PALLET_PRESETS } from '../../data/presets';
import { useT } from '../../i18n/LocaleContext';

export interface ArticleSuggestion {
  itemCode?: string;
  name: string;
  length?: number;
  width?: number;
  height?: number;
  nestStepPairwise?: number;
  nestStepSequential?: number;
  rules?: Partial<ArticleRules>;
  /** Fields ERPNext actually supplied (dimensions and, per ADR 022, `name`) — these and only these
   *  are locked against local edits. Dimensions enforce this as `readOnly`; `name` does not (ADR
   *  022 §3: it stays the combobox's search input) — its lock shows as a notice instead. */
  erpFields: readonly ArticleErpField[];
  /** 'standard' = built-in EPAL preset: no article code, never saved to the catalogue. */
  origin: 'erp' | 'local' | 'standard';
}

const DEBOUNCE_MS = 200;

function builtinMatches(q: string): ArticleSuggestion[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return PALLET_PRESETS.filter((p) => p.name.toLowerCase().includes(needle)).map((p) => ({
    name: p.name,
    length: p.length,
    width: p.width,
    height: p.height,
    erpFields: [],
    origin: 'standard' as const,
  }));
}

function toSuggestion(a: Article): ArticleSuggestion {
  return {
    itemCode: a.itemCode,
    name: a.name,
    length: a.length,
    width: a.width,
    height: a.height,
    nestStepPairwise: a.nestStepPairwise,
    nestStepSequential: a.nestStepSequential,
    rules: a.rules,
    erpFields: a.erpFields,
    origin: a.source,
  };
}

export function ArticleCombobox({
  value,
  onChange,
  onPick,
  ariaLabel,
  className = '',
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: ArticleSuggestion) => void;
  ariaLabel: string;
  className?: string;
  /** Наружу — сам <input>, чтобы родитель мог вернуть в него фокус (LKWkalk-78x). */
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const tt = useT();
  const dp = useOptionalDataProvider();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArticleSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  // Distinguishes "haven't looked yet / still debouncing" from "looked, found nothing" — only the
  // latter earns the noMatches hint, otherwise it would flash on every keystroke.
  const [searched, setSearched] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced lookup. A failing request (offline, no server) must not break typing — the built-in
  // presets stay available, so the row is still usable.
  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      setSearched(false);
      return;
    }
    setSearched(false);
    let cancelled = false;
    const timer = setTimeout(async () => {
      let fromCatalogue: ArticleSuggestion[] = [];
      try {
        fromCatalogue = dp ? (await dp.searchArticles(query)).map(toSuggestion) : [];
      } catch (err) {
        // Staying silent for the user is deliberate (see above), but staying silent for the
        // developer cost hours in LKWkalk-7wb: the catalogue was dead in the browser and nothing
        // said so anywhere. The console keeps the next breakage one glance away.
        console.warn('[ArticleCombobox] catalogue lookup failed, showing built-in presets only', err);
        fromCatalogue = [];
      }
      if (cancelled) return;
      setItems([...fromCatalogue, ...builtinMatches(query)]);
      setActive(-1);
      setSearched(true);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, dp]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const pick = (s: ArticleSuggestion) => {
    onPick(s);
    setOpen(false);
    setQuery('');
  };

  const originLabel = (o: ArticleSuggestion['origin']) =>
    tt(o === 'erp' ? 'article.source.erp' : o === 'local' ? 'article.source.local' : 'article.source.standard');

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="w-full min-w-0 rounded-ctl border border-line bg-card px-2 py-1.5 text-body font-semibold outline-none focus:border-brand"
        value={value}
        placeholder={tt('article.label')}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(items[active >= 0 ? active : 0]);
          } else if (e.key === 'Escape') {
            // stopPropagation: Esc отменяет самое внутреннее — открытый список подсказок. Дальше по
            // документу тот же Esc закрывает панель разбора (SetupScreen), и без остановки одно
            // нажатие делало бы два дела сразу. Ветка достижима только когда список реально открыт
            // (ранний возврат выше), так что Esc «вообще» ничего не перехватывает.
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {/* `max-w-full` на обоих оверлеях — LKWkalk-e2g. `w-80` — это пожелание, а не размер: поле
          артикула (`flex-1 basis-64 min-w-0`) в реальном Chrome 259–290 px на любой ширине окна, и
          на 375 px карточка заказа (`section.overflow-hidden`) сама 320 px — правые 38 px оверлея
          там просто исчезали, без скролла и без подсказки. Ограничитель даёт min(320 px, поле);
          шире карточки на 375 px не влезает ни при каком якоре, так что сжатие неизбежно. */}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-80 max-w-full overflow-auto rounded-ctl border border-line bg-card shadow-lg"
        >
          {items.map((s, i) => (
            <li
              key={`${s.itemCode ?? s.name}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-baseline gap-2 px-2 py-1.5 text-body ${i === active ? 'bg-sub' : ''}`}
              onClick={() => pick(s)}
            >
              {s.itemCode && <span className="font-semibold">{s.itemCode}</span>}
              <span className="truncate">{s.name}</span>
              {s.length !== undefined && s.width !== undefined && s.height !== undefined && (
                <span className="ml-auto shrink-0 text-caption text-muted">
                  {s.length}×{s.width}×{s.height}
                </span>
              )}
              <span className="shrink-0 text-label uppercase text-faint">{originLabel(s.origin)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && items.length === 0 && searched && (
        <div
          role="status"
          className="absolute z-20 mt-1 w-80 max-w-full rounded-ctl border border-line bg-card px-2 py-1.5 text-caption text-muted shadow-lg"
        >
          {tt('article.noMatches')}
        </div>
      )}
    </div>
  );
}
