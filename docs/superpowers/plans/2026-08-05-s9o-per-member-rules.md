# Пер-участница правила в групповом магните (`LKWkalk-s9o`) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** доказать, что `resolveGroupDrop` судит правила `rotation` и `forkAccess` по КАЖДОЙ
участнице группы, а не по одной из них.

**Architecture:** продкод не меняется — он уже верен. Меняется только доказательство: в
`resolveDrop.test.ts` добавляется фикстура из ДВУХ колонн одного типа груза в РАЗНЫХ ориентациях и
пять экземпляров тестов поверх неё. Порядок `refs` параметризован (`AB`/`BA`), поэтому нарушителем
побывает и первая, и последняя участница. Приёмка мутационная: набор был зелёным и до работы, так
что зелёный прогон сам по себе ничего не доказывает.

**Tech Stack:** TypeScript, vitest, workspace `@shadrin-v/engine`.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-05-s9o-per-member-rules-design.md`. Расхождение с ней —
  повод сначала поправить спеку, потом код.
- **Продкод `packages/engine/src/packing/resolveDrop.ts` не изменяется ни на строку** — кроме
  временных мутаций задачи 4, которые обязаны быть откачены.
- Ни одной пользовательской строки в коде — только ключи локалей (это тесты движка, строк UI тут
  нет; правило действует всё равно).
- Записи в `CHANGELOG` не делается: ни контракта, ни поведения, ни пользовательского эффекта.
- Единицы — целые миллиметры.
- Комментарии и имена тестов: код и идентификаторы по-английски, пояснительные комментарии — как в
  соседних тестах файла (смешанные ru/en, ru для объяснения «почему»).
- Гейты запускаются из корня репозитория: `npm test`, `npm run typecheck`, `npm run lint`. У
  воркспейсов скрипта `test` НЕТ. Точечный прогон:
  `npm test -- packages/engine/src/packing/resolveDrop.test.ts`.
- Перед первым прогоном, если `dist` протух:
  `npm run build --workspace @shadrin-v/i18n && npm run build --workspace @shadrin-v/engine`.

## Файловая структура

| Файл | Что с ним | Ответственность |
|---|---|---|
| `packages/engine/src/packing/resolveDrop.test.ts` | изменяется | единственный изменяемый файл: фикстура `mixedOrientationPair` + 5 экземпляров тестов внутри `describe('resolveGroupDrop')` |
| `packages/engine/src/packing/resolveDrop.ts` | НЕ изменяется | предмет доказательства; трогается только временными мутациями задачи 4 |
| `docs/superpowers/plans/2026-08-05-s9o-per-member-rules.md` | изменяется в задаче 4 | сюда вписывается фактическое число тестов набора |

Всё новое кладётся внутрь существующего `describe('resolveGroupDrop')`
(`resolveDrop.test.ts:155`), сразу ПОСЛЕ двух тестов `v1m` (заканчиваются на `:307`) и ДО закрывающей
скобки describe (`:308`). Это продолжение той же темы, отдельный `describe` заводить не нужно.

Уже существующие в файле хелперы, которые используются как есть (объявлены на уровне модуля, видимы
изнутри describe):

- `V` (`:9`) — кузов 10000 × 2400 × 2650;
- `pallet` (`:10`) — тип груза `'p'`, 1200 × 800 × 1000, `rotation: 'yawOnly'`, без `forkAccess`;
- `at(x, y)` (`:24`) — placement типа `'p'`, `z: 0`, `tier: 1`, `state: 'entschachtelt'`,
  `orientation: 'lwh'`;
- `layoutOf(placements, unplaced)` (`:33`) — собирает `Layout` целиком, с согласованными `metrics`.

---

### Task 1: фикстура и контроль ложного отказа

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` (вставка после строки 307, перед
  закрывающей `});` на 308)

**Interfaces:**
- Consumes: `V`, `pallet`, `at`, `layoutOf` — файловые хелперы, перечислены выше; `resolveGroupDrop`,
  `StackRef`, `Load`, `Layout` — уже импортированы в файле, новых импортов НЕ требуется.
- Produces: `mixedOrientationPair(order: 'AB' | 'BA'): { load: Load; layout: Layout; refs: StackRef[] }`
  — фикстура, которой пользуются задачи 2 и 3.

- [ ] **Step 1: Написать фикстуру и контрольный тест**

Вставить в `packages/engine/src/packing/resolveDrop.test.ts` после теста
`'refuses when a member stands in an orientation the rotation rule now forbids (v1m)'`:

```ts
  // LKWkalk-s9o: rotation и forkAccess — свойства ТИПА груза, а нарушение зависит от ОРИЕНТАЦИИ
  // колонны. Пара колонн ОДНОГО типа в РАЗНЫХ ориентациях — единственная фикстура, на которой
  // мутация «проверить каждый cargoTypeId один раз» отличима от корректного кода: на двух разных
  // типах такой дедуп законен и прошёл бы незамеченным. Смесь ориентаций достижима вживую —
  // rotateStack (edit.ts:233) флипает одну колонну на месте, а правило типа меняют уже потом.
  //
  // Порядок refs параметризован: нарушителем (колонна в 'wlh') побывает и первая участница, и
  // последняя. Один только порядок [A, B] доказывал бы «судят не первую», но не «судят каждую» —
  // мутация «судить только unique.at(-1)» его пережила бы.
  const mixedOrientationPair = (
    order: 'AB' | 'BA',
  ): { load: Load; layout: Layout; refs: StackRef[] } => {
    const load: Load = { vehicle: V, cargo: [{ ...pallet, quantity: 2 }] };
    const a = at(0, 0); // 'lwh' → footprint 1200 × 800
    const b = { ...at(4000, 0), orientation: 'wlh' as const }; // footprint 800 × 1200
    const refs: StackRef[] = [
      { cargoTypeId: 'p', x: a.x, y: a.y },
      { cargoTypeId: 'p', x: b.x, y: b.y },
    ];
    return {
      load,
      layout: layoutOf([a, b], 0),
      refs: order === 'AB' ? refs : [refs[1], refs[0]],
    };
  };

  it('не запрещает законной паре в разных ориентациях остаться на месте (s9o)', () => {
    // Контроль на ложный отказ: без него тесты ниже неотличимы от «фикстура нелегальна сама по
    // себе». Обе колонны в габаритах и не пересекаются, обе выбраны — значит препятствий нет, и
    // нулевая дельта обязана пройти.
    const { load, layout, refs } = mixedOrientationPair('AB');

    const r = resolveGroupDrop(load, layout, refs, { dx: 0, dy: 0 });

    expect(r.ok).toBe(true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });
```

- [ ] **Step 2: Прогнать тест**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, включая новый тест `не запрещает законной паре в разных ориентациях остаться на месте (s9o)`.

Если контрольный тест КРАСНЫЙ — фикстура нелегальна (координаты, габариты, пересечение), и чинить
надо фикстуру, а не ожидание. Дальше по плану идти нельзя: на нелегальной фикстуре отказы задач 2–3
ничего не докажут.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок. (vitest типы не проверяет — этот шаг обязателен.)

- [ ] **Step 4: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): фикстура пары колонн в разных ориентациях (LKWkalk-s9o)"
```

---

### Task 2: правило `rotation` по каждой участнице

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` (вставка сразу после контрольного теста
  из задачи 1)

**Interfaces:**
- Consumes: `mixedOrientationPair(order)` из задачи 1.
- Produces: два экземпляра теста с именами
  `refuses when a member's orientation is forbidden by the rotation rule — порядок AB (s9o)` и
  `… — порядок BA (s9o)`.

Механика: `allowedOrientations('none')` возвращает `['lwh']`
(`packages/engine/src/model/orientation.ts:17`). Колонна A стоит в `'lwh'` — законна; колонна B в
`'wlh'` — нарушает. Отказ формируется как
`err('ERR_EDIT_ROTATION', { cargoTypeId, orientation, rotation })`
(`resolveDrop.ts:299`), а `EngineError` — это `{ code, details? }`
(`packages/engine/src/model/types.ts:142`).

- [ ] **Step 1: Написать два экземпляра теста**

```ts
  // Прицел {0, 0} во всех негативных сценариях ниже: «остаться на месте» законно геометрически,
  // поэтому отказ может прийти ТОЛЬКО от пер-участница проверки, а не от поиска дельты.
  for (const order of ['AB', 'BA'] as const) {
    it(`refuses when a member's orientation is forbidden by the rotation rule — порядок ${order} (s9o)`, () => {
      const { load, layout, refs } = mixedOrientationPair(order);
      // Правило вращения ужесточили ПОСЛЕ расчёта: rotation:'none' разрешает только 'lwh', а
      // колонна B стоит в 'wlh'.
      const after: Load = { ...load, cargo: [{ ...load.cargo[0], rotation: 'none' as const }] };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_ROTATION');
      // orientation:'wlh' есть только у колонны B — именно он доказывает, что судили её, а не
      // законную A. cargoTypeId у обеих один ('p'), поэтому он проверяет контракт ошибки, но
      // ничего не доказывает про обход.
      expect(r.error?.details).toMatchObject({ cargoTypeId: 'p', orientation: 'wlh' });
    });
  }
```

- [ ] **Step 2: Прогнать точечно**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, оба новых экземпляра зелёные.

Красный экземпляр `BA` при зелёном `AB` (или наоборот) означает, что продкод НЕ обходит всех — это
находка о продкоде, а не о тесте: остановиться и доложить, не «чинить» ожидание.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): rotation судится по каждой участнице группы (LKWkalk-s9o)"
```

