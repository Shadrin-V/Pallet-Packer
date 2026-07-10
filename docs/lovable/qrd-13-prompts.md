# qrd.13 — серия промптов для Lovable: выбор кузова + редактор заявки

> Экран(ы) прототипа UI поверх `@shadrin-v/engine@0.0.1` (контракт **0.5.0**). Движок считает
> в браузере; UI — заменяемый слой (правки логики → в ядро, правки интерфейса → здесь).
> Визуализация результата (виды сверху/сбоку) — отдельная задача **qrd.14**, здесь только
> сбор `Load`, вызов `calculateLayout` и минимальная сводка.

## Как пользоваться

Вставляй промпты в Lovable **по порядку**, по одному, дожидаясь сборки каждого. Каждый промпт
самодостаточен и опирается на результат предыдущего. Точные формы контракта и данные пресетов
уже вписаны в промпты — не давай Lovable их выдумывать.

## Договорённости (приняты как дефолты; видимое поведение)

- **Зависимость:** только `@shadrin-v/engine` (публичный npm, без `.npmrc`/секретов). Пакета
  `@shadrin-v/i18n` в Lovable нет — UI держит собственные словари `de`/`ru` (зеркалят ключи ядра,
  плюс ключи редактора). Расширение канонического словаря — бид `LKWkalk-qrd.23`.
- **i18n:** ни одной пользовательской строки в компонентах — только ключи через `t(key, locale)`.
  Локали `de` (по умолчанию) и `ru`, переключатель в шапке. Единицы/числа — через `formatLength`.
- **Единицы:** всё внутри — целые миллиметры (ADR 002); ввод и вывод в мм.
- **loadingMode:** дефолт `combined` (контракт). Селектор опционален (rear/side/combined).
- **Вес/оси, LIFO, 3D, CSV/Excel** — вне MVP, не добавлять.
- **Ошибки:** движок возвращает коды `ERR_*` в `layout.errors`; UI переводит их своим словарём.

---

## Промпт 0 — каркас приложения, i18n, зависимость от движка

