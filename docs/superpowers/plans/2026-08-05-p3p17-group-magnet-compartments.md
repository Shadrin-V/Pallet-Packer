# Доказательство отсеков в групповом магните — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть дыру в доказательстве `resolveGroupDrop`: сделать так, чтобы `resolveDrop.test.ts`
краснел, когда стенки отсеков проверяются не для каждой участницы группы.

**Architecture:** Работа целиком тестовая. Производственный код (`inBounds` в
`packages/engine/src/packing/resolveDrop.ts`) уже верен и **не меняется**. В существующий блок
`describe('resolveGroupDrop — стенки каждого отсека (p3p)')` добавляется фикстура из двух участниц в
разных отсеках, три детерминированных теста на ней и параметризация существующего sweep-инварианта.

**Tech Stack:** TypeScript, vitest. Пакет `packages/engine`.

Спека: `docs/superpowers/specs/2026-08-05-p3p17-group-magnet-compartments-design.md`.

## Global Constraints

- **Производственный код не меняется.** К концу работы `git diff main -- packages/engine/src/packing/resolveDrop.ts`
  обязан быть пуст. Мутации из шагов приёмки вносятся временно и откатываются в том же шаге.
- **Красная фаза здесь — мутация, а не отсутствие кода.** Новые тесты зеленеют сразу на неизменённом
  движке; это ожидаемо и ничего не доказывает. Доказательство — что они краснеют под M1 и M2.
- **Ассерты точные.** `expect(res.dx).toBe(1000)`, а не `not.toBe(1200)` и не `toBeGreaterThan`.
  Order-insensitive и «мягкие» утверждения не закрепляют свойство, от которого зависит поведение.
- **Числа фикстуры не пересчитывать «на глаз».** Кузов 5800 × 2400, отсеки `a` = [0, 2400),
  `b` = [3400, 5800), разрыв 1000. Кубик 1200 × 1200 × 1200, `rotation: 'none'` → dx = dy = 1200,
  допуск по умолчанию = min(dx, dy) / 2 = 600. Все три ожидаемых ответа прогнаны на реальном движке.
- **Порядок `refs` — `[A, B]`, и это load-bearing.** `members` строится обходом `refs`; нарушителем во
  всех сценариях сделана ВТОРАЯ участница. Если поменять порядок, мутация M1 отвергнет дельту по той
  же причине, что и корректный код, и тест её не заметит.
- **Если sweep-инвариант покраснеет на паре — это находка, а не повод править тест.** Он утверждает
  контракт ADR 020 («магнит не обещает того, что `moveStacks` отвергнет»). Красный sweep означает
  настоящее расхождение `resolveGroupDrop` ↔ `moveStacks` на группе в двух отсеках. В этом случае:
  СТОП, перейти в `superpowers:systematic-debugging`, завести `bd create`, не ослаблять ассерт.
- Точечный прогон — `npm test -- <путь>`. У воркспейсов скрипта `test` НЕТ, `npm test --workspace …`
  падает с `Missing script: "test"`.

## File Structure

| Файл | Что с ним |
|---|---|
| `packages/engine/src/packing/resolveDrop.test.ts` | **Единственный изменяемый файл.** Правки внутри блока `describe('resolveGroupDrop — стенки каждого отсека (p3p)')`, строки 408–478 |
| `packages/engine/src/packing/resolveDrop.ts` | Только временные мутации в шагах приёмки, с обязательным откатом |

---

### Task 1: Фикстура пары и три точечных теста

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` (добавить после `singleAtWall`, строка 450)

**Interfaces:**
- Consumes: `twoBays`, `cube`, `atC`, `singleAtWall` — уже объявлены в блоке (строки 409–450);
  `packLoad` из `./orchestrator`, `resolveGroupDrop` из `./resolveDrop` — уже импортированы (строки 6–7)
- Produces: `pairAcrossBays(xa: number, xb: number): { load: Load; layout: Layout; refs: StackRef[] }`
  — Task 2 вызывает её как `pairAcrossBays(0, 3600)`

- [ ] **Шаг 1: Добавить фикстуру `pairAcrossBays` сразу после `singleAtWall`**

```ts
  /** Две участницы в РАЗНЫХ отсеках. Порядок refs — [A, B]: нарушителем во всех сценариях ниже
   *  сделана ВТОРАЯ участница. Иначе проверка «судим только members[0]» отвергала бы дельту по той
   *  же причине, что и корректный код, и тест не отличил бы одно от другого. */
  const pairAcrossBays = (
    xa: number,
    xb: number,
  ): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load = { vehicle: twoBays, cargo: [cube({ quantity: 8 })] };
    const layout: Layout = {
      ...packLoad(load),
      placements: [atC(xa, 0), atC(xb, 0)],
      unplaced: [{ cargoTypeId: 'c', count: 6 }],
    };
    return {
      load,
      layout,
      refs: [
        { cargoTypeId: 'c', x: xa, y: 0 },
        { cargoTypeId: 'c', x: xb, y: 0 },
      ],
    };
  };
