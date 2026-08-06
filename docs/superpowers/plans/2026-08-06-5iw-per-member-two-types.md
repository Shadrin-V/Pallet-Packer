# Правило и габариты по СВОЕЙ участнице группы (`LKWkalk-5iw`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** доказать тестами, что `resolveGroupDrop` берёт правило (`rotation`, `forkAccess`) И габариты
каждой участницы группы из ЕЁ собственного типа груза, а не из типа первой участницы.

**Architecture:** продкод не меняется ни на строку — работа целиком в
`packages/engine/src/packing/resolveDrop.test.ts`. Строится одна фикстура `twoTypePair(order)`:
группа из двух колонн РАЗНЫХ типов груза, различающихся и правилами, и габаритами. На ней ставятся
шесть экземпляров теста: контроль ложного отказа, два правила × два порядка `refs`, и один
геометрический. Приёмка — мутационная: три мутации продкода, каждая обязана покраснеть на своих
инстансах, откат обязан позеленеть.

**Tech Stack:** TypeScript, vitest, npm-воркспейсы (`packages/engine`).

## Global Constraints

- **Спека — `docs/superpowers/specs/2026-08-06-5iw-per-member-two-types-design.md`.** Она источник
  истины по числам и обоснованиям; расхождение плана и спеки решается в пользу спеки.
- **Продкод `packages/engine/src/packing/resolveDrop.ts` не меняется.** Мутации из задачи 4
  применяются ВРЕМЕННО и обязательно откатываются `git checkout -- <файл>`.
- **Запись в `CHANGELOG` не делается** — нет ни изменения контракта (`0.18.0`), ни поведения, ни
  пользовательского эффекта.
- **Ни одной пользовательской строки** работа не добавляет — гейты i18n (`y5j`) не затрагиваются.
- **Все команды — из корня репозитория.** У воркспейсов скрипта `test` нет.
- Гейты до и после работы: `npm test` (было 1134/1134, 87 файлов), `npm run typecheck`, `npm run lint`.
- Ветка: `test/5iw-two-type-group` (уже создана, спека в ней закоммичена).

## File Structure

| Файл | Роль |
|---|---|
| `packages/engine/src/packing/resolveDrop.test.ts` | ЕДИНСТВЕННЫЙ изменяемый файл. Новый блок `5iw` добавляется в конец `describe('resolveGroupDrop')` (строки 155–389), сразу после блока `s9o` (кончается на строке 388), перед закрывающей `});` на строке 389 |
| `packages/engine/src/packing/resolveDrop.ts` | читается для понимания; изменяется только временно в задаче 4 |

Существующие файловые хелперы, которые используются как есть: `V` (`:9`), `pallet` (`:10`),
`at(x, y)` (`:24`), `layoutOf(placements, unplaced)` (`:33`).

---