```
Build a React + TypeScript single-page app called "Pallet Packer" — a UI client for a headless
packing engine. Install the npm package @shadrin-v/engine (public, no auth/.npmrc needed).

App shell:
- Header with the app title and a locale switcher with two options: "de" (default) and "ru".
- Below it, a vertical flow with three sections we will fill in next prompts: Vehicle, Cargo, Result.
- Keep all state in React (a single top-level store/context is fine); no backend.

i18n (do this now, no hardcoded user-facing strings anywhere in components):
- Create a LocaleContext holding the current locale ('de' | 'ru').
- Create a dictionary object DICT: Record<'de'|'ru', Record<string,string>> and a helper
  t(key: string, locale) => DICT[locale][key]. Also formatLength(mm: number, locale) =>
  `${new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'ru-RU').format(mm)} ${t('unit.mm', locale)}`.
- Seed DICT with exactly these keys (fill BOTH de and ru):

  app.title            de: "Pallet Packer"                 ru: "Pallet Packer"
  unit.mm              de: "mm"                             ru: "мм"
  field.name           de: "Name"                          ru: "Название"
  field.length         de: "Länge"                         ru: "Длина"
  field.width          de: "Breite"                        ru: "Ширина"
  field.height         de: "Höhe"                           ru: "Высота"
  field.quantity       de: "Menge"                          ru: "Количество"
  field.orderId        de: "Auftrags-ID"                    ru: "ID заказа"
  field.clearance      de: "Abstand"                        ru: "Зазор"
  field.fill           de: "Rest auffüllen"                 ru: "Заполнить остаток"
  vehicle.label        de: "Fahrzeug"                       ru: "Транспортное средство"
  vehicle.cargoHold    de: "Laderaum"                       ru: "Грузовой отсек"
  vehicle.preset       de: "Vorlage"                        ru: "Пресет"
  vehicle.custom       de: "Benutzerdefiniert"              ru: "Пользовательский"
  cargoType.label      de: "Ladungstyp"                     ru: "Тип груза"
  cargoType.add        de: "Ladungstyp hinzufügen"          ru: "Добавить тип груза"
  cargoType.remove     de: "Entfernen"                      ru: "Удалить"
  cargoType.rotation.label     de: "Drehung"                ru: "Вращение"
  cargoType.rotation.none      de: "Keine Drehung"          ru: "Без вращения"
  cargoType.rotation.yawOnly   de: "Nur um die Hochachse"   ru: "Только вокруг вертикальной оси"
  cargoType.rotation.full      de: "Alle Ausrichtungen"     ru: "Все ориентации"
  cargoType.stacking.label     de: "Stapeln"                ru: "Штабелирование"
  cargoType.stacking.maxTiers  de: "Max. Lagen"             ru: "Макс. ярусов"
  cargoType.nesting.label      de: "Verschachteln"          ru: "Вложение"
  cargoType.nesting.mode       de: "Verschachtelungsmodus"  ru: "Режим вложения"
  cargoType.nesting.sequential de: "Sequenziell"            ru: "Последовательный"
  cargoType.nesting.pairwise   de: "Paarweise"              ru: "Парами"
  cargoType.nesting.stepHeight de: "Höhe der oberen Bretter (Δh)" ru: "Прирост высоты (Δh)"
  cargoType.nesting.maxNested  de: "Max. Verschachtelung"   ru: "Макс. вложений"
  cargoType.nesting.allowUnpairedTop de: "Einzelne oberste Palette erlauben" ru: "Разрешить непарный верх"
  state.label          de: "Zustand"                        ru: "Состояние"
  state.verschachtelt  de: "Verschachtelt"                  ru: "Verschachtelt (вложено)"
  state.entschachtelt  de: "Entschachtelt"                  ru: "Entschachtelt (развложено)"
  loadingMode.label    de: "Belademodus"                    ru: "Режим загрузки"
  loadingMode.rear     de: "Hinten"                         ru: "Сзади"
  loadingMode.side     de: "Seitlich"                       ru: "Сбоку"
  loadingMode.combined de: "Kombiniert"                     ru: "Комбинированный"
  action.calculate     de: "Berechnen"                      ru: "Рассчитать"
  action.exportJson    de: "Als JSON exportieren"           ru: "Экспорт в JSON"
  results.totalPlaced       de: "Platziert gesamt"          ru: "Всего размещено"
  results.unplaced          de: "Nicht platziert"           ru: "Не размещено"
  results.floorFillPercent  de: "Bodenfüllung"              ru: "Заполнение пола"
  results.volumeFillPercent de: "Volumenfüllung"            ru: "Заполнение объёма"
  results.placed            de: "Platziert"                 ru: "Размещено"
  results.requested         de: "Angefordert"               ru: "Запрошено"
  ERR_INVALID_DIMENSION     de: "Ungültige Abmessung: ganze positive Zahl in mm erforderlich." ru: "Некорректный размер: целое положительное число в мм."
  ERR_CARGO_EXCEEDS_VEHICLE de: "Ladung passt in keiner erlaubten Ausrichtung in den Laderaum." ru: "Груз не помещается в кузов ни в одной ориентации."
  ERR_INVALID_QUANTITY      de: "Ungültige Menge: mindestens 0 (oder „Rest auffüllen“ nutzen)."  ru: "Некорректное количество: не меньше 0 (или «заполнить остаток»)."
  ERR_INVALID_NESTING       de: "Ungültige Verschachtelung: Δh muss zwischen 0 und der Höhe liegen." ru: "Некорректное вложение: Δh в диапазоне 0..высота."
  ERR_INVALID_ROTATION      de: "Ungültiger Drehmodus."     ru: "Некорректный режим вращения."
  ERR_EMPTY_LOAD            de: "Die Ladungsliste ist leer." ru: "Список груза пуст."
  ERR_UNKNOWN_VEHICLE       de: "Fahrzeug nicht gefunden."   ru: "Кузов не найден в справочнике."

Do not call the engine yet — just the shell, locale switcher, and i18n plumbing.
```

---

## Промпт 1 — экран выбора кузова

```
Add the Vehicle section. A Vehicle has this exact shape (integer millimetres):

  interface Vehicle { id: string; name: string; length: number; width: number; height: number; }

- Offer a preset dropdown (label t('vehicle.preset')) with one built-in preset:
    { id: 'lkw-standard', name: 'LKW Standard (13.6 m)', length: 13600, width: 2430, height: 2650 }
- Selecting a preset fills an editable form (labels via t(): field.name, field.length,
  field.width, field.height) so the user can tweak or define a custom vehicle
  (t('vehicle.custom')). All dimension inputs are integers in mm; validate >0 client-side.
- Show the chosen cargo hold summary under t('vehicle.cargoHold') using formatLength for each dim
  (e.g. "13.600 mm × 2.430 mm × 2.650 mm").
- Store the selected vehicle in the top-level state. No engine call yet.
```

---

## Промпт 2 — редактор заявки (типы груза + правила + глобальный переключатель состояния)