```

- [ ] **Шаг 2: Добавить три теста в конец блока, после существующего sweep-теста**

```ts
  it('отказывает, когда в разрыв попадает НЕ первая участница группы', () => {
    const { load, layout, refs } = pairAcrossBays(1200, 3400);
    // A@1200 — у дальней стенки тягача, B@3400 — у ближней стенки прицепа. Дельта −1000 ставит A в
    // [200, 1400) (законно, тягач), а B — в [2400, 3600): начало в разрыве. Ни один кандидат в
    // допуске 600 не устраивает ОБЕИХ: ближайший (−1200, при котором A встаёт к стенке x=0) уводит
    // B в [2200, 3400) — снова разрыв.
    const res = resolveGroupDrop(load, layout, refs, { dx: -1000, dy: 0 });

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });

  it('корректирует дельту по замыкающей участнице, а не по первой', () => {
    const { load, layout, refs } = pairAcrossBays(0, 3600);
    // Прицел 1200 — ровно та дельта, при которой A встаёт впритык к дальней стенке тягача. Для A она
    // законна, для B — нет: [4800, 6000) торчит за корму прицепа (5800). Магнит обязан отступить к
    // 1000, где к дальней стенке встаёт B, а A остаётся внутри тягача. 1000 и 1200 одинаково
    // «впритык», поэтому 1200 проверяется первой как ближняя к прицелу — и отвергается из-за B.
    const res = resolveGroupDrop(load, layout, refs, { dx: 1200, dy: 0 });

    expect(res.ok).toBe(true);
    expect(res.dx).toBe(1000);
    expect(res.dy).toBe(0);
  });

  it('не запрещает группе, законно стоящей сразу в двух отсеках, остаться на месте', () => {
    const { load, layout, refs } = pairAcrossBays(0, 3600);
    // Контроль на ложный отказ: проверка обязана отвергать нелегальное, не запрещая легального.
    // Краснеет, если отсек ищут один раз по первой участнице и её границами судят остальных —
    // тогда группа, живущая в двух отсеках, не может даже остаться на месте.
    const res = resolveGroupDrop(load, layout, refs, { dx: 0, dy: 0 });

    expect(res.ok).toBe(true);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
  });
