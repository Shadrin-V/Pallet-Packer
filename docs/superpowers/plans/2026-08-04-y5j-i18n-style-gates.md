# Гейты против жёстких строк и off-scale стилей — план реализации

> ⚠️ **ИСПОЛНЕН (2026-08-05), и код ушёл дальше плана.** Актуальное описание гейтов —
> [спека](../specs/2026-08-04-y5j-i18n-style-gates-design.md), она сверена с кодом.
> Ниже по тексту: ожидаемые счётчики тестов (1064…1079) верны только постадийно, **итог 1086**;
> `TEXT_PROPS` в коде Task 1 не содержит `text` (добавлен финальной волной ревью — это тело
> подсказки `InfoHint`, самый переводоёмкий проп репозитория), а правило теперь ловит и
> строку-ребёнка в фигурных скобках (`{'Details'}`), которой в плане нет вовсе.
> **Не копируй код правил отсюда — бери из `tools/eslint/`.** Всё остальное (порядок задач,
> обоснования, доказательства из собранного CSS) — по-прежнему верно.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать так, чтобы новую жёсткую пользовательскую строку и новый off-scale размер шрифта в `apps/web` нельзя было закоммитить незаметно — их ловит CI, а не глаза ревьюера.

**Architecture:** Локальный eslint-плагин в `tools/eslint/` с двумя правилами (`no-untranslated-text` — по AST, `no-off-scale-typography` — по тексту классов) плюс vitest-тест соответствия палитры. Плагин подключается в существующий плоский `eslint.config.js`; `npm run lint` уже обязательный шаг CI (`.github/workflows/ci.yml:30`), поэтому новых шагов в воркфлоу не появляется.

**Tech Stack:** ESLint 9 (flat config, ESM), штатный `RuleTester` из пакета `eslint`, vitest, Tailwind 3.4. **Новых зависимостей не добавляется.**

Спека: [`../specs/2026-08-04-y5j-i18n-style-gates-design.md`](../specs/2026-08-04-y5j-i18n-style-gates-design.md). bd: `LKWkalk-y5j`.

## Global Constraints

- **Ни одной пользовательской строки в коде** — только ключи локалей (CLAUDE.md, архитектурный принцип 3). Это же правило и автоматизируется.
- **TODO в markdown и в комментариях кода запрещены** — обнаружившаяся работа идёт в `bd create`.
- **Новых npm-зависимостей не добавлять.** Всё строится на уже установленных `eslint@^9.17.0` и `vitest`.
- **`npm run typecheck` обязателен наравне с тестами** — vitest типы не проверяет (грабли сессии `p3p`).
- **Гейты запускаются с корня:** `npm test` (базовая линия на старте — 1047 тестов), `npm run lint`, `npm run typecheck`. Не workspace-scoped.
- **Доказанный RED.** Тест, который проходит сразу после написания, не считается написанным: нужно предъявить его падение на коде «до». Для тестов-сторожей (Task 5) это делается временной порчей проверяемого значения с последующим откатом — шаги прописаны явно.
- Коммиты маленькие и атомарные, после зелёных гейтов. Сообщения по-английски, тело — можно по-русски, как в репозитории.
- Мерж в `main` = выкладка на прод (ADR 023).

## File Structure

| Файл | Ответственность |
|---|---|
| `tools/eslint/no-untranslated-text.js` (создать) | правило: жёсткая пользовательская строка в JSX |
| `tools/eslint/no-untranslated-text.test.js` (создать) | его тесты через `RuleTester` |
| `tools/eslint/no-off-scale-typography.js` (создать) | правило: произвольное значение типографской оси |
| `tools/eslint/no-off-scale-typography.test.js` (создать) | его тесты |
| `tools/eslint/index.js` (создать) | объект плагина: собирает оба правила под одним именем |
| `eslint.config.js` (изменить) | подключение плагина к `apps/web/src` |
| `vitest.config.ts` (изменить) | глоб, чтобы тесты правил вообще запускались |
| `apps/web/src/series-palette.test.ts` (создать) | сторож: `SERIES_HEX` = `--s1..--s8` из `theme.css` |
| `packages/i18n/src/keys.ts`, `dictionaries/{de,ru}.ts` (изменить) | ключ `a11y.localeSwitch` |
| `apps/web/src/ui/{LocaleSwitch,primitives}.tsx`, `screens/components/CrossSection.tsx` (изменить) | пять правок, которые находят новые гейты |
| `apps/web/tailwind.config.js`, `docs/design/design-system.md` (изменить) | ступень `unit: 10.5px` |