```
Add the Cargo section: an editable list of cargo types. Each row is a CargoType with this exact
shape (integer millimetres; all rule fields map 1:1 to the engine):

  type RotationRule = 'none' | 'yawOnly' | 'full';
  type NestingState = 'verschachtelt' | 'entschachtelt';
  type NestingMode  = 'sequential' | 'pairwise';
  interface CargoType {
    id: string; name: string;
    length: number; width: number; height: number;   // base unit, mm
    quantity: number;                                  // ignored when fill = true
    fill?: boolean;                                    // true → place as many as possible
    rotation: RotationRule;
    stacking: { stackable: boolean; maxTiers?: number };
    nesting: { nestable: boolean; stepHeight?: number; maxNested?: number;
               nestingMode?: NestingMode; allowUnpairedTop?: boolean };
    state: NestingState;
    orderId?: string;
  }

Row controls (every label via t(); no hardcoded strings):
- name, length, width, height, quantity (field.*), fill checkbox (field.fill) — when checked,
  disable quantity.
- orderId (field.orderId, optional free text — pallets sharing an orderId are packed as one zone).
- rotation: select with options none / yawOnly / full (cargoType.rotation.*).
- stacking: checkbox stackable (cargoType.stacking.label) + optional maxTiers number
  (cargoType.stacking.maxTiers) shown when stackable.
- nesting: checkbox nestable (cargoType.nesting.label). When nestable, show: nestingMode select
  (sequential/pairwise, cargoType.nesting.*), stepHeight Δh number (cargoType.nesting.stepHeight,
  must be 0..height), maxNested number (cargoType.nesting.maxNested), and — only for pairwise —
  allowUnpairedTop checkbox (cargoType.nesting.allowUnpairedTop).
- Remove-row button (cargoType.remove) and an "add cargo type" button (cargoType.add).

Quick-add preset pallets (button per preset that appends a row prefilled with these dims,
rotation 'yawOnly', stackable true, nestable false, state from the global toggle below,
quantity 1):
    EPAL 1 / EUR    1200 × 800  × 144
    EPAL 2          1200 × 1000 × 162
    EPAL 3          1000 × 1200 × 144
    EPAL 6 (halb)    800 × 600  × 144
    Viertelpalette   600 × 400  × 144

Global Verschachtelt/Entschachtelt toggle (state.label with state.verschachtelt /
state.entschachtelt): a single control at the top of the Cargo section that sets `state` on ALL
cargo rows at once (per-row override still allowed after).

Also add a Load-level "clearance" number input (field.clearance, mm, default 0) and an optional
loadingMode select (loadingMode.label; options rear/side/combined, default 'combined').

Keep everything in state; still no engine call.
```

---

## Промпт 3 — вызов `calculateLayout`, обработка ошибок, минимальная сводка

```
Wire the engine. Import from '@shadrin-v/engine':
    import { calculateLayout, getLayoutReport, ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';

On the "Berechnen" button (action.calculate), build a Load object from current state:
    const load = { vehicle, cargo: cargoTypes, clearance, loadingMode };  // loadingMode optional
Call const layout = calculateLayout(load).

Result handling (this is the Result section; full top/side visualization is a later task, keep it
to a summary here):
- If layout.errors is a non-empty array: show each error by translating its code with
  t(err.code, locale) (the seeded ERR_* keys). Do not render metrics.
- Otherwise show a summary using getLayoutReport(layout):
    - results.totalPlaced = layout.metrics.totalPlaced
    - results.floorFillPercent / results.volumeFillPercent (round to 1 decimal, add "%")
    - a per-type table from report.perType: columns results.requested / results.placed /
      results.unplaced, one row per cargoTypeId.
    - results.unplaced total if any.
- Show ENGINE_CONTRACT_VERSION somewhere small in the footer.

The engine is pure and synchronous — no async/await needed. Layout coordinates are integer mm.
```

---

## Промпт 4 — (опционально) хранение и экспорт/импорт JSON

```
Add browser persistence and JSON I/O (ADR 007), keeping it simple:
- Persist custom vehicles and cargo types to IndexedDB (a small wrapper or idb-keyval is fine);
  built-in presets stay in code.
- "Als JSON exportieren" (action.exportJson): download the current raw `layout` (from the last
  calculateLayout) as a .json file.
- Add library export/import: one JSON file containing all custom vehicles + cargo types, with a
  version field, for backup/transfer. Import merges by id.
Do not add CSV/Excel import (out of MVP).
```

---

## Definition of Done для qrd.13

- Можно собрать `Load` (кузов + типы + правила + состояние + clearance) и получить `Layout`
  из `calculateLayout`; ошибки показываются переводом кодов `ERR_*`.
- Глобальный переключатель Verschachtelt/Entschachtelt работает на все типы.
- Ни одной хардкод-строки в компонентах — всё через `t()`; локали de/ru.
- Промпт 4 (хранение/экспорт) — по желанию; ядро задачи закрывают промпты 0–3.

> Виды сверху/сбоку и экспорт PDF/PNG — задача **qrd.14** (следующая серия промптов).
