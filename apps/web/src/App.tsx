import { useEffect, useState } from 'react';
import {
  calculateLayout,
  findGeometryViolations,
  LOADING_MODES,
  ORDER_GROUPINGS,
  type Layout,
  type Load,
  type LoadingMode,
  type OrderGrouping,
} from '@shadrin-v/engine';
import { LocaleProvider } from './i18n/LocaleContext';
import { SetupScreen } from './screens/SetupScreen';
import { LadeplanScreen } from './screens/LadeplanScreen';
import { EmptyPlan } from './screens/components/EmptyPlan';

const LOAD_STORAGE_KEY = 'ladungsplaner.load';
// Stable orderId→palette slot, persisted separately so the Load format stays unchanged (QA #2).
const ORDER_COLORS_STORAGE_KEY = 'ladungsplaner.orderColors';
/** Стратегия расчёта (5nb этап 2) — свой ключ, а не поле в `ladungsplaner.load`: её выбирают в шапке
 *  «Настройки» ДО расчёта, когда плана может ещё не быть, поэтому сохранённый план ей не дом (тот же
 *  довод, что у `ladungsplaner.yardGrouping` в LadeplanScreen; контракт `Load` не трогаем).
 *  Без этого выбор не переживал перезагрузку: черновик заявки возвращался целиком, а «Von der Seite»
 *  снова становился «Hinten und Seite» (финальное ревью, I4). */
const STRATEGY_STORAGE_KEY = 'ladungsplaner.strategy';

/** Прочитать сохранённую стратегию. Чужое/испорченное значение молча игнорируется — засев тогда
 *  возьмёт стратегию последнего плана, а её нет — умолчания контракта. */
function loadPersistedStrategy(): { loadingMode?: LoadingMode; orderGrouping?: OrderGrouping } {
  try {
    const raw = globalThis.localStorage?.getItem(STRATEGY_STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as { loadingMode?: string; orderGrouping?: string };
    return {
      ...(LOADING_MODES.includes(v.loadingMode as LoadingMode) ? { loadingMode: v.loadingMode as LoadingMode } : {}),
      ...(ORDER_GROUPINGS.includes(v.orderGrouping as OrderGrouping) ? { orderGrouping: v.orderGrouping as OrderGrouping } : {}),
    };
  } catch {
    return {};
  }
}

/** Rebuild the last computed plan from the persisted Load (layout is derived, not stored). */
function loadPersistedResult(): { load: Load; layout: Layout; orderColors?: Record<string, number> } | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOAD_STORAGE_KEY);
    if (!raw) return null;
    const load = JSON.parse(raw) as Load;
    const layout = calculateLayout(load);
    if (findGeometryViolations(load, layout).length > 0) return null;
    let orderColors: Record<string, number> | undefined;
    try {
      const rc = globalThis.localStorage?.getItem(ORDER_COLORS_STORAGE_KEY);
      if (rc) orderColors = JSON.parse(rc) as Record<string, number>;
    } catch {
      /* ignore */
    }
    return { load, layout, orderColors };
  } catch {
    return null;
  }
}