---

### Task 1: Правило `no-untranslated-text` и каркас плагина

Правило пишется и покрывается тестами **до** подключения к репозиторию — так его поведение проверяется на заведомых примерах, а не на случайном коде. Подключение — следующая задача.

**Files:**
- Create: `tools/eslint/no-untranslated-text.js`
- Create: `tools/eslint/no-untranslated-text.test.js`
- Create: `tools/eslint/index.js`
- Modify: `vitest.config.ts:5`

**Interfaces:**
- Consumes: ничего.
- Produces: именованный экспорт `noUntranslatedText` (объект правила ESLint) из `tools/eslint/no-untranslated-text.js`; дефолтный экспорт объекта плагина `{ meta: { name: 'lkwkalk-local' }, rules: { 'no-untranslated-text': … } }` из `tools/eslint/index.js`. Task 3 добавит в тот же объект `'no-off-scale-typography'`.

- [ ] **Шаг 1: Разрешить vitest видеть тесты правил**

Сейчас `include` перечисляет только `packages/*/src`, `apps/*/src` и `tests/` — файл в `tools/` не запустится никогда, и тест «пройдёт» молчанием.

`vitest.config.ts`, строка 5 — добавить последним элементом `'tools/eslint/**/*.test.js'`:

```ts
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
      // Тесты локальных eslint-правил лежат рядом с правилами (LKWkalk-y5j).
      'tools/eslint/**/*.test.js',
    ],
```

- [ ] **Шаг 2: Написать падающий тест**

Создать `tools/eslint/no-untranslated-text.test.js`:

```js
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { noUntranslatedText } from './no-untranslated-text.js';

// RuleTester зовёт describe/it как глобальные; в этом репозитории у vitest globals выключены,
// поэтому отдаём ему импортированные.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run('no-untranslated-text', noUntranslatedText, {
  valid: [
    // Литерал без букв и цифр переводу не подлежит.
    { code: 'const a = <b>×</b>;' },
    { code: 'const a = <Measure unit="×" />;' },
    { code: 'const a = <b>{tt("setup.orders")}</b>;' },
    { code: 'const a = <B ariaLabel={tt("action.print")} />;' },
    // Куски шаблонной строки без букв и цифр — разделители, а не текст.
    { code: 'const a = <B ariaLabel={`${address}: ${text} — ${goTo}`} />;' },
    // Вся SVG-математика правила не касается.
    { code: 'const a = <path d="M0 0 L1 1" fill="var(--ink)" transform="translate(2 3)" />;' },
    // Глиф-иконка: скринридеру не нужен, имя даёт aria-label.
    { code: 'const a = <button aria-label={tt("k")}><span aria-hidden="true">i</span></button>;' },
    { code: 'const a = <span aria-hidden>i</span>;' },
    // Ключ локали — не пользовательский текст.
    { code: 'const a = <b>{t("app.title", locale)}</b>;' },
  ],
  invalid: [
    {
      code: 'const a = <b>Details</b>;',
      errors: [{ messageId: 'hardcoded', data: { text: 'Details' } }],
    },
    {
      code: 'const a = <B ariaLabel="Details" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      code: 'const a = <b aria-label="details" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      code: 'const a = <input placeholder="Suchen" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    {
      code: 'const a = <img alt="Palette" />;',
      errors: [{ messageId: 'hardcoded' }],
    },
    // Зашитая единица внутри шаблонной строки — вторая половина бага 5gi.
    {
      code: 'const a = <B ariaLabel={`${n} mm`} />;',
      errors: [{ messageId: 'hardcoded', data: { text: 'mm' } }],
    },
    // aria-hidden={false} не прячет ничего.
    {
      code: 'const a = <b aria-hidden={false}>Details</b>;',
      errors: [{ messageId: 'hardcoded' }],
    },
    // Текст рядом с выражением — тоже текст.
    {
      code: 'const a = <b>Stück: {n}</b>;',
      errors: [{ messageId: 'hardcoded' }],
    },
  ],
});
```

- [ ] **Шаг 3: Прогнать и убедиться, что падает**

Run: `npx vitest run tools/eslint/no-untranslated-text.test.js`
Expected: FAIL — `Failed to resolve import "./no-untranslated-text.js"` (модуля ещё нет).

- [ ] **Шаг 4: Написать правило**

Создать `tools/eslint/no-untranslated-text.js`:

```js
// Жёсткая пользовательская строка в разметке (LKWkalk-y5j, спека
// docs/superpowers/specs/2026-08-04-y5j-i18n-style-gates-design.md).
//
// Принцип вместо списка глифов: литерал БЕЗ букв и цифр переводу не подлежит (×, ·, —, :, %),
// всё остальное идёт через tt(...)/fillTemplate(...). Поэтому зашитое ' mm' ловится само.
//
// Граница, выбранная сознательно: строка, собранная в TS и переданная переменной
// (const label = 'Details'; <X ariaLabel={label} />), правилу не видна. Анализ потока данных дал бы
// ложных срабатываний на порядок больше, чем ловит.

const HAS_WORD = /[\p{L}\p{N}]/u;

/** Атрибуты и пропсы, принимающие пользовательский текст. Прочие (d, fill, transform…) — не текст. */
const TEXT_PROPS = new Set([
  'aria-label',
  'ariaLabel',
  'title',
  'placeholder',
  'alt',
  'label',
  'unit',
]);

/** Спрятан ли узел от скринридера: глиф-иконка внутри aria-hidden текстом не является. */
function insideAriaHidden(sourceCode, node) {
  for (const ancestor of sourceCode.getAncestors(node)) {
    if (ancestor.type !== 'JSXElement') continue;
    for (const attr of ancestor.openingElement.attributes) {
      if (attr.type !== 'JSXAttribute' || attr.name.name !== 'aria-hidden') continue;
      const value = attr.value;
      if (value === null) return true; // <span aria-hidden>
      if (value.type === 'Literal' && value.value !== 'false' && value.value !== false) return true;
      if (
        value.type === 'JSXExpressionContainer' &&
        value.expression.type === 'Literal' &&
        value.expression.value === true
      ) {
        return true;
      }
    }
  }
  return false;
}

export const noUntranslatedText = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Пользовательский текст только через ключи локали (CLAUDE.md, архитектурный принцип 3).',
    },
    schema: [],
    messages: {
      hardcoded:
        'Жёсткая строка «{{text}}» в разметке. Пользовательский текст идёт через tt(…)/fillTemplate(…); глиф-иконку прячут в aria-hidden.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const report = (node, raw) => {
      const text = String(raw).trim();
      if (!HAS_WORD.test(text)) return;
      context.report({ node, messageId: 'hardcoded', data: { text } });
    };

    return {
      JSXText(node) {
        if (insideAriaHidden(sourceCode, node)) return;
        report(node, node.value);
      },
      JSXAttribute(node) {
        if (!TEXT_PROPS.has(node.name.name)) return;
        const value = node.value;
        if (!value) return;
        if (value.type === 'Literal') {
          report(value, value.value);
          return;
        }
        if (value.type !== 'JSXExpressionContainer') return;
        const expression = value.expression;
        if (expression.type === 'Literal') {
          report(expression, expression.value);
          return;
        }
        if (expression.type === 'TemplateLiteral') {
          // Проверяется каждый кусок: переменные уже переведены, а вот текст между ними — нет.
          for (const quasi of expression.quasis) {
            report(quasi, quasi.value.cooked ?? quasi.value.raw);
          }
        }
      },
    };
  },
};
```

- [ ] **Шаг 5: Прогнать и убедиться, что проходит**

Run: `npx vitest run tools/eslint/no-untranslated-text.test.js`
Expected: PASS, 17 кейсов — 9 valid + 8 invalid, `RuleTester` заводит по одному `it` на кейс.

- [ ] **Шаг 6: Собрать объект плагина**

Создать `tools/eslint/index.js`:

```js
// Локальные правила репозитория (LKWkalk-y5j). Подключается в eslint.config.js как плагин `local`.
import { noUntranslatedText } from './no-untranslated-text.js';

export default {
  meta: { name: 'lkwkalk-local' },
  rules: {
    'no-untranslated-text': noUntranslatedText,
  },
};
```

- [ ] **Шаг 7: Убедиться, что сам плагин проходит гейты**

Run: `npm run lint && npm test`
Expected: обе команды зелёные; в `npm test` тестов стало 1047 → 1064 (17 новых кейсов).

- [ ] **Шаг 8: Коммит**

```bash
git add tools/eslint vitest.config.ts
git commit -m "feat(lint): rule no-untranslated-text (LKWkalk-y5j)"
```

---

### Task 2: Подключить правило и починить то, что оно находит