```

- [ ] **Шаг 3: Прогнать — новые тесты обязаны быть ЗЕЛЁНЫМИ на неизменённом движке**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, 30 тестов (было 27).

Если какой-то из трёх красный — числа в фикстуре или ожидания разошлись с движком. Не подгонять
ожидание под вывод: остановиться, перечитать разбор сценария 2 в спеке и понять расхождение.

- [ ] **Шаг 4: Красная фаза — мутация M1**

В `packages/engine/src/packing/resolveDrop.ts`, строка ~439, заменить:

```ts
  const inBounds = (ddx: number, ddy: number): boolean =>
    members.every(
```

на:

```ts
  const inBounds = (ddx: number, ddy: number): boolean =>
    [members[0]].every(
```

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: **FAIL**. Обязаны покраснеть тесты 1 и 2 («отказывает, когда в разрыв…» вернёт `ok: true`
с `dx: -1200`; «корректирует дельту…» вернёт `dx: 1200`). До этой работы прогон был 27/27 зелёным.

Откатить мутацию: `git checkout -- packages/engine/src/packing/resolveDrop.ts`

- [ ] **Шаг 5: Красная фаза — мутация M2**

В том же файле заменить весь блок `inBounds` на «оптимизированный» вариант, ищущий отсек один раз:

```ts
  const inBounds = (ddx: number, ddy: number): boolean => {
    const m0 = members[0];
    const c0 = compartmentsOf(load.vehicle).find(
      (c) => m0.x + ddx >= c.x && m0.x + ddx + m0.dx <= c.x + c.length,
    );
    if (!c0) return false;
    return members.every(
      (m) =>
        m.x + ddx >= c0.x &&
        m.x + ddx + m.dx <= c0.x + c0.length &&
        m.y + ddy >= 0 &&
        m.y + ddy + m.dy <= load.vehicle.width,
    );
  };
```

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: **FAIL**. Обязаны покраснеть тесты 2 и 3 (оба получат ложный `ERR_EDIT_OUT_OF_BOUNDS`).
До этой работы M2 не краснила НИ ОДИН из 277 тестов движка.

Откатить мутацию: `git checkout -- packages/engine/src/packing/resolveDrop.ts`

- [ ] **Шаг 6: Убедиться, что производственный код чист, и прогнать пакет целиком**

Run: `git diff -- packages/engine/src/packing/resolveDrop.ts`
Expected: пустой вывод.

Run: `npm test -- packages/engine`
Expected: PASS, 277 тестов (было 274).

- [ ] **Шаг 7: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): отсеки группового магнита на паре в разных отсеках (LKWkalk-p3p.17)

Проверено мутацией: под [members[0]].every и под поиском отсека по первой
участнице новые тесты краснеют; производственный код не менялся.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Прогнать sweep-инвариант ещё и по паре

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` (существующий тест, строки 463–477)

**Interfaces:**
- Consumes: `pairAcrossBays` из Task 1, `singleAtWall` (строка 442), `moveStacks` из `./edit`
  (импортирован, строка 4)
- Produces: ничего для последующих задач

- [ ] **Шаг 1: Заменить существующий sweep-тест на параметризованный по двум фикстурам**

Было (строки 463–477):

```ts
  // ADR 020 для группы: если resolveGroupDrop сказала ok, moveStacks по этой дельте не откажет.
  it('never returns ok for a group delta moveStacks would refuse (compartment gap swept)', () => {
    const { load, layout, refs } = singleAtWall();
```

Стало:

```ts
  // ADR 020 для группы: если resolveGroupDrop сказала ok, moveStacks по этой дельте не откажет.
  // Прогоняется по ОБЕИМ фикстурам: у группы из одной стопки `members.every(…)` вырождается в
  // `members[0]`, поэтому одиночка этот инвариант для группы не стережёт — пару нужно гонять
  // отдельно.
  const sweepFixtures: [string, () => { load: Load; layout: Layout; refs: StackRef[] }][] = [
    ['одна стопка у стенки тягача', singleAtWall],
    ['пара в разных отсеках', () => pairAcrossBays(0, 3600)],
  ];

  for (const [name, fixture] of sweepFixtures) {
    it(`never returns ok for a group delta moveStacks would refuse — ${name}`, () => {
      const { load, layout, refs } = fixture();
      for (let dx = -1600; dx <= 4600; dx += 100) {
        for (const dy of [0, 400, 800, 1200]) {
          const r = resolveGroupDrop(load, layout, refs, { dx, dy });
          if (!r.ok) continue;
          const moved = moveStacks(load, layout, refs, r.dx, r.dy);
          expect(
            moved.error,
            `resolveGroupDrop said ok at dx=${r.dx},dy=${r.dy} (aim ${dx},${dy}) but moveStacks refused`,
          ).toBeUndefined();
        }
      }
    });
  }
```

Тело цикла скопировано без изменений — меняется только источник фикстуры и имя теста.

- [ ] **Шаг 2: Прогнать**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, 31 тест (30 после Task 1, плюс второй экземпляр sweep).

Если экземпляр «пара в разных отсеках» красный — это НАСТОЯЩЕЕ расхождение `resolveGroupDrop` ↔
`moveStacks`, а не дефект теста. Действовать по Global Constraints: СТОП, `systematic-debugging`,
`bd create`. Ассерт не ослаблять, фикстуру под зелёный не подгонять.

- [ ] **Шаг 3: Проверить, что sweep на паре не выродился в холостой**

Sweep молча проходит, если `resolveGroupDrop` не сказала `ok` ни разу — тогда тело `expect` не
исполнялось вовсе. Убедиться, что на паре есть принятые дельты: временно добавить счётчик
`let accepted = 0;`, инкремент после `if (!r.ok) continue;` и `expect(accepted).toBeGreaterThan(0);`
в конце теста. Прогнать, увидеть зелёный, затем **счётчик удалить** — он был разовой проверкой, что
тест не холостой.

- [ ] **Шаг 4: Гейты целиком**

```bash
npm test          # ожидается 1128/1128 (было 1125), 87 файлов
npm run typecheck # 0 ошибок
npm run lint      # 0 ошибок
git diff -- packages/engine/src/packing/resolveDrop.ts   # пусто
```

- [ ] **Шаг 5: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): sweep-инвариант ADR 020 прогоняется и по паре в разных отсеках (LKWkalk-p3p.17)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

## Self-Review

**Покрытие спеки.** Фикстура `pairAcrossBays` — Task 1 шаг 1. Сценарии 1/2/3 — Task 1 шаг 2.
Параметризация sweep — Task 2 шаг 1. Критерий приёмки: пункт 1 — Task 1 шаг 3, пункт 2 (M1) — Task 1
шаг 4, пункт 3 (M2) — Task 1 шаг 5, пункт 4 (гейты + чистый diff) — Task 2 шаг 4. Разделы «что работа
не трогает» задачами не покрываются намеренно: там сказано, чего НЕ делать (контракт, ADR, локали).

**Заглушки.** Нет: каждый шаг несёт готовый код или точную команду с ожидаемым выводом.

**Согласованность типов.** `pairAcrossBays` объявлена с одной сигнатурой и вызывается в Task 2 в
точности как `pairAcrossBays(0, 3600)`. Возвращаемая тройка `{ load, layout, refs }` совпадает с
формой `singleAtWall`, поэтому обе годятся в один массив `sweepFixtures`. `compartmentsOf` в мутации
M2 уже импортирован в производственном файле (строка 18) — новых импортов мутация не требует.