---

### Task 3: правило `forkAccess` по каждой участнице

**Files:**
- Modify: `packages/engine/src/packing/resolveDrop.test.ts` (вставка сразу после цикла из задачи 2)

**Interfaces:**
- Consumes: `mixedOrientationPair(order)` из задачи 1.
- Produces: два экземпляра теста с именами
  `refuses when fork access pins a member to another orientation — порядок AB (s9o)` и
  `… — порядок BA (s9o)`.

Механика: проверка срабатывает только при `forkAccess === 'twoSides'`; `forkPinnedOrientation('rear',
'length')` даёт `'lwh'` (`packages/engine/src/model/orientation.ts:45`). A в `'lwh'` — законна, B в
`'wlh'` — нарушает. Отказ:
`err('ERR_EDIT_FORK_ACCESS', { cargoTypeId, orientation, loadingMode, forkAxis })`
(`resolveDrop.ts:310`).

- [ ] **Step 1: Написать два экземпляра теста**

```ts
  for (const order of ['AB', 'BA'] as const) {
    it(`refuses when fork access pins a member to another orientation — порядок ${order} (s9o)`, () => {
      const { load, layout, refs } = mixedOrientationPair(order);
      // Режим погрузки и ось вил задали ПОСЛЕ расчёта: rear+length пришпиливает 'lwh', а колонна B
      // стоит в 'wlh'. rotation остаётся 'yawOnly' НАМЕРЕННО: в цикле rotation проверяется раньше
      // forkAccess, и при 'none' колонна B упала бы на вращении — тест доказывал бы не то правило.
      const after: Load = {
        ...load,
        cargo: [
          { ...load.cargo[0], forkAccess: 'twoSides' as const, forkAxis: 'length' as const },
        ],
        loadingMode: 'rear' as const,
      };

      const r = resolveGroupDrop(after, layout, refs, { dx: 0, dy: 0 });

      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ERR_EDIT_FORK_ACCESS');
      expect(r.error?.details).toMatchObject({ orientation: 'wlh', loadingMode: 'rear' });
    });
  }
```

- [ ] **Step 2: Прогнать точечно**

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: PASS, оба новых экземпляра зелёные.

Если код ошибки пришёл `ERR_EDIT_ROTATION` вместо `ERR_EDIT_FORK_ACCESS` — значит `rotation` в
`after` случайно ужесточили: вернуть `'yawOnly'`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add packages/engine/src/packing/resolveDrop.test.ts
git commit -m "test(engine): forkAccess судится по каждой участнице группы (LKWkalk-s9o)"
```

---

### Task 4: мутационная приёмка и гейты

**Files:**
- Temporarily modify (и обязательно откатить): `packages/engine/src/packing/resolveDrop.ts:290-321`
- Modify: `docs/superpowers/plans/2026-08-05-s9o-per-member-rules.md` (вписать фактическое число
  тестов набора)

**Interfaces:**
- Consumes: пять экземпляров тестов из задач 1–3.
- Produces: доказательство приёмки — записанные результаты трёх мутаций.

Это и есть критерий приёмки задачи. Зелёный прогон сам по себе не доказывает ничего: набор был
зелёным и ДО работы.

- [ ] **Step 1: Мутация M1 — судить только первую участницу**

В `resolveGroupDrop` заменить обход так, чтобы правила `rotation` и `forkAccess` проверялись только
для `unique[0]`, а для остальных участниц только считался footprint. Прогнать:

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: FAIL — краснеют экземпляры `порядок AB` обоих тестов (`rotation` и `forkAccess`).
Экземпляры `порядок BA` под M1 остаются зелёными: там нарушитель и есть первая участница — это
ожидаемо, их работа — ловить M3.

**Фактический результат:** `2 failed | 34 passed (36)`. Упали ровно:
- `resolveGroupDrop > refuses when a member's orientation is forbidden by the rotation rule — порядок AB (s9o)`
- `resolveGroupDrop > refuses when fork access pins a member to another orientation — порядок AB (s9o)`

Оба `— порядок BA (s9o)` остались зелёными, как и предсказано (там нарушитель и есть
`unique[0]`). Совпадает с ожиданием.

- [ ] **Step 2: Откатить M1 и проверить зелень**

```bash
git checkout -- packages/engine/src/packing/resolveDrop.ts
npm test -- packages/engine/src/packing/resolveDrop.test.ts
```
Expected: PASS.

- [ ] **Step 3: Мутация M2 — проверять каждый `cargoTypeId` один раз**

Завести в цикле `const seenTypes = new Set<string>()` и пропускать проверки `rotation`/`forkAccess`
для типа, который уже встречался. Прогнать:

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: FAIL — краснеют экземпляры `порядок AB`.