### Task 1: Фикстура двух типов + контроль ложного отказа

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` — вставка перед `});` на строке 389

**Interfaces:**
- Consumes: файловые `V`, `pallet`, `at`, `layoutOf`; импорты `CargoType`, `Layout`, `Load`,
  `StackRef`, `resolveGroupDrop` уже есть в шапке файла (строки 1–7) — добавлять импорты не нужно.
- Produces: `twoTypePair(order: 'AB' | 'BA'): { load: Load; layout: Layout; refs: StackRef[] }` —
  используют задачи 2 и 3. Константа `other: CargoType` — внутренняя деталь фикстуры; наружу она
  отдаётся через `load.cargo[1]`.

- [ ] **Step 1: Написать фикстуру и контрольный тест**

Вставить в конец `describe('resolveGroupDrop')`, после блока `s9o`:

```ts
  // LKWkalk-5iw: группа из ДВУХ РАЗНЫХ типов груза. Пробел, осознанно оставленный s9o: там обе
  // колонны были одного типа, поэтому резолв «один раз по unique[0].cargoTypeId» и резолв на каждую
  // участницу давали ОДИН И ТОТ ЖЕ объект cargo — мутация «вынести резолв из цикла» была
  // неотличима от здорового кода. Здесь типы различаются и правилами, и габаритами, поэтому чужой
  // cargo виден и в вердикте правила (тесты ниже), и в footprint участницы (последний тест).
  const other: CargoType = {
    ...pallet,
    id: 'q',
    name: 'Q',
    length: 1000,
    width: 600,
    height: 900,
    quantity: 1,
  };

  // Нарушителем всегда назначается колонна B (тип 'q'), а правило ужесточается ТОЛЬКО у 'q': тип
  // 'p' остаётся законным. Именно это делает подстановку чужого cargo наблюдаемой — под мутацией B
  // судится правилами 'p' и проходит.
  const twoTypePair = (
    order: 'AB' | 'BA',
  ): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load: Load = { vehicle: V, cargo: [{ ...pallet, quantity: 1 }, other] };
    const a = at(0, 0); // тип 'p', 'lwh' → footprint 1200 × 800
    const b = { ...at(4000, 0), cargoTypeId: 'q', orientation: 'wlh' as const }; // 600 × 1000
    const refs: StackRef[] = [
      { cargoTypeId: 'p', x: a.x, y: a.y },
      { cargoTypeId: 'q', x: b.x, y: b.y },
    ];
    return {
      load,
      // unplaced переопределён: файловый layoutOf зашивает cargoTypeId 'p', и на двухтипной
      // загрузке это была бы ложь в фикстуре. resolveGroupDrop поля не читает, но фикстура не врёт.
      layout: { ...layoutOf([a, b], 0), unplaced: [] },
      refs: order === 'AB' ? refs : [refs[1], refs[0]],
    };
  };

  it('не запрещает законной паре из двух типов остаться на месте (5iw)', () => {
    // Контроль на ложный отказ: без него негативные тесты ниже неотличимы от «фикстура нелегальна
    // сама по себе». Обе колонны в габаритах и не пересекаются, обе выбраны — нулевая дельта обязана
    // пройти.
    const { load, layout, refs } = twoTypePair('AB');

    const r = resolveGroupDrop(load, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });
```

- [ ] **Step 2: Прогнать файл — контроль обязан быть ЗЕЛЁНЫМ**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, в том числе новый `не запрещает законной паре из двух типов остаться на месте (5iw)`.

Если контроль КРАСНЫЙ — фикстура нелегальна сама по себе (колонны пересекаются, вылезают за габариты
или `refs` не находят колонну). Чинить фикстуру, не ассерты: дальнейшие тесты на нелегальной фикстуре
доказывали бы не то.

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: 0 ошибок. Типичная ловушка: `at(4000, 0)` возвращает объект с `cargoTypeId: 'p'`, и
переопределение `cargoTypeId: 'q'` обязано идти ПОСЛЕ спреда.

- [ ] **Step 4: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): фикстура группы из двух типов груза (LKWkalk-5iw)"
```

---

### Task 2: Правила `rotation` и `forkAccess` судятся по СВОЕЙ участнице

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` — сразу после контрольного теста из задачи 1

**Interfaces:**
- Consumes: `twoTypePair(order)` из задачи 1. В `load.cargo` индекс `0` — тип `'p'`, индекс `1` —
  тип `'q'`; порядок массива `cargo` НЕ зависит от `order` (меняется только порядок `refs`).
- Produces: ничего для последующих задач.

- [ ] **Step 1: Написать четыре негативных инстанса**

```ts
  // Прицел {0, 0} в обоих негативных тестах: «остаться на месте» законно геометрически, поэтому
  // отказ может прийти ТОЛЬКО от пер-участница проверки, а не от поиска дельты.
  for (const order of ['AB', 'BA'] as const) {
    it(`refuses by the violator's own rotation rule in a two-type group — порядок ${order} (5iw)`, () => {
      const { load, layout, refs } = twoTypePair(order);
      // Вращение ужесточили ПОСЛЕ расчёта и только у типа 'q': 'none' разрешает лишь 'lwh', а
      // колонна B стоит в 'wlh'. Тип 'p' остаётся 'yawOnly', то есть законным.
      const after: Load = {
        ...load,
        cargo: [load.cargo[0], { ...load.cargo[1], rotation: 'none' as const }],
      };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
      // cargoTypeId:'q' и есть доказательство: правило взято у нарушившей участницы, а не у первой.
      // Под резолвом по unique[0] в порядке AB участница B судилась бы правилом 'p' (yawOnly),
      // прошла бы, и отказа не было бы вовсе.
      expect(r.error?.details).toMatchObject({ cargoTypeId: 'q', orientation: 'wlh' });
    });
  }

  for (const order of ['AB', 'BA'] as const) {
    it(`refuses by the violator's own fork-access rule in a two-type group — порядок ${order} (5iw)`, () => {
      const { load, layout, refs } = twoTypePair(order);
      // Двусторонние вилы заданы ТОЛЬКО у 'q'; rear+length пришпиливает 'lwh', а колонна B стоит в
      // 'wlh'. У 'p' forkAccess не задан вовсе — под резолвом по unique[0] ветка вил для B не
      // сработала бы. rotation у 'q' остаётся 'yawOnly' НАМЕРЕННО: в цикле rotation проверяется
      // раньше forkAccess, и при 'none' колонна B упала бы на вращении — тест доказывал бы не то
      // правило.
      const after: Load = {
        ...load,
        cargo: [
          load.cargo[0],
          { ...load.cargo[1], forkAccess: 'twoSides' as const, forkAxis: 'length' as const },
        ],
        loadingMode: 'rear' as const,
      };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
      expect(r.error?.details).toMatchObject({
        cargoTypeId: 'q',
        orientation: 'wlh',
        loadingMode: 'rear',
        forkAxis: 'length',
      });
    });
  }
```

- [ ] **Step 2: Прогнать файл — все четыре инстанса обязаны быть ЗЕЛЁНЫМИ**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS. Продкод уже верен, поэтому красный тест здесь означает ошибку в фикстуре или в
ожидаемом payload, а НЕ найденный баг. Разбирать через `superpowers:systematic-debugging`, а не
подгонять ассерт под фактический вывод.

- [ ] **Step 3: Проверить типы и линт**

Run: `npm run typecheck && npm run lint`
Expected: 0 ошибок в обоих.

- [ ] **Step 4: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): rotation и forkAccess судятся по правилу своей участницы (LKWkalk-5iw)"
```

---

### Task 3: Габариты участницы берутся у ЕЁ типа

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` — сразу после тестов задачи 2

**Interfaces:**
- Consumes: `twoTypePair(order)` из задачи 1.
- Produces: ничего для последующих задач.

- [ ] **Step 1: Написать геометрический тест**

```ts
  it('снапит группу к стенке по СОБСТВЕННОМУ footprint участницы, а не первой (5iw)', () => {
    // Правиловые тесты выше убивают резолв по unique[0] целиком — но только потому, что отказ
    // приходит РАНЬШЕ геометрии. Живой остаётся более узкая мутация: правила пер-ref честные, а
    // orientedDims (resolveDrop.ts:322) считается от unique[0]. Ловит её только этот тест.
    //
    // Флеш даёт колонна B: дальняя стенка отсека минус её СОБСТВЕННЫЙ footprint по длине
    // (10000 − 600 = 9400, resolveDrop.ts:387), минус её текущая координата 4000 → дельта 5400.
    // Под габаритами 'p' в 'wlh' (800 × 1200) кандидат стал бы 10000 − 800 − 4000 = 5200.
    // Прицел промахивается мимо флеша на 20 мм — это внутри толеранса группы (min(600,1000)/2 = 300
    // у B, что меньше 400 у A), поэтому «флеш бьёт промах» (resolveDrop.ts:448) и побеждает
    // кандидат от стенки, а не сам прицел.
    //
    // Порядок только AB: при BA чужие габариты достались бы законной A, дельта B осталась бы 5400 и
    // мутация выжила бы — второй инстанс не доказывал бы ничего. Асимметрия с тестами выше
    // намеренная.
    const { load, layout, refs } = twoTypePair('AB');

    const r = resolveGroupDrop(load, layout, refs, { dx: 5380, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(5400);
    expect(r.dy).toBe(0);
  });
```

- [ ] **Step 2: Прогнать файл**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS.

Если `r.dx` окажется 5380 (прицел не сдвинулся) — промах вышел за толеранс или кандидат от стенки
отфильтрован; уменьшить промах (например, прицел 5390) и пересчитать комментарий. Если `r.ok` false —
дельта выводит A или B за габариты: проверить, что A уезжает в `5400…6600`, а B в `9400…10000`, обе
внутри `[0, 10000]`. Правкой ассерта `toBe(5400)` проблему НЕ решать: именно это число и есть
предмет теста.

- [ ] **Step 3: Полный набор + типы + линт**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное; число тестов выросло на 6 относительно 1134 — но записывать надо ФАКТИЧЕСКОЕ
число из вывода раннера, а не арифметику.

- [ ] **Step 4: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): footprint участницы группы берётся у её типа (LKWkalk-5iw)"
```

---

### Task 4: Мутационная приёмка на ПОЛНОМ наборе

**Files:**
- Modify (ВРЕМЕННО, с обязательным откатом): `packages/engine/src/packing/resolveDrop.ts:288-324`
- Create: три файла-транскрипта в скрэтчпаде сессии (`m1.txt`, `m2.txt`, `m3.txt`)

**Interfaces:**
- Consumes: тесты задач 1–3.
- Produces: отчёт о приёмке — какие инстансы покраснели на каждой мутации и какие остались зелёными.

Зелёный прогон сам по себе не доказывает ничего: набор был зелёным и ДО работы. Здесь проверяется,
что новые тесты действительно ловят то, ради чего написаны.

- [ ] **Step 1: Мутация M1 — резолвить `cargo` один раз по `unique[0]`**

В `packages/engine/src/packing/resolveDrop.ts` заменить строку 294

```ts
    const cargo = byId.get(ref.cargoTypeId);
```

на

```ts
    const cargo = byId.get(unique[0].cargoTypeId); // M1 — ВРЕМЕННО
```

- [ ] **Step 2: Прогнать ПОЛНЫЙ набор и снять транскрипт**

Run: `npm test > "$SCRATCH/m1.txt" 2>&1; tail -40 "$SCRATCH/m1.txt"`
(`$SCRATCH` — каталог скрэтчпада сессии.)

Expected: КРАСНЫЕ — инстансы `порядок AB` обоих правиловых тестов и тест про footprint.
ЗЕЛЁНЫЕ — все инстансы `(s9o)`. Второе так же обязательно, как первое: именно оно доказывает, что
пробел `5iw` был реален, а не закрыт задним числом чужой фикстурой.

Пофайловый прогон (`npm test -- <файл>`) НЕ засчитывается: он не даёт права утверждать, что мутацию
не ловит чужой тест (грабли `s9o` №2). В отчёт идёт вывод раннера из файла, а не его пересказ
(грабли `s9o` №3).

- [ ] **Step 3: Откатить M1 и убедиться, что набор зелёный**

```bash
git checkout -- packages/engine/src/packing/resolveDrop.ts
npm test
```
Expected: полный набор снова зелёный.

- [ ] **Step 4: Мутация M2 — судить только последнюю участницу**

Обернуть обе проверки правил (строки 300–321) условием:

```ts
    if (ref === unique[unique.length - 1]) { // M2 — ВРЕМЕННО
      if (!allowedOrientations(cargo.rotation).includes(column.orientation)) {
        /* … тело без изменений … */
      }
      if (cargo.forkAccess === 'twoSides') {
        /* … тело без изменений … */
      }
    }
```

- [ ] **Step 5: Прогнать полный набор, снять транскрипт, откатить**

```bash
npm test > "$SCRATCH/m2.txt" 2>&1; tail -40 "$SCRATCH/m2.txt"
git checkout -- packages/engine/src/packing/resolveDrop.ts
```
Expected: КРАСНЫЕ — инстансы `порядок BA` обоих правиловых тестов `(5iw)` (и, ожидаемо, инстансы
`порядок BA` тестов `(s9o)` — они писались ровно под эту мутацию).

- [ ] **Step 6: Мутация M3 — правила пер-ref честно, габариты от `unique[0]`**

Заменить строку 322

```ts
    const [dx, dy] = orientedDims(cargo.length, cargo.width, cargo.height, column.orientation);
```

на

```ts
    const first = byId.get(unique[0].cargoTypeId)!; // M3 — ВРЕМЕННО
    const [dx, dy] = orientedDims(first.length, first.width, first.height, column.orientation);
```

- [ ] **Step 7: Прогнать полный набор, снять транскрипт, откатить**

```bash
npm test > "$SCRATCH/m3.txt" 2>&1; tail -40 "$SCRATCH/m3.txt"
git checkout -- packages/engine/src/packing/resolveDrop.ts
```
Expected: КРАСНЫЙ — тест про footprint `(5iw)`. ЗЕЛЁНЫЕ — правиловые тесты `(5iw)` и все `(s9o)`:
именно это и делает четвёртый тест не лишним.

- [ ] **Step 8: Убедиться, что продкод чист**

Run: `git status --short packages/engine/src/packing/resolveDrop.ts && git diff --stat`
Expected: `resolveDrop.ts` НЕ в списке изменённых; в диффе ветки относительно `main` — только
`resolveDrop.test.ts` и два документа (спека, план).

- [ ] **Step 9: Финальные гейты**

Run: `npm test && npm run typecheck && npm run lint`
Expected: всё зелёное. Фактическое число тестов записать из вывода.

- [ ] **Step 10: Коммит отчёта о приёмке**

Приёмка кода не меняет — коммитить нечего, кроме уже сделанного. Результат идёт в описание PR и в
комментарий закрытия `bd close LKWkalk-5iw`: таблица «мутация → что покраснело → что осталось
зелёным» со ссылкой на транскрипты.

---

## Self-Review

**Покрытие спеки:**

| Требование спеки | Задача |
|---|---|
| Фикстура `twoTypePair(order)`, типы `'p'` и `'q'` с разными габаритами | 1 |
| `unplaced: []` вместо зашитого `'p'` | 1 |
| Тест 1 — контроль ложного отказа | 1 |
| Тесты 2–3 — `rotation` и `forkAccess` × `AB`/`BA`, ассерт `cargoTypeId === 'q'` | 2 |
| `rotation` у `'q'` остаётся `yawOnly` в тесте вил | 2 |
| Тест 4 — габариты, прицел 5380 → 5400, только порядок `AB` | 3 |
| Мутации M1/M2/M3 на полном наборе, `s9o` остаётся зелёной на M1 | 4 |
| Продкод и `CHANGELOG` не меняются | Global Constraints, задача 4 шаг 8 |

**Плейсхолдеры:** нет — каждый шаг несёт готовый код или точную команду.

**Согласованность имён:** `twoTypePair`, `other`, `'p'`, `'q'`, `layoutOf`, `at`, `V`, `pallet` —
одинаковы во всех задачах; `load.cargo[0]` = `'p'`, `load.cargo[1]` = `'q'` во всех тестах.