**Files:**
- Modify: `eslint.config.js`
- Modify: `packages/i18n/src/keys.ts`
- Modify: `packages/i18n/src/dictionaries/de.ts`
- Modify: `packages/i18n/src/dictionaries/ru.ts`
- Modify: `apps/web/src/ui/LocaleSwitch.tsx:10`
- Modify: `apps/web/src/ui/primitives.tsx:27` (правило укажет на строку 26)

**Interfaces:**
- Consumes: дефолтный экспорт плагина из `tools/eslint/index.js` (Task 1).
- Produces: ключ локали `'a11y.localeSwitch'` в `TRANSLATION_KEYS`.

- [ ] **Шаг 1: Подключить правило**

`eslint.config.js` — добавить импорт первой строкой блока импортов и новый блок конфигурации последним элементом `tseslint.config(...)`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import local from './tools/eslint/index.js';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.beads/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Гейты интерфейса (LKWkalk-y5j). Тесты исключены: фикстуры законно держат литералы.
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/**/*.test.tsx'],
    plugins: { local },
    rules: {
      'local/no-untranslated-text': 'error',
    },
  },
);
```

- [ ] **Шаг 2: Прогнать lint и предъявить RED**

Run: `npm run lint`
Expected: FAIL, **ровно две** ошибки `local/no-untranslated-text` (проверено прогоном черновика правила по всему `apps/web/src` — ложных срабатываний на SVG-коде нет):
- `apps/web/src/ui/LocaleSwitch.tsx:10` — `Sprache / Язык`;
- `apps/web/src/ui/primitives.tsx:26` — `i` (правило указывает на строку 26: текстовый узел начинается сразу за `>`, сам глиф набран на строке 27).

Если ошибок больше или они в других местах — остановиться и разобраться: правило либо шумит, либо в коде появилось что-то новое. Не «чинить» массово, не добавляя это в план.

- [ ] **Шаг 3: Завести ключ локали**

`packages/i18n/src/keys.ts` — сразу после `'app.subtitle',` (строка 8) добавить:

```ts
  // Доступные имена контролов (не видимый текст)
  'a11y.localeSwitch',
```

`packages/i18n/src/dictionaries/de.ts` — после строки `'app.subtitle': 'LKW-Beladung planen',`:

```ts
  // Двуязычно намеренно: носитель другого языка должен найти переключатель, не читая текущую
  // локаль. Значение одинаково в de и ru — это не забытый перевод (LKWkalk-y5j, решение 7).
  'a11y.localeSwitch': 'Sprache / Язык',
```

`packages/i18n/src/dictionaries/ru.ts` — на том же месте, с тем же значением:

```ts
  // Двуязычно намеренно, значение совпадает с de — см. комментарий там же.
  'a11y.localeSwitch': 'Sprache / Язык',
```

- [ ] **Шаг 4: Проверить, что словари полны**

Run: `npx vitest run packages/i18n`
Expected: PASS — `completeness.test.ts` подтверждает, что новый ключ есть в обеих локалях. Если падает — ключ добавлен не во все словари.

- [ ] **Шаг 5: Починить оба места**

`apps/web/src/ui/LocaleSwitch.tsx` целиком:

```tsx
import { SUPPORTED_LOCALES, type Locale } from '@shadrin-v/i18n';
import { useLocale } from '../i18n/LocaleContext';
import { Segmented } from './primitives';

/** DE | RU language switch (design-system §5 segmented). Persists via LocaleProvider. */
export function LocaleSwitch() {
  const { locale, setLocale, tt } = useLocale();
  return (
    <Segmented<Locale>
      ariaLabel={tt('a11y.localeSwitch')}
      value={locale}
      onChange={setLocale}
      options={SUPPORTED_LOCALES.map((l) => ({ value: l, label: l.toUpperCase() }))}
    />
  );
}
```

`apps/web/src/ui/primitives.tsx:27` — глиф прячется от скринридера (доступное имя кнопке даёт `aria-label` на строке 21):

```tsx
        <span aria-hidden="true">i</span>