На фикстуре из одного типа M2 поведенчески вырождается в M1 — это ожидаемо и является ДОВОДОМ за
такую фикстуру: на группе из двух разных типов дедуп по `cargoTypeId` законен, и M2 прошла бы
незамеченной. Записать результат.

**Фактический результат:** `2 failed | 34 passed (36)`. Упали ровно те же два, что под M1:
- `resolveGroupDrop > refuses when a member's orientation is forbidden by the rotation rule — порядок AB (s9o)`
- `resolveGroupDrop > refuses when fork access pins a member to another orientation — порядок AB (s9o)`

`— порядок BA (s9o)` остались зелёными. Подтверждает вырождение M2 в M1-поведение на
однотипной фикстуре, как и предсказано.

- [ ] **Step 4: Откатить M2 и проверить зелень**

```bash
git checkout -- packages/engine/src/packing/resolveDrop.ts
npm test -- packages/engine/src/packing/resolveDrop.test.ts
```
Expected: PASS.

- [ ] **Step 5: Мутация M3 — судить только последнюю участницу**

Проверять `rotation`/`forkAccess` только для `unique[unique.length - 1]`. Прогнать:

Run: `npm test -- packages/engine/src/packing/resolveDrop.test.ts`
Expected: FAIL — краснеют экземпляры `порядок BA` обоих тестов. Записать результат.

**Фактический результат:** `2 failed | 34 passed (36)`. Упали ровно:
- `resolveGroupDrop > refuses when a member's orientation is forbidden by the rotation rule — порядок BA (s9o)`
- `resolveGroupDrop > refuses when fork access pins a member to another orientation — порядок BA (s9o)`

Оба `— порядок AB (s9o)` остались зелёными, как и предсказано. Совпадает с ожиданием.

- [ ] **Step 6: Откатить M3 и убедиться, что продкод не изменён**

```bash
git checkout -- packages/engine/src/packing/resolveDrop.ts
git status --short packages/engine/src/packing/resolveDrop.ts
```
Expected: пустой вывод — продкод не изменён ни на строку.

- [ ] **Step 7: Проверить, ЧТО именно краснело**

По записям шагов 1, 3, 5: упавшие тесты обязаны быть новыми тестами `s9o` в
`resolveDrop.test.ts`. Перехват мутации в чужом файле (например, в `edit.test.ts` на фикстуре без
смешанных ориентаций) доказательством про предмет этой работы НЕ является. Если новые тесты
мутацию не поймали, а поймал чужой — приёмка не пройдена: возвращаться к фикстуре.

**Проверено:** во всех трёх мутациях (шаги 1, 3, 5) падали ИСКЛЮЧИТЕЛЬНО экземпляры новых `(s9o)`
тестов в `resolveDrop.test.ts` (по 2 из 36 в каждом прогоне), все остальные 34 теста файла (включая
`v1m` и остальные `resolveGroupDrop`/`resolveDrop`/`resolveSlide`) оставались зелёными. Ни разу
мутацию не поймал тест из другого файла.

- [ ] **Step 8: Полные гейты с корня**

```bash
npm test
npm run typecheck
npm run lint
```
Expected: тесты — всё зелено; typecheck — 0; lint — 0.

Взять из вывода `npm test` ФАКТИЧЕСКОЕ число тестов и файлов и вписать его в этот план, заменив
строку ниже. Не прикидывать арифметикой: до работы было 1129 тестов в 87 файлах, ожидается +5, но
проверяется прогоном.

> Фактический итог прогона: `1134 / 1134 тестов, 87 файлов` (`Test Files 87 passed (87)`,
> `Tests 1134 passed (1134)`). typecheck — 0 ошибок по всем 5 воркспейсам; lint — 0 ошибок
> (`eslint .` завершился без вывода).

- [ ] **Step 9: Коммит**

```bash
git add docs/superpowers/plans/2026-08-05-s9o-per-member-rules.md
git commit -m "docs(plan): фактический итог прогона и результаты мутационной приёмки (LKWkalk-s9o)"
```

---

## Осознанно вне объёма

Перечислено в спеке, повторено здесь, чтобы исполнитель не «дочинил» лишнего:

- **мутация «взять правило по `unique[0].cargoTypeId` для всех участниц»** — на группе из одного
  типа неотличима; ловится только фикстурой с ДВУМЯ типами. Решение владельца — не расширять объём;
- **мутация «поменять местами проверки `rotation` и `forkAccess`»** — нужна участница, нарушающая
  оба правила; порядок кодов ошибок нигде не специфицирован;
- **запись в `CHANGELOG`** — не делается;
- **любая правка продкода** — если по ходу найдена настоящая ошибка в `resolveGroupDrop`, это
  отдельная находка: `bd create`, а не правка в этой ветке.
