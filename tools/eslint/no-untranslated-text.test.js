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
    // Идиома репозитория: {' '} — разрыв пробела между инлайн-элементами, не текст (HAS_WORD).
    { code: 'const a = <div>{\' \'}</div>;' },
    // Принцип «нет букв и цифр» действует и в контейнере-ребёнке, не только в JSXText/атрибутах.
    { code: 'const a = <div>{\'×\'}</div>;' },
    // Исключение aria-hidden действует и на контейнер-ребёнок.
    { code: 'const a = <span aria-hidden="true">{\'i\'}</span>;' },
    // text — не в TEXT_PROPS до находки 1; переменная/tt(...) остаётся вне видимости правила.
    { code: 'const a = <InfoHint text={tt("k")} />;' },
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
    // Асимметрия намеренная: aria-hidden прячет от скринридера, но не от глаз —
    // placeholder и title в спрятанном поддереве пользователь по-прежнему читает.
    {
      code: 'const a = <div aria-hidden="true"><input placeholder="Suchen" /></div>;',
      errors: [{ messageId: 'hardcoded' }],
    },
    // Находка 2: строка-ребёнок в фигурных скобках — тот же самый текст в разметке.
    {
      code: 'const a = <div>{\'Details\'}</div>;',
      errors: [{ messageId: 'hardcoded', data: { text: 'Details' } }],
    },
    {
      code: 'const a = <div>{`Details: ${n}`}</div>;',
      errors: [{ messageId: 'hardcoded', data: { text: 'Details:' } }],
    },
    // Находка 1: InfoHint.text — самый переводоёмкий проп репозитория, пропущен в TEXT_PROPS.
    {
      code: 'const a = <InfoHint text="Hinweis" />;',
      errors: [{ messageId: 'hardcoded', data: { text: 'Hinweis' } }],
    },
  ],
});