```

- [ ] **Шаг 6: Прогнать все гейты**

Run: `npm run lint && npm run typecheck && npm test`
Expected: всё зелёное. Тестов столько же, сколько после Task 1 (1064).

Если падает компонентный тест, искавший кнопку по тексту `i` — это законное следствие: доступное имя кнопки не менялось (`aria-label`), а вот текстовое содержимое ушло под `aria-hidden`. Такой тест переписывается на `getByRole('button', { name: … })`, а не «чинится» откатом `aria-hidden`.

- [ ] **Шаг 7: Коммит**

```bash
git add eslint.config.js packages/i18n apps/web/src/ui
git commit -m "feat(lint): enable no-untranslated-text on apps/web, fix both hits (LKWkalk-y5j)"
```

---

### Task 3: Правило `no-off-scale-typography`

**Files:**
- Create: `tools/eslint/no-off-scale-typography.js`
- Create: `tools/eslint/no-off-scale-typography.test.js`
- Modify: `tools/eslint/index.js`

**Interfaces:**
- Consumes: объект плагина из `tools/eslint/index.js` (Task 1).
- Produces: именованный экспорт `noOffScaleTypography`; ключ `'no-off-scale-typography'` в `rules` плагина.

- [ ] **Шаг 1: Написать падающий тест**

Создать `tools/eslint/no-off-scale-typography.test.js`:

```js
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { noOffScaleTypography } from './no-off-scale-typography.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run('no-off-scale-typography', noOffScaleTypography, {
  valid: [
    // Именованные ступени шкалы — единственный разрешённый способ.
    { code: 'const a = <b className="text-label uppercase tracking-wide" />;' },
    { code: 'const a = <b className="text-caption leading-tight" />;' },
    // Веса шкалой §3 санкционированы.
    { code: 'const a = <h1 className="text-title font-[650]" />;' },
    { code: 'const a = <b className="text-title font-[700] tabular-nums" />;' },
    // Произвольный ЦВЕТ — не размер, шкала §3 его не описывает.
    { code: "const v = { danger: 'bg-danger text-[color:var(--danger-ink)]' };" },
    // Не типографские оси правило не трогает.
    { code: 'const a = <b className="w-[37px] top-[3px]" />;' },
  ],
  invalid: [
    {
      code: 'const a = <b className="text-[10px]" />;',
      errors: [{ messageId: 'offScale', data: { cls: 'text-[10px]' } }],
    },
    {
      code: 'const a = <b className="px-2 text-[10.5px] text-faint" />;',
      errors: [{ messageId: 'offScale', data: { cls: 'text-[10.5px]' } }],
    },
    {
      code: 'const a = <b className="leading-[1.35]" />;',
      errors: [{ messageId: 'offScale' }],
    },
    {
      code: 'const a = <b className="tracking-[0.2em]" />;',
      errors: [{ messageId: 'offScale' }],
    },
    // В шаблонной строке класса — тоже ошибка.
    {
      code: 'const a = <b className={`px-1 ${x} text-[13px]`} />;',
      errors: [{ messageId: 'offScale' }],
    },
    // И в отдельно лежащей карте вариантов, а не только в атрибуте.
    {
      code: "const variants = { small: 'text-[9px] font-medium' };",
      errors: [{ messageId: 'offScale' }],
    },
    {
      code: 'const a = <b className="text-[10px] leading-[1.1]" />;',
      errors: [{ messageId: 'offScale' }, { messageId: 'offScale' }],
    },
  ],
});
```

- [ ] **Шаг 2: Прогнать и убедиться, что падает**

Run: `npx vitest run tools/eslint/no-off-scale-typography.test.js`
Expected: FAIL — `Failed to resolve import "./no-off-scale-typography.js"`.

- [ ] **Шаг 3: Написать правило**

Создать `tools/eslint/no-off-scale-typography.js`:

```js
// Произвольное значение типографской оси вместо ступени шкалы (LKWkalk-y5j).
//
// Конфиг Tailwind правило НЕ читает — незачем: оно запрещает произвольные значения как класс,
// а любая именованная ступень по определению уже описана в tailwind.config.js. Поэтому правило
// не может разъехаться с конфигом (в отличие от theme-alpha.test.ts, который стережёт ИМЕНА
// токенов и потому обязан читать конфиг).
//
// Проверяются все строковые литералы, а не только className: классы живут и в картах вариантов
// (apps/web/src/ui/primitives.tsx). Ложные срабатывания исключены формой самого шаблона.

const ARBITRARY = /\b(text|leading|tracking)-\[([^\]]+)\]/g;

/** Классы вида text-[…]/leading-[…]/tracking-[…], кроме произвольного ЦВЕТА. */
function offScaleClasses(raw) {
  const found = [];
  for (const match of String(raw).matchAll(ARBITRARY)) {
    const [cls, axis, value] = match;
    if (axis === 'text' && value.startsWith('color:')) continue;
    found.push(cls);
  }
  return found;
}