export function App() {
  // Single page: SetupScreen stays mounted (its state never resets); the Ladeplan result renders
  // below it when a layout has been computed. Both survive a refresh via localStorage.
  // `transient` marks a Demo preview: shown in the UI but never persisted, so a reload returns to
  // the user's saved plan (QA).
  // Один разбор localStorage на монтирование: loadPersistedResult ещё и пересчитывает layout, а
  // читают его три состояния сразу. Ленивый инициализатор useState вызывает функцию ровно один раз.
  const [persisted] = useState(loadPersistedResult);
  const [result, setResult] = useState<{ load: Load; layout: Layout; transient?: boolean; orderColors?: Record<string, number> } | null>(persisted);

  // Стратегия расчёта живёт здесь, а не в результате: её выбирают в шапке «Настройки» — ДО
  // расчёта, когда плана ещё может не быть, и потому хранить её в плане нельзя. Место правки одно
  // (5nb этап 2: с ладеплана переключатели убраны), но пережить сброс плана значение обязано.
  // Засев: свой ключ (последний ВЫБОР, даже если после него ничего не считали) → стратегия
  // последнего плана → умолчания контракта.
  const [persistedStrategy] = useState(loadPersistedStrategy);
  const [loadingMode, setLoadingMode] = useState<LoadingMode>(
    persistedStrategy.loadingMode ?? persisted?.load.loadingMode ?? 'combined',
  );
  const [orderGrouping, setOrderGrouping] = useState<OrderGrouping>(
    persistedStrategy.orderGrouping ?? persisted?.load.orderGrouping ?? 'strict',
  );

  /** Сохраняется только ВЫБОР пользователя в шапке — и только тронутое поле (LKWkalk-wmd).
   *  Снимок обоих полей из текущего состояния здесь нельзя: после Demo состояние показывает
   *  пришпиленную демо-стратегию (rear/strict, 4bj.13), и щелчок по одному переключателю утащил бы
   *  в хранилище и второе, демонстрационное поле. Demo — предпросмотр: его план не переживает
   *  перезагрузку, и его стратегия не должна тоже. Слияние — с сохранённым выбором, не с state. */
  const saveStrategyChoice = (patch: Partial<{ loadingMode: LoadingMode; orderGrouping: OrderGrouping }>) => {
    try {
      globalThis.localStorage?.setItem(
        STRATEGY_STORAGE_KEY,
        JSON.stringify({ ...loadPersistedStrategy(), ...patch }),
      );
    } catch {
      /* ignore */
    }
  };
  const chooseLoadingMode = (m: LoadingMode) => {
    setLoadingMode(m);
    saveStrategyChoice({ loadingMode: m });
  };
  const chooseOrderGrouping = (g: OrderGrouping) => {
    setOrderGrouping(g);
    saveStrategyChoice({ orderGrouping: g });
  };

  // Есть ли на показанном плане ручные правки раскладки. Знает об этом LadeplanScreen (там живёт
  // редактируемая копия), а выбрасывает их «Рассчитать» — предупредить обязан он, поэтому признак
  // проходит через App, а не остаётся внутри плана.
  const [hasManualEdits, setHasManualEdits] = useState(false);

  useEffect(() => {
    try {
      if (result?.transient) return; // preview: leave the previously saved plan untouched
      if (result) {
        globalThis.localStorage?.setItem(LOAD_STORAGE_KEY, JSON.stringify(result.load));
        if (result.orderColors) globalThis.localStorage?.setItem(ORDER_COLORS_STORAGE_KEY, JSON.stringify(result.orderColors));
        else globalThis.localStorage?.removeItem(ORDER_COLORS_STORAGE_KEY);
      } else {
        globalThis.localStorage?.removeItem(LOAD_STORAGE_KEY);
        globalThis.localStorage?.removeItem(ORDER_COLORS_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [result]);

  const onCalculate = (load: Load, opts?: { persist?: boolean; orderColors?: Record<string, number> }) => {
    // Стратегию передают все вызывающие явно: «Рассчитать» берёт её из состояния ниже, Demo
    // пришпиливает свою (4bj.13). Прежний fallback на стратегию предыдущего плана стал мёртвым
    // кодом вместе с переключателями на ладеплане (5nb этап 2) и убран.
    const layout = calculateLayout(load);
    // Domain invariant: never surface a layout with geometry violations.
    if (findGeometryViolations(load, layout).length > 0) return;
    // Demo doesn't pass orderColors → keep the current plan's map.
    setResult({ load, layout, transient: opts?.persist === false, orderColors: opts?.orderColors ?? result?.orderColors });
    // Стратегия того, что реально посчиталось, становится текущей — иначе Demo (он пришпиливает
    // rear) оставил бы шапку «Настройки» показывать combined, хотя план перед глазами построен
    // иначе: единственный на всю страницу переключатель обязан описывать то, что на ней видно.
    setLoadingMode(load.loadingMode ?? 'combined');
    setOrderGrouping(load.orderGrouping ?? 'strict');
  };

  /** «Сброс» убирает и план, и стратегию: она часть заявки, а не отдельная настройка приложения —
   *  после сброса экран обязан выглядеть как при первом открытии. */
  const onReset = () => {
    setResult(null);
    setLoadingMode('combined');
    setOrderGrouping('strict');
    // Забыть и сохранённый выбор: иначе перезагрузка после сброса вернула бы прежнюю стратегию.
    try {
      globalThis.localStorage?.removeItem(STRATEGY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <LocaleProvider initial="de">
      {/* Setup is screen-only; printing yields just the Ladeplan document — print:hidden несут
          setup-части внутри SetupScreen, а не обёртка здесь: план передаётся ДЕТЬМИ SetupScreen
          (LKWkalk-9tq), чтобы липкая шапка «Настройки» и план делили одного родителя — sticky
          прижимает элемент только в его пределах, и соседний план увозил шапку за экран. */}
      {/* Шапка «Настройки» стратегию только ЗАПОМИНАЕТ (решение владельца 1): пересчитывать
          готовый план из его прежнего груза нельзя — заявку могли уже поправить, и план разошёлся
          бы с тем, что на экране. Выбор применяет следующий «Рассчитать». */}
      <SetupScreen
        onCalculate={onCalculate}
        onReset={onReset}
        loadingMode={loadingMode}
        orderGrouping={orderGrouping}
        onLoadingModeChange={chooseLoadingMode}
        onOrderGroupingChange={chooseOrderGrouping}
        hasManualEdits={hasManualEdits}
      >
        {/* The plan section is always part of the page (rgv.2) — one page, not two screens. Until
            the first Berechnen it stands in as an empty state. There is no "back": the plan is
            removed by Zurücksetzen, which says so and asks first. */}
        {result ? (
          <LadeplanScreen
            load={result.load}
            layout={result.layout}
            orderColors={result.orderColors}
            onManualEditsChange={setHasManualEdits}
          />
        ) : (
          <EmptyPlan />
        )}
      </SetupScreen>
    </LocaleProvider>
  );
}