export const noOffScaleTypography = {
  meta: {
    type: 'problem',
    docs: { description: 'Типографика — только ступенями шкалы (docs/design/design-system.md §3).' },
    schema: [],
    messages: {
      offScale:
        'Произвольное значение «{{cls}}» вне шкалы. Размер, интерлиньяж и трекинг задаются ступенями из tailwind.config.js (design-system.md §3); нужен новый размер — добавь ступень туда и строку в §3.',
    },
  },
  create(context) {
    const report = (node, raw) => {
      for (const cls of offScaleClasses(raw)) {
        context.report({ node, messageId: 'offScale', data: { cls } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
```

- [ ] **Шаг 4: Прогнать и убедиться, что проходит**

Run: `npx vitest run tools/eslint/no-off-scale-typography.test.js`
Expected: PASS, 13 кейсов.

- [ ] **Шаг 5: Добавить правило в плагин**

`tools/eslint/index.js` целиком:

```js
// Локальные правила репозитория (LKWkalk-y5j). Подключается в eslint.config.js как плагин `local`.
import { noUntranslatedText } from './no-untranslated-text.js';
import { noOffScaleTypography } from './no-off-scale-typography.js';

export default {
  meta: { name: 'lkwkalk-local' },
  rules: {
    'no-untranslated-text': noUntranslatedText,
    'no-off-scale-typography': noOffScaleTypography,
  },
};
```

- [ ] **Шаг 6: Прогнать гейты**

Run: `npm run lint && npm test`
Expected: зелено; тестов 1064 → 1077. Правило пока никуда не подключено, поэтому `lint` не должен измениться.

- [ ] **Шаг 7: Коммит**

```bash
git add tools/eslint
git commit -m "feat(lint): rule no-off-scale-typography (LKWkalk-y5j)"
```

---

### Task 4: Подключить off-scale, добавить ступень `unit`, привести три места к шкале

**Files:**
- Modify: `eslint.config.js`
- Modify: `apps/web/tailwind.config.js:46`
- Modify: `apps/web/src/ui/primitives.tsx:25,81`
- Modify: `apps/web/src/screens/components/CrossSection.tsx:847`
- Modify: `docs/design/design-system.md:90`

**Interfaces:**
- Consumes: правило `local/no-off-scale-typography` (Task 3).
- Produces: ступень `unit` шкалы `fontSize` — класс `text-unit`.

- [ ] **Шаг 1: Подключить правило**

`eslint.config.js`, блок из Task 2 — расширить `files` до `.ts` тоже (классы живут и в хелперах) и добавить вторую строку в `rules`:

```js
  {
    // Гейты интерфейса (LKWkalk-y5j). Тесты исключены: фикстуры законно держат литералы.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/**/*.test.{ts,tsx}'],
    plugins: { local },
    rules: {
      'local/no-untranslated-text': 'error',
      'local/no-off-scale-typography': 'error',
    },
  },
```

- [ ] **Шаг 2: Прогнать lint и предъявить RED**

Run: `npm run lint`
Expected: FAIL, **ровно три** ошибки `local/no-off-scale-typography` (проверено прогоном черновика правила по всему `apps/web/src`):
- `apps/web/src/ui/primitives.tsx:25` — `text-[10px]`;
- `apps/web/src/ui/primitives.tsx:81` — `text-[10.5px]`;
- `apps/web/src/screens/components/CrossSection.tsx:847` — `text-[10px]`.

Больше или в других местах — остановиться и разобраться, а не чинить пачкой.

- [ ] **Шаг 3: Добавить ступень в шкалу**

`apps/web/tailwind.config.js` — в `theme.extend.fontSize`, после строки `caption`:

```js
        caption: ['11.5px', { lineHeight: '1.4' }],
        // Суффикс единицы у числового поля: на полпикселя мельче caption и БЕЗ трекинга —
        // «mm» рядом с 13px-значением не должно разряжаться (LKWkalk-y5j, решение 5).
        unit: ['10.5px', { lineHeight: '1.4' }],
```

- [ ] **Шаг 4: Описать ступень в дизайн-системе**

`docs/design/design-system.md`, таблица §3 — строкой после «Микро / caption»:

```markdown
| Суффикс единицы у поля | 10.5px / 400 / `--faint` / без трекинга | `text-unit` |
```

- [ ] **Шаг 5: Привести три места к шкале**

`apps/web/src/ui/primitives.tsx:25` — `text-[10px]` → `text-label tracking-normal`. Ступень `text-label` несёт `letter-spacing: 0.13em`, для одиночного глифа он не нужен; `tracking-normal` его гасит, потому что Tailwind выпускает `letterSpacing` после `fontSize`:

```tsx
        className="grid h-4 w-4 place-items-center rounded-full border border-line-strong text-label font-semibold leading-none tracking-normal text-muted hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
```

`apps/web/src/ui/primitives.tsx:81` — на новую ступень:

```tsx
      <span className="select-none px-2 pl-0.5 text-unit text-faint">{unit}</span>
```

`apps/web/src/screens/components/CrossSection.tsx:847` — `text-[10px]` → `text-label`; стоящий там же `tracking-wide` перебивает трекинг ступени по тому же правилу порядка, поэтому вид не меняется:

```tsx
        <div className="mt-0.5 flex justify-between px-0.5 text-label uppercase tracking-wide text-faint">
```

- [ ] **Шаг 6: Прогнать все гейты**

Run: `npm run lint && npm run typecheck && npm test`
Expected: всё зелёное, тестов 1077.

- [ ] **Шаг 7: Проверить, что вид не изменился**

Run: `npm run build --workspace @shadrin-v/i18n && npm run build --workspace @shadrin-v/engine && npm run dev:web`

(`dist` пакетов протухает и локальный прогон показывает старые переводы — это грабли из `p3p`.)

Открыть страницу и глазами сверить два места: кружок-подсказка `i` в панели правил (размер и центровка глифа) и суффикс единицы у полей габаритов («mm» не разрядился, не съехал по базовой линии). Если что-то поехало — причина в трекинге; чинить классом `tracking-*`, а не возвратом произвольного размера.

- [ ] **Шаг 8: Коммит**

```bash
git add eslint.config.js apps/web/tailwind.config.js apps/web/src docs/design/design-system.md
git commit -m "feat(lint): enable no-off-scale-typography, add unit scale step (LKWkalk-y5j)"
```

---

### Task 5: Сторож зеркала палитры

`SERIES_HEX` в `apps/web/src/lib/orderColor.ts` — осознанная копия `--s1..--s8` из `theme.css` с комментарием «keep in sync». Комментарий не проверяется ничем; палитр в `theme.css` две (ADR 025), и разъехаться может любая.

**Files:**
- Create: `apps/web/src/series-palette.test.ts`

**Interfaces:**
- Consumes: `SERIES_HEX` (readonly-кортеж из 8 строк) из `apps/web/src/lib/orderColor.ts`.
- Produces: ничего.

- [ ] **Шаг 1: Написать тест**

Создать `apps/web/src/series-palette.test.ts`:

```ts
// Сторож зеркала палитры (LKWkalk-y5j). SERIES_HEX в lib/orderColor.ts — копия --s1..--s8 из
// theme.css «на всякий случай, когда var() не резолвится». Комментарий «keep in sync» ничем не
// проверялся, а палитр в theme.css две (ADR 025) — разъехаться может любая из них.
//
// Корень запуска — корень монорепо (vitest.config.ts лежит там же), как и в theme-alpha.test.ts:
// `import.meta.url` не годится, под jsdom он не файловая схема.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SERIES_HEX } from './lib/orderColor';

const THEME_CSS = join(process.cwd(), 'apps/web/src/theme.css');

/** Значения --s1..--s8 по палитрам: одна строка результата = одна палитра в порядке объявления. */
function palettes(css: string): string[][] {
  const byToken = SERIES_HEX.map((_, i) =>
    Array.from(css.matchAll(new RegExp(`--s${i + 1}:\\s*(#[0-9a-fA-F]{6})`, 'g')), (m) =>
      m[1].toLowerCase(),
    ),
  );
  const count = byToken[0].length;
  return Array.from({ length: count }, (_, palette) => byToken.map((values) => values[palette]));
}

describe('палитра заказов', () => {
  it('SERIES_HEX — точное зеркало --s1..--s8, и все палитры theme.css согласны между собой', () => {
    const declared = palettes(readFileSync(THEME_CSS, 'utf8'));
    expect(declared.length).toBeGreaterThanOrEqual(2); // две палитры бренда, ADR 025
    const expected = SERIES_HEX.map((hex) => hex.toLowerCase());
    for (const palette of declared) expect(palette).toEqual(expected);
  });
});
```

- [ ] **Шаг 2: Прогнать — тест ПРОХОДИТ, и это ещё не результат**

Run: `npx vitest run apps/web/src/series-palette.test.ts`
Expected: PASS — сейчас значения действительно совпадают.

Проходящий с первого раза сторож ничего не доказывает: ровно так же он проходил бы, если бы регулярное выражение не находило ничего и сравнивались два пустых списка. Нужен доказанный RED — следующий шаг.

- [ ] **Шаг 3: Доказать RED порчей значения**

Временно изменить в `apps/web/src/lib/orderColor.ts` первый элемент `SERIES_HEX` с `'#2e7d32'` на `'#2e7d33'`.

Run: `npx vitest run apps/web/src/series-palette.test.ts`
Expected: FAIL, и в диффе видно `-#2e7d33 +#2e7d32` — значит тест реально читает `theme.css`, а не сравнивает пустоту.

Затем **вернуть** `'#2e7d32'` и прогнать снова:

Run: `npx vitest run apps/web/src/series-palette.test.ts`
Expected: PASS.

- [ ] **Шаг 4: Доказать, что стережёт обе палитры**

Временно изменить в `apps/web/src/theme.css` **вторую** копию `--s1` (строка 115) на `#2e7d33`.

Run: `npx vitest run apps/web/src/series-palette.test.ts`
Expected: FAIL — иначе тест смотрит только на первое вхождение и вторая палитра не защищена.

Вернуть `#2e7d32`, прогнать снова: PASS.

- [ ] **Шаг 5: Заменить комментарий-обещание на ссылку на сторожа**

`apps/web/src/lib/orderColor.ts:13-14` — в docstring поля `hex` фраза «Keep in sync with theme.css» становится неправдой наполовину (синхронность теперь проверяется):

```ts
  /** Concrete hex mirror of the series colour (theme.css --s1..--s8), for the rare context where a
   *  CSS var() paint does not resolve. Prefer `colorVar` everywhere else. Synchronisation with
   *  theme.css is enforced by apps/web/src/series-palette.test.ts. */
```

- [ ] **Шаг 6: Прогнать все гейты**

Run: `npm run lint && npm run typecheck && npm test`
Expected: зелено, тестов 1077 → 1078.

- [ ] **Шаг 7: Коммит**

```bash
git add apps/web/src/series-palette.test.ts apps/web/src/lib/orderColor.ts
git commit -m "test(theme): guard SERIES_HEX against theme.css drift (LKWkalk-y5j)"
```

---

### Task 6: Журнал изменений и закрытие задачи

**Files:**
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: результаты Tasks 1–5.
- Produces: ничего.

- [ ] **Шаг 1: Записать в журнал**

`docs/CHANGELOG.md`, в `## [Unreleased]` — новым разделом **выше** записи от 2026-08-04 про отсеки:

```markdown
### 2026-08-04 — Гейты интерфейса: жёсткие строки и off-scale типографика (`LKWkalk-y5j`)

Локальный eslint-плагин `tools/eslint` с двумя правилами: `no-untranslated-text` (пользовательский
текст только через ключи локали; допустим литерал без букв и цифр, глиф-иконка прячется в
`aria-hidden`) и `no-off-scale-typography` (размер, интерлиньяж и трекинг — только ступенями шкалы
§3). Плюс сторож `series-palette.test.ts`: `SERIES_HEX` больше не может молча разъехаться с
`--s1..--s8`. Новых зависимостей нет, гейт идёт через уже обязательный шаг CI `npm run lint`.
Шкала §3 получила ступень `unit` (10.5px, без трекинга). Спека —
[`superpowers/specs/2026-08-04-y5j-i18n-style-gates-design.md`](superpowers/specs/2026-08-04-y5j-i18n-style-gates-design.md).
```

- [ ] **Шаг 2: Финальная сверка всех гейтов с корня**

Run: `npm run build && npm run typecheck && npm run lint && npm test`
Expected: всё зелёное; тестов 1078.

Это ровно та последовательность, которую гоняет CI (`.github/workflows/ci.yml:28-31`) — мерж в `main` уходит на прод немедленно (ADR 023).

- [ ] **Шаг 3: Коммит**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): interface gates (LKWkalk-y5j)"
```

- [ ] **Шаг 4: Закрыть задачу в beads**

```bash
bd close LKWkalk-y5j --reason "Два eslint-правила (no-untranslated-text, no-off-scale-typography) + сторож палитры; ступень unit в шкале; 5 правок кода. Гейт идёт через npm run lint в CI."
```

Если по ходу работы обнаружилось что-то за рамками плана — не чинить молча и не оставлять TODO: `bd create` и связать зависимостью.
